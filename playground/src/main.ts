// The playground. One `PageState` holds the thread, its reading, the writer and
// the draft; `update` makes the next state and `render` draws the screen from it,
// so the screen is a deduction and nothing is read back out of it except the
// composer's own inputs. Every event either changes the state (the draft, the
// writer, the selection, a toggle) or writes a line, which is what `send` does:
// the page plays the server, and the thread it brings back replaces the old one.

import { dryRun, emptyState, goalWriter, inOrder, post, reduce, type Check, type EventLine, type Json, type LineDraft, type LineId, type Refusal, type Writer } from 'consequitur';
import { previewer } from 'consequitur-render';
import './style.css';
import type { Handlers } from './cards.ts';
import { POLICY, SCHEMA, SYSTEM, valueIn } from './case.ts';
import { derive, keyOfCheck, wrapperFollowing, type Derived, type DockGoal, type LineAction } from './deduce.ts';
import { createDock, type DockHandlers } from './dock.ts';
import { createComposer, lineOf, newDraft, newGoalDraft, type Composer, type ComposerHandlers, type ComposerView } from './draft.ts';
import { h } from './dom.ts';
import { createLedger, type LedgerHandlers } from './ledger.ts';
import { createPanel } from './panel.ts';
import { askSubject } from './pickers.ts';
import { mountBand, point, redraw } from './pointing.ts';
import { HEAD_CHIP, type PageState, type ShownRefusal } from './state.ts';
import { DOCUMENTS, gistLabel, GOAL_LINES, nextDocumentCode, previewOf, REFUSAL_WORDS, resetDocuments, uiOf, verdictsOf, WRITERS, type Preview } from './ui-schema.ts';

const emptyThread = () => emptyState(SCHEMA);

const find = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`thread.html has no #${id}`);
  return element as T;
};

const userOf = (w: Writer): string => w.slice(w.indexOf('::') + 2);

const first = emptyThread();
let state: PageState = {
  thread: first,
  reading: reduce(first.lines, first.handles, SCHEMA),
  writer: 'user::mrossi',
  draft: null,
  preview: null,
  answered: [],
  selected: null,
  lit: null,
  linking: null,
  show: { records: false, goals: false },
  tab: 'activity',
  gist: HEAD_CHIP,
  pending: false,
  refusal: null,
};

const editorWrap = find('editor-wrap');
const editor = find('editor');
const offersEl = find('offers');
const noticeEl = find('notice');
const writerSelect = find<HTMLSelectElement>('writer');
const recordsBox = find<HTMLInputElement>('records');
const goalsBox = find<HTMLInputElement>('goals');
const quitDialog = find<HTMLDialogElement>('quit-dialog');
const panel = createPanel(find('panel'), { onTab: (tab) => update({ tab }), onGist: (gist) => update({ gist }) });
mountBand(find('column'));
find('scroll').addEventListener('scroll', redraw);

// ── the server's part ──

/** A refusal as the page shows it: the words, and the sentences of the laws it names. */
const shownOf = (refusal: Refusal, lines: EventLine[]): ShownRefusal => ({
  words: REFUSAL_WORDS[refusal.code],
  detail: refusal.detail,
  verdicts: verdictsOf(refusal.verdicts ?? [], lines),
});

/**
 * Waits, then asks the server to admit, stamp and judge the draft by the laws. A
 * refusal changes nothing; otherwise the thread and its reading are replaced, the
 * line posted is selected, and `then` is applied in the same update, so a draft
 * closes with the arrival of its line.
 */
async function send(draft: LineDraft, delay = 400, then: Partial<PageState> = {}, confirmed = false): Promise<Refusal | undefined> {
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
  const before = state.thread.lines.length;
  const result = await post(state.thread, draft, SCHEMA, new Date().toISOString(), { confirmed, policy: POLICY });
  if (result.refusal) return result.refusal;
  // the lines after the thread's last are the draft's, then what reconciliation wrote
  const posted = result.state.lines[before];
  // a goal's own bookkeeping is not in the ledger unless asked for: there is no card to select
  const shown = !GOAL_LINES.has(posted.gist) || state.show.goals;
  update({ thread: result.state, reading: result.reading, answered: result.rounds, ...(shown ? { selected: posted.id } : {}), ...then });
  if (shown) reveal(posted.id, 'nearest');
  return undefined;
}

