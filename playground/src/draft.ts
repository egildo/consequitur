// The line being composed. A draft is plain data in the page's state; what it
// sends is deduced from it (`lineOf`). Its composer is one element, built when the
// draft opens and never again while it is open, because its inputs hold the
// caret: after that `sync` writes a control only when it differs, and redraws only
// the preview, the refusal and the parts the state alone decides.

import { inOrder, type Check, type EventLine, type Json, type LineDraft, type LineId, type Payload, type Writer } from 'consequitur';
import { dragLink } from './pointing.ts';
import { keyOfCheck, type Derived } from './deduce.ts';
import { chip, h } from './dom.ts';
import { domain, valueIn, type Field, type GistUi, type GoalOutcome, type OutcomeField } from './domain.ts';
import { renderMarkdown, tokensOf } from './markdown.ts';
import { pickDocument, pickPerson } from './pickers.ts';
import type { Draft, GoalForm, Linking, ShownRefusal } from './state.ts';
import { checkSentence, documentSubject, lineLabel, NOTE_PLACEHOLDER, uiOf, usersOf, writerName, type Preview } from './ui-schema.ts';

/** The name a goal starts with, and the one it falls back to when left empty. */
const GOAL_NAME = 'Traguardo';

/** The lines a draft's reference may name: a revoking gist's targets, otherwise the lines in force of the gists it lists. */
export function candidatesOf(derived: Derived, gist: string): EventLine[] {
  const refer = uiOf(gist)?.compose?.refer;
  if (!refer) return [];
  const targets = derived.offers.find((offer) => offer.gist === gist)?.targets;
  const ids = new Set(targets ?? derived.reading.inForce);
  return inOrder(derived.thread.lines).filter((line) => ids.has(line.id) && (targets !== undefined || refer.gists.includes(line.gist)));
}

let opened = 0;

/** What an input with options offers: each value with the words a person reads. */
const optionsOf = (field: Field): Array<{ value: string; label: string }> =>
  field.options === 'people' ? domain().people.map((p) => ({ value: p.id, label: p.name })) : (field.options ?? []).map((o) => ({ value: o, label: o }));

/** The value a field of a goal's outcome starts on. */
function startOf(field: OutcomeField): string {
  if (field.kind === 'choice') return field.options[0];
  return field.kind === 'person' ? domain().people[0].id : '';
}

/** What each field of every outcome of the domain starts on, and, for `given`, what the outcome `doing` was given. */
function valuesOf(doing: GoalOutcome, given: Payload): Record<string, string> {
  const values = Object.fromEntries(domain().goals!.outcomes.flatMap((o) => o.with ?? []).map((field) => [field.key, startOf(field)]));
  for (const field of doing.with ?? []) {
    const value = given[field.key];
    if (field.kind === 'person') values[field.key] = usersOf(value)[0] ?? startOf(field);
    else if (typeof value === 'string' && (field.kind === 'text' || field.options.includes(value))) values[field.key] = value;
  }
  return values;
}

/**
 * A new goal draft. A goal starts with no condition and the first name «Traguardo N»
 * no goal in force holds; the wrapper starts as its own name. With `from` the
 * draft takes that goal's place: it starts as that goal, and sending it revokes that goal first.
 */
export function newGoalDraft(derived: Derived, options: { role?: 'completion'; from?: EventLine } = {}): Draft {
  const { from } = options;
  const config = domain().goals!;
  const role = from ? (from.payload.role === 'completion' ? 'completion' : null) : (options.role ?? null);
  let goal: GoalForm;
  if (from) {
    const { payload } = from;
    const given = payload.with !== null && typeof payload.with === 'object' && !Array.isArray(payload.with) ? payload.with : {};
    const doing = config.outcomes.find((o) => o.then === payload.then) ?? config.outcomes[0];
    goal = {
      name: typeof payload.name === 'string' ? payload.name : GOAL_NAME,
      then: doing.then,
      values: valuesOf(doing, given),
      final: payload.final === true,
      checks: Array.isArray(payload.checks) ? (payload.checks as unknown as Check[]) : [],
      role,
      replaces: from.id,
    };
  } else {
    const names = new Set(derived.goals.map((g) => g.goal.name));
    let n = 1;
    while (names.has(`${GOAL_NAME} ${n}`)) n++;
    const [doing] = config.outcomes;
    goal = { name: role ? (config.wrapper?.name ?? GOAL_NAME) : `${GOAL_NAME} ${n}`, then: doing.then, values: valuesOf(doing, {}), final: false, checks: [], role, replaces: null };
  }
  return { id: ++opened, gist: domain().goalGist!, fields: {}, text: '', ref: null, pick: null, goal };
}

