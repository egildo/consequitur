// What a client needs to know about each gist beyond its schema: the words a
// person reads, the card that draws it, how it is composed by hand, how a goal
// awaits it. It is separate from the schema on purpose: the schema's reader
// refuses unknown keys, and only a client needs this. The mocked people and
// documents are here too, since the page has no directory to ask.

import { kinOf, type Check, type DryRun, type EventLine, type Json, type Payload, type Refusal, type Verdict, type Writer } from 'consequitur';
import { SYSTEM, WARNING_GIST } from './case.ts';

/** How a goal's condition on a gist is offered on a card, and the check it becomes. */
export interface Awaited {
  on: string;
  /** The check's payload key, and what it takes from the card's line. */
  key: string;
  value: { id: true } | { payload: string };
  /** One condition per user the card's line names under `users`, or one written by `kin`. */
  by: { users: string } | { kin: string };
  /** With `kin`: one condition per user the thread expects as an assignee, the user under this payload key. */
  each?: string;
  /** The sentence: {who}, {line} (the card's label and first words), {document}, {by}. */
  phrase: string;
}

export interface GistUi {
  gist: string;
  /** What a person reads on the offer and as the card's title. */
  label: string;
  card: 'header' | 'note' | 'mark' | 'document' | 'fact' | 'goal' | 'record';
  /** A mark card's sentence: {writer} is the writer's name, any other {key} the payload's value. */
  says?: string;
  /** How a person composes a line of this gist. Absent: not composed by hand, never offered. */
  compose?: {
    /** The payload key that takes the markdown text. */
    body?: string;
    /** The text is an optional comment on the action, not the line's own content: a small text area. */
    bodyOptional?: true;
    /** Inline atoms to payload keys: every mention into a list, the first document into a string. */
    atoms?: { mention?: string; document?: string };
    /** The writer's own user id joins the list under this key. */
    self?: string;
    /** One-line inputs in the draft's header. */
    fields?: Array<{ key: string; label: string; options?: string[] }>;
    /** One reference to a line: the payload key, the gists it may point at, whether it may stay empty. */
    refer?: { key: string; gists: string[]; optional?: true };
    /** The document picker: the payload key of the code, and of the direction when it asks one. */
    pick?: { document: string; direction?: string };
    /** Asked before posting while the activity is open. */
    confirmWhileOpen?: string;
  };
  /** How a line of this gist is awaited by a goal: one entry per way, each offered on cards of its gist `on`. */
  awaited?: Awaited[];
}

/** The payload key of the optional comment on an action. */
const NOTE = 'note';

export const STAGES = ['istruttoria', 'firma', 'invio'];

/**
 * In the order of the bar of offers. `compose: {}` is a gist a person writes
 * that asks for nothing in the shared draft: a button posts it, or, for the
 * goal, the goal draft collects what it needs.
 */