/** Runs a job that posts, with the page waiting for it, and says why when it is refused. */
async function run(job: () => Promise<Refusal | undefined>): Promise<void> {
  if (state.pending) return;
  update({ pending: true, refusal: null });
  let refusal: Refusal | undefined;
  try {
    refusal = await job();
  } finally {
    update({ pending: false, refusal: refusal ? shownOf(refusal, state.thread.lines) : null });
  }
}

/** The document system's part of a signature: a fact, written by the system, saying who signed. */
const signDocument = (document: string, user: string, delay = 400): Promise<Refusal | undefined> =>
  send({ gist: 'doc_signed', writer: SYSTEM, payload: { document, by: user } }, delay);

/**
 * A document made from the activity: the system says it exists, then the writer
 * links it, outbound, about `about` when given. The code is the next one the page
 * has; the document is known to the page before its line arrives, so the card can name it.
 */
async function createDocument(subject: string, as: Writer, about?: LineId, delay = 400): Promise<Refusal | undefined> {
  const document = nextDocumentCode();
  DOCUMENTS.push({ code: document, subject });
  const made = await send({ gist: 'doc_created', writer: SYSTEM, payload: { document, subject } }, delay);
  if (made) {
    DOCUMENTS.pop();
    return made;
  }
  return send({ gist: 'doc_ref', writer: as, payload: { document, direction: 'outbound', ...(about ? { about } : {}) } }, delay);
}

/** «Nuovo documento»: asks for the subject, then makes the document. */
async function newDocument(about?: LineId): Promise<void> {
  if (state.pending) return;
  const subject = await askSubject();
  if (subject !== null) await run(() => createDocument(subject, state.writer, about));
}

// ── the question before leaving ──

// the answer is given by the submit and not by the dialog's closing, which waits for a repaint
let answerQuit: ((quit: boolean) => void) | undefined;
quitDialog.querySelector('form')!.addEventListener('submit', (event) => {
  const { submitter } = event as SubmitEvent;
  answerQuit?.(submitter instanceof HTMLButtonElement && submitter.value === 'quit');
});
quitDialog.addEventListener('close', () => answerQuit?.(false));

function ask(message: string): Promise<boolean> {
  find('quit-text').textContent = message;
  return new Promise((resolve) => {
    answerQuit = resolve;
    quitDialog.showModal();
  });
}

// ── what a line will cause ──

// After the draft has rested, the dry run says what sending it would do. The answer is advice:
// the authority judges again on sending. `previewer` runs it, drops an answer that arrives for an
// older draft, and says whether the one on screen answers the draft as it is.

// the line the draft would send, with the thread's length: it changes when the answer would
let draftKey = '';

// one dimmed copy per answer, so the composer can tell that nothing changed
const dimmed = new WeakMap<Preview, Preview>();
const dim = (answer: Preview): Preview => {
  let copy = dimmed.get(answer);
  if (!copy) dimmed.set(answer, (copy = { ...answer, stale: true }));
  return copy;
};

const previews = previewer<LineDraft, Preview>({
  keyOf: (line) => JSON.stringify([line, state.thread.lines.length]),
  run: async (line) => previewOf(await dryRun(state.thread, line, SCHEMA, new Date().toISOString(), { policy: POLICY }), line.gist),
  show: (answer, fresh) => update({ preview: answer && (fresh ? answer : dim(answer)) }),
});

// ── the draft ──

function openDraft(gist: string, ref?: LineId): void {
  const draft = newDraft(gist, derive(state.thread, state.reading, state.writer), ref);
  if (draft) update({ draft, refusal: null });
}

/** «Invia» of the open draft: the line goes out, and the draft closes with its arrival or shows why it was refused. */
async function sendDraft(): Promise<void> {
  const { draft } = state;
  const ui = draft && uiOf(draft.gist);
  const line = draft && lineOf(draft, state.writer);
  if (state.pending || !ui || !line) return;
  const question = ui.compose?.confirmWhileOpen;
  if (question && valueIn(state.thread.handles, 'status') === 'open' && !(await ask(question))) return;
  // only what the writer was shown confirms: a preview of an older draft does not
  const shown = previews.current();
  const confirmed = shown !== null && shown.fresh && shown.answer.confirm;
  const replaced = draft.goal?.replaces ? state.thread.lines.find((l) => l.id === draft.goal!.replaces) : undefined;
  update({ pending: true, refusal: null });
  try {
    const refusal = replaced ? await replaceGoal(replaced, draft.id, line, confirmed) : await send(line, 400, { draft: null, preview: null }, confirmed);
    if (refusal) update({ refusal: shownOf(refusal, state.thread.lines) });
  } finally {
    update({ pending: false });
  }
}