/** A new draft for `gist`, or null when the gist is not composed by hand. */
export function newDraft(gist: string, derived: Derived, ref?: LineId): Draft | null {
  if (gist === domain().goalGist) return newGoalDraft(derived);
  const id = ++opened;
  const compose = uiOf(gist)?.compose;
  if (!compose) return null;
  // a field starts on what it says, or on what the thread holds, or on its first option, so what it shows is what is sent
  const fields: Record<string, string> = {};
  for (const field of compose.fields ?? []) {
    const held = field.current === undefined ? undefined : valueIn(derived.reading.expected, field.current);
    const start = field.initial ?? (typeof held === 'string' ? held : undefined) ?? optionsOf(field)[0]?.value;
    if (start !== undefined) fields[field.key] = start;
  }
  // a reference that must be given starts on the newest candidate, so what the select shows is what is sent
  const given = ref ?? (compose.refer && !compose.refer.optional ? candidatesOf(derived, gist).at(-1)?.id : undefined);
  return { id, gist, fields, text: '', ref: given ?? null, pick: null, goal: null };
}

/** The payload a draft hands to the server. Pure: an empty field, an empty list and a null reference are left out. */
export function payloadOf(draft: Draft, ui: GistUi, writer: Writer): Payload {
  const compose = ui.compose ?? {};
  const payload: Payload = {};

  if (compose.body) {
    const text = draft.text.trim();
    if (text) payload[compose.body] = text;
  }

  const id = writer.slice(writer.indexOf('::') + 2);
  if (compose.atoms) {
    const { users, document } = tokensOf(draft.text);
    if (compose.atoms.mention) {
      const own = compose.self === compose.atoms.mention ? [id] : [];
      const list = [...new Set([...own, ...users])];
      if (list.length) payload[compose.atoms.mention] = list;
    }
    if (compose.atoms.document && document !== undefined) payload[compose.atoms.document] = document;
  }
  // the writer's own name, under a key of its own
  if (compose.self !== undefined && compose.self !== compose.atoms?.mention) payload[compose.self] = [id];

  for (const { key } of compose.fields ?? []) {
    const value = draft.fields[key]?.trim();
    if (value) payload[key] = value;
  }
  if (compose.refer && draft.ref !== null) payload[compose.refer.key] = draft.ref;
  if (compose.pick && draft.pick) {
    payload[compose.pick.document] = draft.pick.code;
    if (compose.pick.direction && draft.pick.direction) payload[compose.pick.direction] = draft.pick.direction;
  }
  if (compose.stamp) {
    const part = payload[compose.stamp.of];
    if (typeof part === 'string') payload[compose.stamp.key] = `${part}:${id}`;
  }
  return payload;
}

/** What a goal posts: its conditions as the checks, its name, what it does when met, and whether that is final. */
export function goalPayload(goal: GoalForm): Payload {
  const payload: Payload = { name: goal.name.trim() || GOAL_NAME, then: goal.then, checks: goal.checks as unknown as Json };
  const given: Payload = {};
  for (const field of domain().goals!.outcomes.find((o) => o.then === goal.then)?.with ?? []) {
    const value = (goal.values[field.key] ?? '').trim();
    if (field.kind === 'person') given[field.key] = [value];
    else if (value !== '') given[field.key] = value;
  }
  if (Object.keys(given).length > 0) payload.with = given;
  if (goal.final) payload.final = true;
  // a free key: the core reads none of it
  if (goal.role) payload.role = goal.role;
  return payload;
}

