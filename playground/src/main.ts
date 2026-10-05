// The playground. One `PageState` holds the thread, its reading, the writer and
// the draft; `update` makes the next state and `render` draws the screen from it,
// so the screen is a deduction and nothing is read back out of it except the
// composer's own inputs. Every event either changes the state (the draft, the
// writer, the selection, a toggle) or writes a line, which is what `send` does:
// the page plays the server, and the thread it brings back replaces the old one.

import { dryRun, emptyState, goalWriter, inOrder, post, reduce, type Check, type EventLine, type Json, type LineDraft, type LineId, type Refusal, type Writer } from 'consequitur';
import { previewer } from 'consequitur-render';
import { playScenario } from '../../cases/scenario.ts';
import './style.css';
import { lightingGone, type Handlers } from './cards.ts';
import { derive, keyOfCheck, wrapperFollowing, type Derived, type DockGoal, type LineAction } from './deduce.ts';
import { createDock, type DockHandlers } from './dock.ts';
import { createComposer, lineOf, newDraft, newGoalDraft, type Composer, type ComposerHandlers, type ComposerView } from './draft.ts';
import { domain, useDomain, valueIn, type Command, type Domain, type Example } from './domain.ts';
import { DOMAINS } from './domains/index.ts';
import { h } from './dom.ts';
import { createLedger, type LedgerHandlers } from './ledger.ts';
import { createPanel } from './panel.ts';
import { askSubject } from './pickers.ts';
import { mountBand, point, redraw } from './pointing.ts';
import { HEAD_CHIP, type PageState, type ShownRefusal } from './state.ts';
import { gistLabel, isGoalLine, previewOf, uiOf, verdictsOf, type Preview } from './ui-schema.ts';

// the page starts in the first domain; `useDomain` is how it changes
useDomain(DOMAINS[0]);

const emptyThread = () => emptyState(domain().schema);

const find = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`thread.html has no #${id}`);
  return element as T;
};