// ── the goals ──

/** «Imposta un traguardo», «Imposta il completamento» and «Cambia» open a goal draft, which lives in the dock. */
function openGoal(options?: Parameters<typeof newGoalDraft>[1]): void {
  if (state.pending) return;
  update({ draft: newGoalDraft(derive(state.thread, state.reading, state.writer), options), refusal: null });
}

const revokeGoal = (goal: EventLine, delay: number): Promise<Refusal | undefined> =>
  send({ gist: 'set_goal_revoke', writer: state.writer, payload: { target: goal.id } }, delay);

/**
 * The wrapper written again after a goal it awaits was replaced (`replacement`) or
 * removed (none): a line cannot be edited, so it is revoked and written anew, with the
 * condition on that goal moved to the new one or, with no new one, dropped. With no
 * condition left only the revoke is written.
 */
async function rewriteWrapper(wrapper: EventLine, old: EventLine, replacement: EventLine | undefined, delay: number): Promise<Refusal | undefined> {
  const was = goalWriter(old.id);
  const checks = (wrapper.payload.checks as unknown as Check[]).flatMap((check): Check[] =>
    check.writer !== was ? [check] : replacement ? [{ ...check, gist: String(replacement.payload.then), writer: goalWriter(replacement.id) }] : [],
  );
  const revoked = await revokeGoal(wrapper, delay);
  if (revoked || checks.length === 0) return revoked;
  return send({ gist: 'set_goal', writer: state.writer, payload: { ...wrapper.payload, checks: checks as unknown as Json } }, delay);
}

/**
 * «Cambia»: the old goal is revoked and the new goal written, two lines; when the
 * old goal is awaited by the wrapper, the wrapper follows. A refusal of the second
 * leaves the first standing, and the draft open, now taking no goal's place: that goal is gone.
 */
async function replaceGoal(old: EventLine, draftId: number, next: LineDraft, confirmed: boolean, delay = 400): Promise<Refusal | undefined> {
  const wrapper = wrapperFollowing(derive(state.thread, state.reading, state.writer), old.id);
  const revoked = await revokeGoal(old, delay);
  if (revoked) return revoked;
  if (state.draft?.id === draftId && state.draft.goal) update({ draft: { ...state.draft, goal: { ...state.draft.goal, replaces: null } } });
  const before = state.thread.lines.length;
  const made = await send(next, delay, { draft: null, preview: null }, confirmed);
  if (made) return made;
  return wrapper ? rewriteWrapper(wrapper.line, old, state.thread.lines[before], delay) : undefined;
}

/** «Rimuovi»: the goal is revoked, and the wrapper that awaited it follows. */
const removeGoal = (goal: EventLine, delay = 400): Promise<Refusal | undefined> => {
  const wrapper: DockGoal | undefined = wrapperFollowing(derive(state.thread, state.reading, state.writer), goal.id);
  return revokeGoal(goal, delay).then((revoked) => revoked ?? (wrapper ? rewriteWrapper(wrapper.line, goal, undefined, delay) : undefined));
};

const composerHandlers: ComposerHandlers = {
  patch(change) {
    if (state.draft) update({ draft: { ...state.draft, ...change } });
  },
  send: () => void sendDraft(),
  cancel: () => update({ draft: null, refusal: null }),
  link: (linking) => update({ linking }),
};

// ── the ledger ──

/** Scrolls the card of a line into view; a scroll event may come late, or not at all while the page is hidden. */
function reveal(id: LineId, block: ScrollLogicalPosition): void {
  document.querySelector<HTMLElement>(`.card[data-line-id="${id}"]`)?.scrollIntoView?.({ block });
  redraw();
}

/** The lines the ledger shows, in reading order. */
const shownLines = (): EventLine[] =>
  inOrder(state.thread.lines).filter((line) => (state.show.records || uiOf(line.gist)?.card !== 'record') && (state.show.goals || !GOAL_LINES.has(line.gist)));