/** The line «Invia» builds from a draft, or null when its gist is unknown. */
export function lineOf(draft: Draft, writer: Writer): LineDraft | null {
  const ui = uiOf(draft.gist);
  if (!ui) return null;
  return { gist: ui.gist, writer, payload: draft.goal ? goalPayload(draft.goal) : payloadOf(draft, ui, writer) };
}

/** What the composer draws from the page: its draft, and what the page knows around it. */
export interface ComposerView {
  draft: Draft;
  writer: Writer;
  derived: Derived;
  pending: boolean;
  refusal: ShownRefusal | null;
  /** Already marked `stale` when the draft changed since it was worked out. */
  preview: Preview | null;
  /** What sending the draft does besides its line, for the page to say under the preview. */
  note: string | null;
}

export interface ComposerHandlers {
  /** Writes parts of the draft. */
  patch(change: Partial<Draft>): void;
  send(): void;
  cancel(): void;
  link(linking: Linking | null): void;
}

export interface Composer {
  id: number;
  el: HTMLElement;
  focus(): void;
  sync(view: ComposerView): void;
}

const DIRECTION_WORDS = { inbound: 'in entrata', outbound: 'in uscita' } as const;

/** The verdicts of a refusal and the preview's, as the list a person reads: red for a law that refuses, amber for one that asks to confirm. */
const verdictItems = (verdicts: Preview['verdicts']): HTMLElement[] =>
  verdicts.map(({ strength, text }) => h('li', { class: strength === 'refuse' ? 'is-refuse' : 'is-confirm' }, text));

/** The block under a draft's header, and what it holds for a preview. */
function drawPreview(element: HTMLElement, preview: Preview | null): void {
  const empty = !preview || (preview.failed === undefined && preview.unsent === undefined && preview.happens.length === 0 && preview.verdicts.length === 0);
  element.hidden = empty;
  element.classList.toggle('is-stale', preview?.stale === true);
  if (empty) return element.replaceChildren();
  if (preview.failed !== undefined) return element.replaceChildren(h('p', { class: 'preview-unsent' }, `Anteprima non disponibile: ${preview.failed}`));
  if (preview.unsent !== undefined) return element.replaceChildren(h('p', { class: 'preview-unsent' }, `Non ancora inviabile: ${preview.unsent}`));
  element.replaceChildren(
    h('p', { class: 'preview-label' }, 'Succederà:'),
    h('ul', { class: 'preview-list' }, ...preview.happens.map((text) => h('li', null, text)), ...verdictItems(preview.verdicts)),
  );
}

/** The refusal's block: its words, then the sentences of the laws it names. */
function drawRefusal(element: HTMLElement, refusal: ShownRefusal | null): void {
  element.hidden = refusal === null;
  element.title = refusal?.detail ?? '';
  element.replaceChildren(
    ...(refusal ? [h('p', null, refusal.words), ...(refusal.verdicts.length ? [h('ul', { class: 'preview-list' }, ...verdictItems(refusal.verdicts))] : [])] : []),
  );
}

/** What the send button reads: a draft whose last preview asks for confirmation is sent with «Conferma e invia». */
const sendWords = (preview: Preview | null): string => (preview?.confirm && !preview.stale ? 'Conferma e invia' : 'Invia');

type Control = HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement;