export const GIST_UI: GistUi[] = [
  {
    gist: 'create',
    label: 'Nuova attività',
    card: 'header',
    compose: { fields: [{ key: 'name', label: 'Nome' }], atoms: { mention: 'assignTo' }, self: 'assignTo' },
  },
  {
    gist: 'memo',
    label: 'Promemoria',
    card: 'note',
    compose: { body: 'text', atoms: { mention: 'assignTo', document: 'document' } },
  },
  { gist: 'comment', label: 'Commento', card: 'note', compose: { body: 'text', atoms: { mention: 'mentions' } } },
  {
    gist: 'got_it',
    label: 'Ricevuto',
    card: 'mark',
    says: '{writer} ha confermato',
    compose: { refer: { key: 'about', gists: ['memo'] }, body: NOTE, bodyOptional: true },
    awaited: [{ on: 'memo', key: 'about', value: { id: true }, by: { users: 'assignTo' }, phrase: '{who} conferma {line}' }],
  },
  {
    gist: 'doc_ref',
    label: 'Collega documento',
    card: 'document',
    compose: {
      pick: { document: 'document', direction: 'direction' },
      refer: { key: 'about', gists: ['memo'], optional: true },
      body: NOTE,
      bodyOptional: true,
    },
  },
  { gist: 'set_goal', label: 'Traguardo', card: 'goal', compose: {} },
  {
    gist: 'stage',
    label: 'Fase',
    card: 'mark',
    says: "{writer} ha portato l'attività alla fase {stage}",
    compose: { fields: [{ key: 'stage', label: 'Fase', options: STAGES }], body: NOTE, bodyOptional: true },
  },
  { gist: 'closed', label: 'Chiudi', card: 'mark', says: "{writer} ha chiuso l'attività", compose: { body: NOTE, bodyOptional: true } },
  {
    gist: 'memo_revoke',
    label: 'Annulla promemoria',
    card: 'mark',
    says: '{writer} ha annullato un promemoria',
    compose: { refer: { key: 'target', gists: ['memo'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'doc_ref_revoke',
    label: 'Scollega documento',
    card: 'mark',
    says: '{writer} ha scollegato un documento',
    compose: { refer: { key: 'target', gists: ['doc_ref'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'set_goal_revoke',
    label: 'Annulla traguardo',
    card: 'mark',
    says: '{writer} ha annullato il traguardo',
    compose: { refer: { key: 'target', gists: ['set_goal'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'closed_revoke',
    label: 'Riapri',
    card: 'mark',
    says: "{writer} ha riaperto l'attività",
    compose: { refer: { key: 'target', gists: ['closed'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'quit',
    label: 'Esci',
    card: 'mark',
    says: "{writer} ha lasciato l'attività",
    compose: { confirmWhileOpen: "Vuoi uscire da un'attività ancora aperta?", body: NOTE, bodyOptional: true },
  },
  {
    gist: 'doc_signed',
    label: 'Documento firmato',
    card: 'fact',
    compose: { pick: { document: 'document' } },
    awaited: [
      { on: 'doc_ref', key: 'document', value: { payload: 'document' }, by: { kin: 'system' }, phrase: 'il documento {document} è firmato' },
      { on: 'doc_ref', key: 'document', value: { payload: 'document' }, by: { kin: 'system' }, each: 'by', phrase: 'il documento {document} è firmato da {by}' },
    ],
  },
  { gist: 'doc_created', label: 'Documento creato', card: 'fact' },
  { gist: 'goal_warning', label: 'Avviso', card: 'mark' },
  { gist: 'assigned', label: 'Assegnazione', card: 'record' },
  { gist: 'unassigned', label: 'Fine assegnazione', card: 'record' },
  { gist: 'metadata_set', label: 'Metadato', card: 'record' },
];

const UI_BY_GIST = new Map(GIST_UI.map((ui, index) => [ui.gist, { ui, index }] as const));

export const uiOf = (gist: string): GistUi | undefined => UI_BY_GIST.get(gist)?.ui;

/** The position of a gist in the bar, for sorting; a gist with no entry goes last. */
export const uiIndex = (gist: string): number => UI_BY_GIST.get(gist)?.index ?? GIST_UI.length;

export const gistLabel = (gist: string): string => uiOf(gist)?.label ?? gist;

/** The gists of the goals' own bookkeeping: the ledger hides them until asked, and the dock tells what they say. */
export const GOAL_LINES: ReadonlySet<string> = new Set(['set_goal', 'set_goal_revoke', WARNING_GIST]);

export const PEOPLE: Array<{ id: string; name: string }> = [
  { id: 'mrossi', name: 'Mario Rossi' },
  { id: 'lbianchi', name: 'Laura Bianchi' },
  { id: 'gverdi', name: 'Giulia Verdi' },
];

/** The «Scrivo come» list. */
export const WRITERS: Array<{ writer: Writer; label: string }> = [
  { writer: 'user::mrossi', label: 'Mario Rossi' },
  { writer: 'user::lbianchi', label: 'Laura Bianchi' },
  { writer: 'user::gverdi', label: 'Giulia Verdi' },
  { writer: SYSTEM, label: 'Sistema' },
];

const FIXED_DOCUMENTS = [
  { code: '34132412', subject: 'Determina di liquidazione fornitura arredi' },
  { code: '34132587', subject: 'Richiesta di parere sul bilancio di previsione' },
  { code: '34133019', subject: 'Verbale della riunione di coordinamento' },
  { code: '34133264', subject: 'Contratto di manutenzione degli impianti' },
];

/** The documents the page knows: the fixed four, then those «Nuovo documento» has made. Mutable on purpose. */
export const DOCUMENTS: Array<{ code: string; subject: string }> = [...FIXED_DOCUMENTS];

/** The code of the next new document: the highest code the list holds, plus one. */
export const nextDocumentCode = (): string => String(Math.max(...DOCUMENTS.map((d) => Number(d.code))) + 1).padStart(8, '0');

/** Forgets the documents made on the page. */
export function resetDocuments(): void {
  DOCUMENTS.length = FIXED_DOCUMENTS.length;
}

export const REFUSAL_WORDS: Record<Refusal['code'], string> = {
  'unknown-gist': 'Questo tipo di riga non esiste.',
  'writer-not-allowed': 'Chi scrive non può scrivere questa riga.',
  'not-now': 'Questa riga non si può scrivere adesso.',
  'invalid-payload': 'Manca qualcosa di necessario, o qualcosa non va.',
  'unknown-line': "La riga indicata non è nell'attività.",
  'not-revocable': 'Questa riga non può annullare quella indicata.',
  unreconcilable: "Un'attività comincia con «Nuova attività», una volta sola.",
  law: "Questa riga lascerebbe l'attività in uno stato non ammesso.",
  unconfirmed: 'Questa riga ha delle conseguenze: confermale per inviarla.',
};

/** What a writer's kin is called, for the badge on a fact. */
export const KIN_WORDS: Record<string, string> = { user: 'utente', system: 'sistema', goal: 'traguardo' };

/** The words a person reads on the optional comment's text area. */
export const NOTE_PLACEHOLDER = 'Aggiungi un commento (facoltativo)';

export const userName = (id: string): string => PEOPLE.find((p) => p.id === id)?.name ?? id;

const MENTION = new RegExp(`(?<!\\w)@(${PEOPLE.map((p) => p.id).join('|')})(?!\\w)`, 'g');

/** A memo's text as a person reads it: a mention of a known user is written with the user's name. The stored text keeps the id. */
export const readable = (text: string): string => text.replace(MENTION, (_, id: string) => `@${userName(id)}`);

/** The users a payload value names: a string, or a list of strings. */
export const usersOf = (value: Json | undefined): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function writerName(writer: Writer): string {
  const at = writer.indexOf('::');
  const kin = writer.slice(0, at);
  if (kin === 'user') return userName(writer.slice(at + 2));
  if (kin === 'goal') return 'Il traguardo';
  if (kin === 'system') return 'Sistema';
  return writer;
}

/** A mark card's sentence: {writer} is the writer's name, any other {key} the payload's value. */
export function sayOf(ui: GistUi | undefined, line: EventLine): string {
  const text = ui?.says ?? ui?.label ?? line.gist;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'writer') return writerName(line.writer);
    const value = line.payload[key];
    return typeof value === 'string' ? value : '';
  });
}

export const documentSubject = (code: string): string | undefined => DOCUMENTS.find((d) => d.code === code)?.subject;

/** `HH:MM:SS` in Italian time. */
export const timeOf = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString('it-IT', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const WORDS_IN_A_LABEL = 6;

/** What a person recognises a line by: its gist, its writer, the time, and a memo's first words. */
export function lineLabel(line: EventLine): string {
  const parts = [gistLabel(line.gist), writerName(line.writer), timeOf(line.timestamp)];
  const text = line.payload.text;
  if (line.gist === 'memo' && typeof text === 'string') {
    // the markers of emphasis and headings are not words
    const words = readable(text).replace(/[*_`#>~]/g, '').split(/\s+/).filter(Boolean);
    parts.push(words.slice(0, WORDS_IN_A_LABEL).join(' ') + (words.length > WORDS_IN_A_LABEL ? '…' : ''));
  }
  return parts.join(' · ');
}

/** A payload value as short text; a line id reads as the line's label, never as the id. */
function valueText(value: Json, lines: EventLine[]): string {
  if (typeof value === 'string') {
    const line = lines.find((l) => l.id === value);
    // a user id reads as the person's name, as a mention does
    return line ? lineLabel(line) : PEOPLE.some((p) => p.id === value) ? userName(value) : readable(value);
  }
  if (Array.isArray(value)) return value.map((v) => valueText(v, lines)).join(', ');
  return JSON.stringify(value);
}

/** A payload as `key: value` pairs, for the cards that have no better way to say it. */
export const payloadPairs = (payload: EventLine['payload'], lines: EventLine[]): string[] =>
  Object.entries(payload).map(([key, value]) => `${key}: ${valueText(value, lines)}`);

/** The way of awaiting that wrote a check: the entry whose `each` key the check holds, otherwise the plain one. */
function awaitedBy(check: Check) {
  const entries = check.gist === undefined ? [] : (uiOf(check.gist)?.awaited ?? []);
  const keyed = entries.find((a) => a.each !== undefined && check.payload !== undefined && a.each in check.payload && a.key in check.payload);
  const valued = entries.find((a) => a.each === undefined && check.payload !== undefined && a.key in check.payload);
  // a check that names only who writes («Giulia conferma») still reads as its gist's sentence
  return keyed ?? valued ?? (check.writer !== undefined ? entries.find((a) => 'id' in a.value) : undefined);
}

/** The goal's line a check names as its writer: a check on what a goal writes is that goal's completion. */
function goalNamed(check: Check, lines: EventLine[]): EventLine | undefined {
  if (check.writer === undefined || kinOf(check.writer) !== 'goal') return undefined;
  const id = check.writer.slice(check.writer.indexOf('::') + 2);
  return lines.find((l) => l.id === id);
}

/** The sentence of a goal's check. */
export function checkSentence(check: Check, lines: EventLine[]): string {
  const goal = goalNamed(check, lines);
  if (goal) return `il traguardo «${typeof goal.payload.name === 'string' ? goal.payload.name : ''}» è raggiunto`;
  const awaited = awaitedBy(check);
  if (!awaited) {
    const pairs = check.payload ? payloadPairs(check.payload, lines) : [];
    return [`una riga «${check.gist === undefined ? 'qualsiasi' : gistLabel(check.gist)}»`, ...pairs].join(' · ');
  }
  const asked = check.payload?.[awaited.key];
  const by = awaited.each === undefined ? undefined : check.payload?.[awaited.each];
  const line = typeof asked === 'string' ? lines.find((l) => l.id === asked) : undefined;
  return awaited.phrase
    .replace('{who}', check.writer === undefined ? 'qualcuno' : writerName(check.writer))
    .replace('{line}', line ? lineLabel(line) : `un ${gistLabel(awaited.on).toLowerCase()}`)
    .replace('{document}', typeof asked === 'string' ? asked : '')
    .replace('{by}', typeof by === 'string' ? userName(by) : '');
}

/** What a goal does when it is met, as a sentence. */
export function outcomeSentence(then: string, outcome: Payload | undefined): string {
  if (then === 'closed') return "→ chiude l'attività";
  if (then === 'stage') return `→ passa alla fase ${typeof outcome?.stage === 'string' ? outcome.stage : ''}`.trimEnd();
  if (then === 'memo') {
    const to = usersOf(outcome?.assignTo).map(userName).join(', ');
    return to ? `→ scrive un promemoria a ${to}` : '→ scrive un promemoria';
  }
  return `→ scrive «${gistLabel(then)}»`;
}

/** A goal's warning, as a sentence: the goal by name and the check that cannot come true. */
export function warningSentence(warning: EventLine, lines: EventLine[]): string {
  const goalId = warning.writer.slice(warning.writer.indexOf('::') + 2);
  const goal = lines.find((l) => l.id === goalId);
  const name = typeof goal?.payload.name === 'string' ? goal.payload.name : '';
  const checks = Array.isArray(goal?.payload.checks) ? (goal.payload.checks as unknown as Check[]) : [];
  const check = typeof warning.payload.check === 'number' ? checks[warning.payload.check] : undefined;
  return `Il traguardo «${name}» non può più avverarsi: ${check ? checkSentence(check, lines) : 'una sua condizione'}`;
}

export function metadataLabel(key: string): string {
  switch (key) {
    case 'name':
      return 'Nome';
    case 'status':
      return 'Stato';
    case 'stage':
      return 'Fase';
    case 'acknowledged':
      return 'Confermato';
    case 'documents':
      return 'Documenti';
    case 'documents_in':
      return 'In entrata';
    case 'documents_out':
      return 'In uscita';
    default:
      return key;
  }
}

export function metadataValue(key: string, value: Json, lines: EventLine[]): string {
  switch (key) {
    case 'name':
    case 'stage':
      return typeof value === 'string' ? value : JSON.stringify(value);
    case 'status':
      return value === 'open' ? 'aperta' : value === 'closed' ? 'chiusa' : JSON.stringify(value);
    case 'acknowledged': {
      const line = typeof value === 'string' ? lines.find((l) => l.id === value) : undefined;
      return line ? lineLabel(line) : 'una riga';
    }
    case 'documents':
    case 'documents_in':
    case 'documents_out':
      return Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ') : JSON.stringify(value);
    default:
      return JSON.stringify(value);
  }
}

/** A record line, as the card and the preview say it. */
export function recordSentence(line: EventLine, lines: EventLine[]): string {
  const { payload } = line;
  const user = typeof payload.member === 'string' ? userName(payload.member) : '';
  const key = typeof payload.key === 'string' ? payload.key : '';
  if (line.gist === 'assigned') return `${user} è assegnatario`;
  if (line.gist === 'unassigned') return `${user} non è più assegnatario`;
  return 'value' in payload ? `${metadataLabel(key)} → ${metadataValue(key, payload.value, lines)}` : `${metadataLabel(key)} tolto`;
}

/**
 * What a law says when it is broken, in words, by the law and, for a law about a set, by the set: the
 * engine words a verdict in English and in general, and the words of a domain are the page's.
 */
const LAW_WORDS: Record<string, Record<string, string>> = {
  'keeps-set': { assignees: "L'attività resterebbe aperta senza assegnatari." },
  settles: { '': "L'attività resterebbe in disaccordo con le sue righe." },
};

const setOfVerdict = (verdict: Verdict): string => verdict.set ?? '';

/** A law a dry run found broken, as a sentence; `lines` are the thread's, where the goal of a check is read. */
export function verdictSentence(verdict: Verdict, lines: EventLine[]): string {
  if (verdict.law === 'keeps-goals') {
    const goal = lines.find((l) => l.id === verdict.goal);
    const name = typeof goal?.payload.name === 'string' ? goal.payload.name : '';
    const checks = Array.isArray(goal?.payload.checks) ? (goal.payload.checks as unknown as Check[]) : [];
    const check = verdict.check === undefined ? undefined : checks[verdict.check];
    return `Il traguardo «${name}» non potrebbe più avverarsi: ${check ? checkSentence(check, lines) : 'una sua condizione'}.`;
  }
  const set = verdict.law === 'keeps-set' ? setOfVerdict(verdict) : '';
  return LAW_WORDS[verdict.law]?.[set] ?? 'Questa riga violerebbe una regola dello schema.';
}

/** The verdicts of a refusal as the draft shows them, each with how strongly the law judges. */
export const verdictsOf = (verdicts: Verdict[], lines: EventLine[]): Array<{ strength: Verdict['strength']; text: string }> =>
  verdicts.map((v) => ({ strength: v.strength, text: verdictSentence(v, lines) }));

/** What a draft would cause, as the page draws it under the draft's header. */
export interface Preview {
  /** The dry run failed: what the error says. Nothing else is drawn then, and nothing is confirmed on it. */
  failed?: string;
  /** The draft cannot be sent yet: the refusal's words. Nothing else is drawn then. */
  unsent?: string;
  /** One sentence per line the post would add after the draft's own. */
  happens: string[];
  verdicts: Array<{ strength: Verdict['strength']; text: string }>;
  /** A law asks for confirmation and none refuses: the draft is sent with «Conferma e invia». */
  confirm: boolean;
  /** The draft changed since this was worked out: it is drawn dimmed and confirms nothing. */
  stale?: true;
  /** The gist of the draft this answers: an answer for another gist is not an answer for this draft. */
  gist: string;
}

/** One line a post would add after the draft's own, as a sentence. */
function addedSentence(line: EventLine, lines: EventLine[]): string {
  const ui = uiOf(line.gist);
  if (ui?.card === 'record') return recordSentence(line, lines);
  if (line.gist === WARNING_GIST) return warningSentence(line, lines);
  if (kinOf(line.writer) === 'goal') {
    const goalId = line.writer.slice(line.writer.indexOf('::') + 2);
    const name = lines.find((l) => l.id === goalId)?.payload.name;
    return `Il traguardo «${typeof name === 'string' ? name : ''}» è raggiunto ${outcomeSentence(line.gist, line.payload)}`;
  }
  return `${gistLabel(line.gist)} · ${writerName(line.writer)}`;
}

/** The preview of a dry run. Pure. */
export function previewOf(run: DryRun, gist: string): Preview {
  if (run.refusal) return { gist, unsent: REFUSAL_WORDS[run.refusal.code], happens: [], verdicts: [], confirm: false };
  const lines = run.state.lines;
  return {
    gist,
    happens: run.added.slice(1).map((line) => addedSentence(line, lines)),
    verdicts: verdictsOf(run.verdicts, lines),
    confirm: run.verdicts.some((v) => v.strength === 'confirm') && !run.verdicts.some((v) => v.strength === 'refuse'),
  };
}