function step(delta: 1 | -1): void {
  const lines = shownLines();
  if (lines.length === 0) return;
  const at = lines.findIndex((line) => line.id === state.selected);
  const next = lines[at < 0 ? (delta > 0 ? 0 : lines.length - 1) : Math.min(lines.length - 1, Math.max(0, at + delta))];
  update({ selected: next.id });
  reveal(next.id, 'nearest');
}

function onAction(action: LineAction, line: EventLine): void {
  if (state.pending) return;
  if (action.command === 'sign') {
    const document = line.payload.document;
    if (typeof document === 'string') void run(() => signDocument(document, userOf(state.writer)));
  } else if (action.command === 'new-document') void newDocument(line.id);
  // a goal's card revokes it as the dock's «Rimuovi» does, so the wrapper follows
  else if (action.gist === 'set_goal_revoke' && line.gist === 'set_goal') void run(() => removeGoal(line));
  else openDraft(action.gist, line.id);
}

function onAwait(check: Check): void {
  const goal = state.draft?.goal;
  if (state.pending || !state.draft || !goal) return;
  if (goal.checks.some((held) => keyOfCheck(held) === keyOfCheck(check))) return;
  update({ draft: { ...state.draft, goal: { ...goal, checks: [...goal.checks, check] } } });
}

const handlers: Handlers & LedgerHandlers & DockHandlers = {
  onGoal: (role) => openGoal(role ? { role } : {}),
  onChange: (line) => openGoal({ from: line }),
  onRemove: (line) => {
    if (!state.pending) void run(() => removeGoal(line));
  },
  onSchema: (gist, id) => update({ selected: id, tab: 'schemas', gist }),
  onAction,
  onAwait,
  onFocus(id) {
    update({ selected: id });
    reveal(id, 'center');
  },
  onLight(id) {
    if (state.lit !== id) update({ lit: id });
  },
  onSelect: (id) => update({ selected: id }),
  onStep: step,
};

const ledger = createLedger(find('ledger'), handlers);
const dock = createDock(find('dock'), handlers);

// ── render ──

let composer: Composer | null = null;
let barOf: Derived | undefined;
let panelOf: (Pick<PageState, 'selected' | 'answered' | 'tab' | 'gist'> & { derived: Derived }) | undefined;

function drawComposer(derived: Derived): void {
  const { draft } = state;
  if (!draft) {
    composer?.el.remove();
    composer = null;
    return;
  }
  // the wrapper follows a replaced goal that it awaits: the preview says so
  const note = draft.goal?.replaces && wrapperFollowing(derived, draft.goal.replaces) ? 'Il completamento verrà aggiornato' : null;
  const view: ComposerView = { draft, writer: state.writer, derived, pending: state.pending, refusal: state.refusal, preview: state.preview, note };
  // a composer is built when its draft opens and never again while it is open: its inputs hold the caret
  if (composer?.id === draft.id) return composer.sync(view);
  composer?.el.remove();
  composer = createComposer(draft, composerHandlers);
  // a goal is composed in the dock, any other line under the ledger
  (draft.goal ? dock.slot : editor).append(composer.el);
  composer.sync(view);
  composer.el.scrollIntoView?.({ block: 'nearest' });
  composer.focus();
}

function drawBar(derived: Derived): void {
  // the goals are the dock's
  const offered = derived.offers.filter(({ gist }) => !GOAL_LINES.has(gist));
  offersEl.replaceChildren(
    h('span', { class: 'offers-label' }, 'Aggiungi:'),
    ...(offered.length
      ? offered.flatMap(({ gist }) => {
          const button = h('button', { class: 'offer', type: 'button' }, gistLabel(gist));
          button.addEventListener('click', () => {
            if (!state.pending) openDraft(gist);
          });
          if (gist !== 'doc_ref') return [button];
          const made = h('button', { class: 'offer', type: 'button' }, 'Nuovo documento');
          made.addEventListener('click', () => void newDocument());
          return [button, made];
        })
      : [h('span', { class: 'panel-empty' }, 'Nessuna riga da scrivere adesso.')]),
  );
}