/** What every composer has: who writes, the pending mark, «Annulla» and «Invia», the refusal and the preview. */
function frame(title: string, handlers: ComposerHandlers) {
  const as = h('span', { class: 'draft-as' });
  const status = h('span', { class: 'draft-status', hidden: '' }, 'In attesa…');
  const refusal = h('div', { class: 'draft-refusal', role: 'alert', hidden: '' });
  const preview = h('div', { class: 'draft-preview', hidden: '' });
  const controls: Control[] = [];
  // what was last drawn: the preview and the refusal are drawn again only when they are new
  let drawnPreview: Preview | null | undefined;
  let drawnRefusal: ShownRefusal | null | undefined;

  // a button of the composer must not take the text's focus, or its caret would be lost
  const button = (label: string, run: () => void, attrs: Record<string, string> = {}): HTMLButtonElement => {
    const element = h('button', { type: 'button', class: 'action', ...attrs }, label);
    element.addEventListener('mousedown', (event) => event.preventDefault());
    element.addEventListener('click', run);
    controls.push(element);
    return element;
  };
  const submit = button('Invia', handlers.send, { class: 'offer draft-send' });
  const cancel = button('Annulla', handlers.cancel, { class: 'offer' });
  const top = h('div', { class: 'draft-top' }, h('span', { class: 'card-title' }, title), as, status, h('div', { class: 'draft-actions' }, cancel, submit));

  return {
    top,
    refusal,
    preview,
    controls,
    button,
    draw(view: ComposerView): void {
      as.textContent = `Scrivi come ${writerName(view.writer)}`;
      status.hidden = !view.pending;
      for (const control of controls) control.disabled = view.pending;
      if (view.refusal !== drawnRefusal) drawRefusal(refusal, (drawnRefusal = view.refusal));
      if (view.preview !== drawnPreview) {
        drawPreview(preview, (drawnPreview = view.preview));
        submit.textContent = sendWords(view.preview);
      }
    },
  };
}