const first = emptyThread();
let state: PageState = {
  thread: first,
  reading: reduce(first.lines, first.handles, domain().schema),
  writer: domain().writers[0].writer,
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
const domainSelect = find<HTMLSelectElement>('domain');
const examplesEl = find('examples');
const quitDialog = find<HTMLDialogElement>('quit-dialog');
const panel = createPanel(find('panel'), { onTab: (tab) => update({ tab }), onGist: (gist) => update({ gist }) });
mountBand(find('column'));
find('scroll').addEventListener('scroll', redraw);

// ── the server's part ──

/** A refusal as the page shows it: the words, and the sentences of the laws it names. */
const shownOf = (refusal: Refusal, lines: EventLine[]): ShownRefusal => ({
  words: domain().words.refusals[refusal.code],
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
  const result = await post(state.thread, draft, domain().schema, new Date().toISOString(), { confirmed, policy: domain().policy });
  if (result.refusal) return result.refusal;
  // what the page knows beyond the thread (a document made) is learned before the lines are drawn
  domain().documents?.learn(result.state.lines);
  // the lines after the thread's last are the draft's, then what reconciliation wrote
  const posted = result.state.lines[before];
  // a goal's own bookkeeping is not in the ledger unless asked for: there is no card to select
  const shown = !isGoalLine(posted.gist) || state.show.goals;
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

/**
 * A command: the page playing the system around the thread, for the writer. It posts what the
 * command says, with the page waiting, and says why when it is refused.
 */
function runCommand(command: Command, line?: EventLine): void {
  if (state.pending) return;
  const host = { writer: state.writer, authority: domain().schema.authority, send: (draft: LineDraft, delay = 400) => send(draft, delay), askSubject };
  void run(() => command.run(host, line));
}

// ── the question before leaving ──

// the answer is given by the submit and not by the dialog's closing, which waits for a repaint
let answerQuit: ((quit: boolean) => void) | undefined;
quitDialog.querySelector('form')!.addEventListener('submit', (event) => {
  const { submitter } = event as SubmitEvent;
  answerQuit?.(submitter instanceof HTMLButtonElement && submitter.value === 'yes');
});
quitDialog.addEventListener('close', () => answerQuit?.(false));

function ask(message: string, yes: string, no: string): Promise<boolean> {
  find('quit-text').textContent = message;
  find('quit-yes').textContent = yes;
  find('quit-no').textContent = no;
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
  run: async (line) => previewOf(await dryRun(state.thread, line, domain().schema, new Date().toISOString(), { policy: domain().policy }), line.gist),
  show: (answer, fresh) => update({ preview: answer && (fresh ? answer : dim(answer)) }),
  // a failed dry run is said in the draft's preview block; what is on screen is never confirmed, as it is not fresh
  onError: (error, line) => update({ preview: { gist: line.gist, failed: error instanceof Error ? error.message : String(error), happens: [], verdicts: [], confirm: false } }),
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
  const { confirm } = ui.compose ?? {};
  if (confirm && valueIn(state.thread.handles, confirm.while.key) === confirm.while.value && !(await ask(confirm.question, confirm.yes, confirm.no))) return;
  // only what the writer was shown confirms: a preview of an older draft does not
  const shown = previews.current();
  const confirmed = shown !== null && shown.fresh && shown.answer.confirm;
  const replaced = draft.goal?.replaces ? state.thread.lines.find((l) => l.id === draft.goal!.replaces) : undefined;
  update({ pending: true, refusal: null });
  try {
    const refusal = replaced ? await replaceGoal(replaced, line, confirmed) : await send(line, 400, { draft: null, preview: null }, confirmed);
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
  send({ gist: domain().goalRevoke!, writer: state.writer, payload: { target: goal.id } }, delay);

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
  return send({ gist: domain().goalGist!, writer: state.writer, payload: { ...wrapper.payload, checks: checks as unknown as Json } }, delay);
}

/**
 * «Cambia»: the new goal is written and the old goal revoked, two lines; when the
 * old goal is awaited by the wrapper, the wrapper follows. The new goal goes first, so
 * a refusal of it changes nothing and leaves the draft open, still taking the old
 * goal's place; a refusal of the revoke leaves both goals standing, and the wrapper
 * awaiting the old one.
 */
async function replaceGoal(old: EventLine, next: LineDraft, confirmed: boolean, delay = 400): Promise<Refusal | undefined> {
  const wrapper = wrapperFollowing(derive(state.thread, state.reading, state.writer), old.id);
  const before = state.thread.lines.length;
  const made = await send(next, delay, { draft: null, preview: null }, confirmed);
  if (made) return made;
  const replacement = state.thread.lines[before];
  const revoked = await revokeGoal(old, delay);
  if (revoked) return revoked;
  return wrapper ? rewriteWrapper(wrapper.line, old, replacement, delay) : undefined;
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
  inOrder(state.thread.lines).filter((line) => (state.show.records || uiOf(line.gist)?.card !== 'record') && (state.show.goals || !isGoalLine(line.gist)));

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
  const command = action.command === undefined ? undefined : domain().commands?.find((c) => c.id === action.command);
  if (command) runCommand(command, line);
  // a goal's card revokes it as the dock's «Rimuovi» does, so the wrapper follows
  else if (action.gist === domain().goalRevoke && line.gist === domain().goalGist) void run(() => removeGoal(line));
  else if (action.gist !== undefined) openDraft(action.gist, line.id);
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
  const offered = derived.offers.filter(({ gist }) => !isGoalLine(gist));
  const { commands = [], words } = domain();
  offersEl.replaceChildren(
    h('span', { class: 'offers-label' }, 'Aggiungi:'),
    ...(offered.length
      ? offered.flatMap(({ gist }) => {
          const button = h('button', { class: 'offer', type: 'button' }, gistLabel(gist));
          button.addEventListener('click', () => {
            if (!state.pending) openDraft(gist);
          });
          // what the page does itself beside an offer, playing the system around the thread
          const beside = commands
            .filter((command) => command.inBar?.after === gist)
            .map((command) => {
              const extra = h('button', { class: 'offer', type: 'button' }, command.label);
              extra.addEventListener('click', () => runCommand(command));
              return extra;
            });
          return [button, ...beside];
        })
      : [h('span', { class: 'panel-empty' }, words.nothing)]),
  );
}

function render(): void {
  const derived = derive(state.thread, state.reading, state.writer);
  editorWrap.classList.toggle('show-records', state.show.records);
  editorWrap.classList.toggle('show-goals', state.show.goals);
  if (writerSelect.value !== state.writer) writerSelect.value = state.writer;
  // the lines on their way are written as the writer who sent them
  writerSelect.disabled = state.pending;
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

  // a card or a goal's block built again may have taken an end of the band away: drawn again, it clears itself
  redraw();
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
  // the element that lit a line was built again, with no leave or blur to say so: the line is lit no more
  if (state.lit !== null && lightingGone()) update({ lit: null });
}

function reset(): void {
  domain().documents?.reset();
  ledger.clear();
  point(null, null);
  const thread = emptyThread();
  update({
    thread,
    reading: reduce(thread.lines, thread.handles, domain().schema),
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

/**
 * Plays the steps of an example one at a time, with no delay, the way the tests play them. A step
 * the example expects refused ends it as a lesson: its refusal stays on screen. A step that does not
 * go as the example says stops it, and the page says why.
 */
async function play(example: Example): Promise<void> {
  if (state.pending) return;
  update({ pending: true });
  reset();
  try {
    const played = await playScenario(example.steps, { lines: () => state.thread.lines, send: (draft, confirmed) => send(draft, 0, {}, confirmed) });
    const refusal = played.failed?.refusal ?? played.refused.at(-1)?.refusal;
    if (played.failed) console.warn(`playground: the ${example.id} example stopped at step ${played.failed.index + 1}: ${played.failed.why}`, played.failed.refusal);
    if (refusal) update({ refusal: shownOf(refusal, state.thread.lines) });
  } catch (error) {
    // a placeholder of the scenario found no line: the example is wrong, not the page
    console.warn(`playground: the ${example.id} example could not be played`, error);
  } finally {
    update({ pending: false });
  }
}

// ── the bar of the page ──

/** The writers, the examples and the words of the page as the domain in use has them. */
function drawDomain(): void {
  const { writers, examples, words } = domain();
  document.title = words.title;
  find('ledger').setAttribute('aria-label', words.ledger);
  find('panel').setAttribute('aria-label', words.panel);
  writerSelect.replaceChildren(...writers.map(({ writer: value, label }) => h('option', { value }, label)));
  examplesEl.replaceChildren(
    ...examples.map((example) => {
      const button = h('button', { type: 'button', class: 'bar-button', 'data-example': example.id }, example.label);
      button.addEventListener('click', () => void play(example));
      return button;
    }),
  );
}

/** Starts again in another domain: its words, its writers and its examples, and an empty thread. */
function switchDomain(next: Domain): void {
  if (state.pending || next === domain()) return;
  useDomain(next);
  drawDomain();
  barOf = panelOf = undefined;
  ledger.clear();
  point(null, null);
  next.documents?.reset();
  const thread = emptyThread();
  update({
    thread,
    reading: reduce(thread.lines, thread.handles, next.schema),
    writer: next.writers[0].writer,
    answered: [],
    draft: null,
    preview: null,
    selected: null,
    lit: null,
    linking: null,
    refusal: null,
    tab: 'activity',
    gist: HEAD_CHIP,
  });
}

domainSelect.append(...DOMAINS.map((d) => h('option', { value: d.id }, d.label)));
domainSelect.addEventListener('change', () => {
  const next = DOMAINS.find((d) => d.id === domainSelect.value);
  if (!next) return;
  switchDomain(next);
  // a switch refused (a post is in flight) leaves the picker where the page is
  domainSelect.value = domain().id;
});
drawDomain();
writerSelect.addEventListener('change', () => {
  // a change refused (a post is in flight, and its next lines read the writer) leaves the picker where the page is
  if (state.pending) {
    writerSelect.value = state.writer;
    return;
  }
  // a draft is written as one person: with another writer it would be someone else's
  update({ writer: writerSelect.value as Writer, draft: null, refusal: null });
});
find('reset').addEventListener('click', () => {
  if (!state.pending) reset();
});
recordsBox.addEventListener('change', () => update({ show: { ...state.show, records: recordsBox.checked } }));
goalsBox.addEventListener('change', () => update({ show: { ...state.show, goals: goalsBox.checked } }));

update({});