function render(): void {
  const derived = derive(state.thread, state.reading, state.writer);
  editorWrap.classList.toggle('show-records', state.show.records);
  editorWrap.classList.toggle('show-goals', state.show.goals);
  if (writerSelect.value !== state.writer) writerSelect.value = state.writer;
  if (recordsBox.checked !== state.show.records) recordsBox.checked = state.show.records;
  if (goalsBox.checked !== state.show.goals) goalsBox.checked = state.show.goals;

  ledger.render(state, derived);
  dock.render(state, derived);
  drawComposer(derived);

  // the bar and the panel are drawn again only when what they read changed
  if (barOf !== derived) drawBar((barOf = derived));
  const { selected, answered, tab, gist } = state;
  if (!panelOf || panelOf.derived !== derived || panelOf.selected !== selected || panelOf.answered !== answered || panelOf.tab !== tab || panelOf.gist !== gist) {
    panelOf = { derived, selected, answered, tab, gist };
    panel.render(state, derived);
  }

  // a refusal shows in the open draft, and under the bar when none is open
  const { refusal } = state;
  noticeEl.textContent = refusal && !state.draft ? [refusal.words, ...refusal.verdicts.map((v) => v.text)].join(' ') : '';
  noticeEl.title = refusal && !state.draft ? refusal.detail : '';
}

/** Makes the next state and draws it. */
function update(change: Partial<PageState>): void {
  const next = { ...state, ...change };
  // an answer for another gist is not an answer for this draft
  if (next.preview && next.preview.gist !== next.draft?.gist) next.preview = null;
  // with «Schemi» open, a selected line shows its own gist
  if (change.selected && next.tab === 'schemas') next.gist = next.thread.lines.find((l) => l.id === change.selected)?.gist ?? next.gist;
  state = next;
  render();
  // the previewer answers through `update`: it is told only of a draft that changed
  const line = next.draft ? lineOf(next.draft, next.writer) : null;
  const key = line ? JSON.stringify([line, next.thread.lines.length]) : '';
  if (key !== draftKey) {
    draftKey = key;
    previews.change(line);
  }
}

function reset(): void {
  resetDocuments();
  ledger.clear();
  point(null, null);
    const thread = emptyThread();
  update({
    thread,
    reading: reduce(thread.lines, thread.handles, SCHEMA),
    answered: [],
    draft: null,
    preview: null,
    selected: null,
    lit: null,
    linking: null,
    refusal: null,
  });
}

// ── the examples ──

/** Plays the rows of an example one at a time, with no delay, and says why it stopped when a row is refused. */
async function play(name: string, rows: Array<() => Promise<Refusal | undefined>>): Promise<void> {
  if (state.pending) return;
  update({ pending: true });
  reset();
  try {
    for (const [index, row] of rows.entries()) {
      const refusal = await row();
      if (refusal) {
        console.warn(`playground: the ${name} example stopped at step ${index + 1}`, refusal);
        update({ refusal: shownOf(refusal, state.thread.lines) });
        break;
      }
    }
  } finally {
    update({ pending: false });
  }
}

const user = (id: string): Writer => `user::${id}`;
const lineWhere = (test: (l: EventLine) => boolean): EventLine => state.thread.lines.find(test)!;

/** The scenario of a request for an opinion, one line at a time and with no delay. */
const loadExample = (): Promise<void> => {
  const firstMemo = () => lineWhere((l) => l.gist === 'memo').id;
  return play('first', [
    () => send({ gist: 'create', writer: user('mrossi'), payload: { name: 'Richiesta parere', assignTo: ['mrossi'] } }, 0),
    () => send({ gist: 'memo', writer: user('mrossi'), payload: { text: 'Serve un parere', assignTo: ['lbianchi'] } }, 0),
    () => send({ gist: 'doc_ref', writer: user('lbianchi'), payload: { document: '34132412', direction: 'outbound', about: firstMemo() } }, 0),
    () =>
      send(
        {
          gist: 'set_goal',
          writer: user('mrossi'),
          payload: {
            name: 'done',
            then: 'closed',
            checks: [
              { gist: 'got_it', writer: user('lbianchi'), payload: { about: firstMemo() } },
              { gist: 'doc_signed', kin: 'system', payload: { document: '34132412' } },
            ],
          },
        },
        0,
      ),
    () => send({ gist: 'got_it', writer: user('lbianchi'), payload: { about: firstMemo() } }, 0),
    () => send({ gist: 'quit', writer: user('lbianchi'), payload: {} }, 0),
    () => send({ gist: 'memo', writer: user('mrossi'), payload: { text: 'Ancora una cosa', assignTo: ['lbianchi'] } }, 0),
    () => send({ gist: 'doc_signed', writer: SYSTEM, payload: { document: '34132412', signedAt: '2026-09-30' } }, 0),
  ]);
};