/** A control's value is written only when it differs, or typing into it would lose the caret. */
const write = (control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void => {
  if (control.value !== value) control.value = value;
};

function lineComposer(first: Draft, ui: GistUi, handlers: ComposerHandlers): Composer {
  const compose = ui.compose ?? {};
  const f = frame(ui.label, handlers);
  let current = first;
  let pending = false;
  let derivedSeen: Derived | undefined;
  let anteprimaOf: string | undefined;
  // set while the page itself puts text in, which a text that takes only tokens would otherwise refuse
  let own = false;

  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const slots: HTMLElement[] = [];
  for (const field of compose.fields ?? []) {
    const { key, label } = field;
    const options = field.options === undefined ? undefined : optionsOf(field);
    const input = options ? h('select', { class: 'draft-select is-short' }, ...options.map((o) => h('option', { value: o.value }, o.label))) : h('input', { type: 'text', class: 'draft-input' });
    input.addEventListener(options ? 'change' : 'input', () => handlers.patch({ fields: { ...current.fields, [key]: input.value } }));
    inputs.set(key, input);
    f.controls.push(input);
    slots.push(h('label', { class: 'draft-field' }, h('span', { class: 'draft-label' }, label), input));
  }

  let select: HTMLSelectElement | null = null;
  if (compose.refer) {
    const chosen = (select = h('select', { class: 'draft-select' }));
    chosen.addEventListener('change', () => handlers.patch({ ref: chosen.value === '' ? null : chosen.value }));
    f.controls.push(chosen);
    // pressed and dragged onto a card, the handle draws the band and fills the slot
    const handle = h('button', { type: 'button', class: 'action draft-handle', title: 'Trascina su una riga', 'aria-label': 'Indica una riga trascinando' }, '⤳');
    handle.addEventListener('pointerdown', (event) => {
      if (pending || !derivedSeen) return;
      const candidates = candidatesOf(derivedSeen, current.gist).map((line) => line.id);
      void dragLink(handle, event, candidates, handlers.link, (id) => handlers.patch({ ref: id }));
    });
    f.controls.push(handle);
    slots.push(h('div', { class: 'draft-field' }, h('label', { class: 'draft-field' }, h('span', { class: 'draft-label' }, 'Riferita a'), chosen), handle));
  }

  const picked = h('span', { class: 'draft-picked' });
  if (compose.pick) {
    const { direction } = compose.pick;
    slots.push(
      h(
        'div',
        { class: 'draft-field' },
        f.button('Scegli documento', () => {
          void pickDocument(direction !== undefined).then((answer) => {
            if (answer) handlers.patch({ pick: answer });
          });
        }),
        picked,
      ),
    );
  }

  const hasText = compose.body !== undefined || compose.atoms !== undefined;
  const placeholder = compose.bodyOptional
    ? NOTE_PLACEHOLDER
    : compose.atoms?.mention
      ? compose.body !== undefined
        ? 'Scrivi qui. Con @ aggiungi una persona.'
        : 'Con @ aggiungi una persona.'
      : 'Scrivi qui.';
  const text = h('textarea', { class: 'draft-text', rows: '3', spellcheck: 'true', placeholder });
  const anteprima = h('div', { class: 'draft-anteprima', hidden: '' }, h('p', { class: 'draft-label' }, 'Anteprima'));
  const anteprimaText = h('div', { class: 'card-text' });
  anteprima.append(anteprimaText);

  const grow = (): void => {
    text.style.height = 'auto';
    if (text.scrollHeight > 0) text.style.height = `${text.scrollHeight}px`;
  };

  /**
   * Puts `insertion` in place of the text from `start` to `end`, through the browser's own editing so that undo
   * keeps working, and leaves the caret right after it, wherever the focus coming back from a dialog put it.
   */
  function put(insertion: string, start: number, end: number): void {
    own = true;
    try {
      text.focus();
      text.setSelectionRange(start, end);
      const done = insertion === '' ? document.execCommand?.('delete') : document.execCommand?.('insertText', false, insertion);
      if (!done) {
        text.setRangeText(insertion, start, end, 'end');
        text.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } finally {
      own = false;
    }
    text.setSelectionRange(start + insertion.length, start + insertion.length);
  }

  /** A token in place of `start` to `end`, set off from the words around it, which a token must be. */
  function putToken(token: string, start: number, end: number): void {
    const before = text.value[start - 1];
    const after = text.value[end];
    put(`${before !== undefined && /\w/.test(before) ? ' ' : ''}${token}${after !== undefined && /\s/.test(after) ? '' : ' '}`, start, end);
  }

  async function addPerson(start: number, end: number): Promise<void> {
    const user = await pickPerson();
    if (text.value.slice(start, end) !== '@') return;
    // an answer replaces the `@` that asked for it; a dismissal takes it away
    if (user === null) put('', start, end);
    else putToken(`@${user}`, start, end);
  }

  /** Asks through `pick`, and puts what it answers where the caret, or the selection, was when it was asked: a dialog moves the focus and with it the selection. */
  async function addAtCaret<T>(pick: () => Promise<T | null>, tokenOf: (answer: T) => string): Promise<void> {
    const { selectionStart: start, selectionEnd: end } = text;
    const answer = await pick();
    if (answer === null) {
      text.focus();
      text.setSelectionRange(start, end);
    } else putToken(tokenOf(answer), start, end);
  }

  function wrap(mark: string): void {
    const { selectionStart: start, selectionEnd: end } = text;
    put(`${mark}${text.value.slice(start, end)}${mark}`, start, end);
    if (start === end) text.setSelectionRange(start + mark.length, start + mark.length);
  }

  text.addEventListener('input', (event) => {
    grow();
    handlers.patch({ text: text.value });
    const typed = event as InputEvent;
    if (compose.atoms?.mention && typed.inputType === 'insertText' && typed.data === '@') void addPerson(text.selectionStart - 1, text.selectionStart);
  });
  if (compose.body === undefined) {
    // a line with no body keeps only what its tokens say, so typed text would be dropped on sending
    text.addEventListener('beforeinput', (event) => {
      const typed = event as InputEvent;
      if (!own && typed.inputType.startsWith('insert') && typed.data !== '@') event.preventDefault();
    });
  }
  text.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || compose.body === undefined || compose.bodyOptional) return;
    if (event.key === 'b' || event.key === 'i') {
      event.preventDefault();
      wrap(event.key === 'b' ? '**' : '_');
    }
  });
  // the text is not among the controls a post disables, which would take its focus: `sync` makes it read-only instead

  const tools: HTMLElement[] = [];
  if (compose.body !== undefined && !compose.bodyOptional) {
    tools.push(f.button('B', () => wrap('**'), { class: 'action draft-bold', title: 'Grassetto' }), f.button('I', () => wrap('_'), { class: 'action draft-italic', title: 'Corsivo' }));
  }
  if (compose.atoms?.mention) tools.push(f.button('Persona', () => void addAtCaret(pickPerson, (user) => `@${user}`)));
  if (compose.atoms?.document) tools.push(f.button('Documento', () => void addAtCaret(() => pickDocument(false), (answer) => `#${answer.code}`)));

  const el = h(
    'section',
    { class: compose.bodyOptional ? 'draft is-note' : 'draft' },
    h('header', { class: 'draft-head' }, f.top, slots.length ? h('div', { class: 'draft-slots' }, ...slots) : null, tools.length ? h('div', { class: 'draft-tools' }, ...tools) : null, f.refusal, f.preview),
    hasText ? text : null,
    hasText ? anteprima : null,
  );

  return {
    id: first.id,
    el,
    focus() {
      if (compose.fields?.length) el.querySelector<HTMLElement>('.draft-head input, .draft-head select')?.focus();
      else if (hasText) text.focus();
    },
    sync(view) {
      current = view.draft;
      pending = view.pending;
      f.draw(view);
      el.classList.toggle('is-pending', pending);

      for (const [key, input] of inputs) write(input, current.fields[key] ?? '');

      if (select && view.derived !== derivedSeen) {
        const optional = compose.refer?.optional === true;
        const candidates = candidatesOf(view.derived, current.gist);
        select.replaceChildren(
          ...(optional || candidates.length === 0 ? [h('option', { value: '' }, '—')] : []),
          ...candidates.map((line) => h('option', { value: line.id }, lineLabel(line))),
        );
      }
      derivedSeen = view.derived;
      if (select) select.value = current.ref ?? '';

      const { pick } = current;
      picked.replaceChildren(
        ...(pick ? [chip([pick.code, documentSubject(pick.code), pick.direction && DIRECTION_WORDS[pick.direction]].filter(Boolean).join(' · '), 'document')] : []),
      );

      // the text waits too: what is typed while the line is on its way would be lost when it closes the draft
      text.readOnly = pending;
      if (text.value !== current.text) {
        text.value = current.text;
        grow();
      }
      if (anteprimaOf !== current.text) {
        anteprimaOf = current.text;
        anteprima.hidden = current.text.trim() === '';
        anteprimaText.replaceChildren(renderMarkdown(current.text));
      }
    },
  };
}

/** The control of one field of a goal's outcome: a select for a choice and for a person, an input for a text. */
function outcomeControl(field: OutcomeField): HTMLInputElement | HTMLSelectElement {
  if (field.kind === 'text') return h('input', { type: 'text', class: 'draft-input', placeholder: field.placeholder });
  const options = field.kind === 'choice' ? field.options.map((o) => ({ value: o, label: o })) : domain().people.map((p) => ({ value: p.id, label: p.name }));
  return h('select', { class: 'draft-select is-short' }, ...options.map((o) => h('option', { value: o.value }, o.label)));
}

/** The goal being composed: its name, «Fatto quando:» and its conditions, then what it does and whether that is final. */
function goalComposer(first: Draft, handlers: ComposerHandlers): Composer {
  const wrapper = first.goal?.role === 'completion';
  const f = frame(`${first.goal?.replaces ? 'Cambia' : 'Nuovo'} ${wrapper ? 'completamento' : 'traguardo'}`, handlers);
  let current = first;
  let conditionsOf: string | undefined;

  const outcomes = domain().goals!.outcomes;
  const name = h('input', { type: 'text', class: 'draft-input' });
  const outcome = h('select', { class: 'draft-select is-short' }, ...outcomes.map(({ then, label }) => h('option', { value: then }, label)));
  // each outcome's fields have a control, shown while the outcome is the one chosen
  const given = outcomes.flatMap((o) => (o.with ?? []).map((field) => ({ then: o.then, field, control: outcomeControl(field) })));
  const final = h('input', { type: 'checkbox' });
  const hint = h('p', { class: 'draft-hint' }, wrapper ? 'Indica sui traguardi, o sulle schede, che cosa attendere.' : 'Indica sulle schede che cosa attendere.');
  const note = h('p', { class: 'draft-note', hidden: '' });
  const conditions = h('div', { class: 'goal-conditions' });

  // each control writes its part of the goal; `sync` writes a control only when it differs, so typing keeps its caret
  const patch = (change: Partial<GoalForm>): void => handlers.patch({ goal: { ...current.goal!, ...change } });
  name.addEventListener('input', () => patch({ name: name.value }));
  outcome.addEventListener('change', () => patch({ then: outcome.value }));
  for (const { field, control } of given) control.addEventListener(field.kind === 'text' ? 'input' : 'change', () => patch({ values: { ...current.goal!.values, [field.key]: control.value } }));
  final.addEventListener('change', () => patch({ final: final.checked }));
  f.controls.push(name, outcome, ...given.map(({ control }) => control), final);

  const el = h(
    'section',
    { class: 'draft goal-draft' },
    h('header', { class: 'draft-head' }, f.top, h('label', { class: 'draft-field' }, h('span', { class: 'draft-label' }, 'Nome'), name), h('p', { class: 'draft-label' }, 'Fatto quando:'), hint, f.refusal),
    conditions,
    h(
      'footer',
      { class: 'goal-draft-foot' },
      h('div', { class: 'draft-slots' }, h('span', { class: 'draft-label' }, '→ allora:'), outcome, ...given.map(({ control }) => control)),
      h('label', { class: 'draft-check' }, final, h('span', null, 'Definitivo: non si potrà riaprire')),
      f.preview,
      note,
    ),
  );

  return {
    id: first.id,
    el,
    focus() {},
    sync(view) {
      current = view.draft;
      const goal = current.goal!;
      f.draw(view);
      el.classList.toggle('is-pending', view.pending);
      note.hidden = view.note === null;
      if (view.note !== null && note.textContent !== view.note) note.textContent = view.note;

      write(name, goal.name);
      write(outcome, goal.then);
      for (const { then, field, control } of given) {
        write(control, goal.values[field.key] ?? '');
        control.hidden = goal.then !== then;
      }
      if (final.checked !== goal.final) final.checked = goal.final;
      hint.hidden = goal.checks.length > 0;

      const lines = view.derived.thread.lines;
      const key = `${lines.length}\n${goal.checks.map(keyOfCheck).join('\n')}`;
      if (key !== conditionsOf) {
        conditionsOf = key;
        conditions.replaceChildren(
          ...goal.checks.map((check: Check, index) => {
            const remove = h('button', { type: 'button', class: 'condition-remove', title: 'Togli la condizione', 'aria-label': 'Togli la condizione' }, '×');
            remove.addEventListener('click', () => patch({ checks: current.goal!.checks.filter((_, i) => i !== index) }));
            return h('div', { class: 'condition' }, h('span', { class: 'tick' }, '○'), h('span', { class: 'condition-text' }, checkSentence(check, lines)), remove);
          }),
        );
      }
      for (const remove of conditions.querySelectorAll('button')) remove.disabled = view.pending;
    },
  };
}

/** The composer of a draft. */
export function createComposer(draft: Draft, handlers: ComposerHandlers): Composer {
  const ui = uiOf(draft.gist);
  return draft.goal ? goalComposer(draft, handlers) : lineComposer(draft, ui ?? { gist: draft.gist, label: draft.gist, card: 'fact' }, handlers);
}