/**
 * A request for an opinion on a contract: a document made from the activity, two
 * goals (one fires, one is warned), signatures by the two who sign, and a wrapper
 * that awaits the first goal and a receipt, and closes it for good. Each step calls what the buttons call and gives its answers directly,
 * with no dialog and no delay; a refusal stops it.
 */
const loadOpinionExample = (): Promise<void> => {
  const memo = () => lineWhere((l) => l.gist === 'memo' && l.writer.startsWith('user::')).id;
  const opinion = () => lineWhere((l) => l.gist === 'doc_created').payload.document as string;
  const minutes = '34133019';
  const goalMemo = () => lineWhere((l) => l.gist === 'memo' && l.writer.startsWith('goal::')).id;
  const firme = () => lineWhere((l) => l.gist === 'set_goal' && l.payload.name === 'Firme').id;
  const signedBy = (document: string, by: string) => ({ gist: 'doc_signed', kin: 'system', payload: { document, by } });
  return play('opinion', [
    () => send({ gist: 'create', writer: user('mrossi'), payload: { name: 'Parere sul contratto arredi', assignTo: ['mrossi'] } }, 0),
    () => send({ gist: 'memo', writer: user('mrossi'), payload: { text: 'Puoi preparare il parere sul contratto?', assignTo: ['lbianchi'] } }, 0),
    () => send({ gist: 'doc_ref', writer: user('mrossi'), payload: { document: '34132412', direction: 'inbound', about: memo(), note: 'Il contratto da esaminare.' } }, 0),
    () => createDocument('Parere legale sul contratto arredi', user('lbianchi'), memo(), 0),
    () =>
      send(
        {
          gist: 'set_goal',
          writer: user('mrossi'),
          payload: {
            name: 'Firme',
            checks: [signedBy(opinion(), 'lbianchi'), signedBy(opinion(), 'mrossi')],
            then: 'memo',
            with: { text: 'Protocolla e invia il parere.', assignTo: ['gverdi'] },
          },
        },
        0,
      ),
    async () =>
      (await send({ gist: 'doc_ref', writer: user('mrossi'), payload: { document: minutes, direction: 'inbound' } }, 0)) ??
      (await send(
        {
          gist: 'set_goal',
          writer: user('mrossi'),
          payload: { name: 'Verbale', checks: [{ gist: 'doc_signed', kin: 'system', payload: { document: minutes } }], then: 'stage', with: { stage: 'firma' } },
        },
        0,
      )) ??
      // unlinking a document a goal awaits is asked to be confirmed
      send({ gist: 'doc_ref_revoke', writer: user('mrossi'), payload: { target: lineWhere((l) => l.gist === 'doc_ref' && l.payload.document === minutes).id } }, 0, {}, true),
    // the wrapper: it awaits the completion of «Firme» and a «Ricevuto» of the one who files, and then closes
    () =>
      send(
        {
          gist: 'set_goal',
          writer: user('mrossi'),
          payload: {
            name: 'Completamento',
            role: 'completion',
            checks: [{ gist: 'memo', writer: goalWriter(firme()) }, { gist: 'got_it', writer: user('gverdi') }],
            then: 'closed',
            final: true,
          },
        },
        0,
      ),
    () => send({ gist: 'comment', writer: user('lbianchi'), payload: { text: 'Bozza pronta, la firmo oggi.' } }, 0),
    () => signDocument(opinion(), 'lbianchi', 0),
    () => signDocument(opinion(), 'mrossi', 0),
    () => send({ gist: 'got_it', writer: user('gverdi'), payload: { about: goalMemo(), note: 'Protocollato e inviato.' } }, 0),
  ]);
};

// ── the bar of the page ──

for (const { writer: value, label } of WRITERS) writerSelect.append(h('option', { value }, label));
writerSelect.addEventListener('change', () => {
  // a draft is written as one person: with another writer it would be someone else's
  update({ writer: writerSelect.value as Writer, draft: null, refusal: null });
});
find('reset').addEventListener('click', () => {
  if (!state.pending) reset();
});
find('example').addEventListener('click', () => void loadExample());
find('example-opinion').addEventListener('click', () => void loadOpinionExample());
recordsBox.addEventListener('change', () => update({ show: { ...state.show, records: recordsBox.checked } }));
goalsBox.addEventListener('change', () => update({ show: { ...state.show, goals: goalsBox.checked } }));

update({});
