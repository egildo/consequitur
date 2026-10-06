// A domain, as the page knows it: the schema of a case, and everything a person-facing application
// adds to it that the schema cannot hold (the schema's reader refuses unknown keys, and only a
// client needs this): the words, the guards' words, the cards, how a line is composed by hand, how a
// goal awaits it, the people, the policy and the examples. A domain is one module under `domains/`; nothing else
// in the page names a gist. The page reads the domain in use through `domain()`, and switching
// domains is `useDomain`.

import { BASE_KIT, readPolicy, readSchema, type EventLine, type Handles, type Json, type LineDraft, type LineId, type Policy, type Reading, type Refusal, type Schema, type Step, type ThreadState, type Writer } from 'consequitur';

/** The payload key of the optional comment on an action. */
export const NOTE = 'note';

export interface Person {
  id: string;
  name: string;
}

/** How a goal's condition on a gist is offered on a card, and the check it becomes. */
export interface Awaited {
  on: string;
  /** The check's payload key, and what it takes from the card's line. */
  key: string;
  value: { id: true } | { payload: string };
  /** One condition per user the card's line names under `users`, one written by `kin`, or one per member of a set, written by that member. */
  by: { users: string } | { kin: string } | { members: string };
  /** With `kin`: one condition per member of this set the thread expects, the member under this payload key. */
  each?: { key: string; set: string };
  /** The sentence: {who}, {line} (the card's label and first words), {document}, {by}, and any other {key} is the check's payload value. */
  phrase: string;
}

/** A one-line input in a draft's header. */
export interface Field {
  key: string;
  label: string;
  /** A select: the options, or `people`, the domain's people. */
  options?: string[] | 'people';
  /** The value it starts on; a select with none starts on its first option. */
  initial?: string;
  /** It starts on this key of the value the thread expects. */
  current?: string;
}

export interface GistUi {
  gist: string;
  /** What a person reads on the offer and as the card's title. */
  label: string;
  card: 'header' | 'note' | 'mark' | 'document' | 'fact' | 'goal' | 'record';
  /** A mark card's sentence: {writer} is the writer's name, any other {key} the payload's value (a list is its items, a user is by name). */
  says?: string;
  /** A header card: the payload key of its title, those of the people it names, and how its meta says who wrote it. */
  head?: { title: string; people: string[]; by: string };
  /** The label of a line of this gist ends with the first words of this payload key. */
  excerpt?: string;
  /** How a person composes a line of this gist. Absent: not composed by hand, never offered. */
  compose?: {
    /** The payload key that takes the markdown text. */
    body?: string;
    /** The text is an optional comment on the action, not the line's own content: a small text area. */
    bodyOptional?: true;
    /** Inline atoms to payload keys: every mention into a list, the first document into a string. */
    atoms?: { mention?: string; document?: string };
    /** The writer's own user id goes in a list under this key (the same list as the mentions when it is their key). */
    self?: string;
    /** One-line inputs in the draft's header. */
    fields?: Field[];
    /** One reference to a line: the payload key, the gists it may point at, whether it may stay empty. */
    refer?: { key: string; gists: string[]; optional?: true };
    /** The document picker: the payload key of the code, and of the direction when it asks one. */
    pick?: { document: string; direction?: string };
    /** Asked before posting while the key of the value handle holds the value. */
    confirm?: { question: string; yes: string; no: string; while: { key: string; value: Json } };
  };
  /** How a line of this gist is awaited by a goal: one entry per way, each offered on cards of its gist `on`. */
  awaited?: Awaited[];
}

/** What a key of the value handle is called, and how its values read. */
export interface ValueUi {
  label: string;
  /** `line`: the value is the id of a line; `list`: a list of values. */
  kind?: 'line' | 'list';
  /** Words for the values, by the value as text. */
  words?: Record<string, string>;
}

/** What a set is called, and how it is said that someone joined, left, should be, or should not. {member} is the name. */
export interface SetUi {
  label: string;
  joined: string;
  left: string;
  should: string;
  shouldNot: string;
}

/** One field of what a goal's outcome is given: a choice, a person (sent as a list of one), or a text. */
export type OutcomeField = { key: string; kind: 'choice'; options: string[] } | { key: string; kind: 'person' } | { key: string; kind: 'text'; placeholder: string };

/** What a goal may do when it is met: the gist it writes, and the sentence that says so. */
export interface GoalOutcome {
  then: string;
  /** How the goal composer words it. */
  label: string;
  /** The sentence of a goal that does it: {key} is a field's value, a person by name. */
  sentence: string;
  /** The sentence when a field it names is empty. */
  bare?: string;
  with?: OutcomeField[];
}

export interface GoalsUi {
  outcomes: GoalOutcome[];
  /** The most goals that stand besides the wrapper. */
  most: number;
  /** Absent: no goal awaits the completion of the others. */
  wrapper?: { name: string };
  /** What the dock says when there is no goal. */
  empty: string;
}

/** What a card, the bar and a command read of the page: the thread as it stands. */
export interface View {
  thread: ThreadState;
  reading: Reading;
  writer: Writer;
  /** Every gist this writer may post now, composed by hand or not. */
  offered: ReadonlySet<string>;
  /** The lines in force. */
  standing: ReadonlySet<LineId>;
}

/** What a command asks of the page it runs on. */
export interface CommandHost {
  writer: Writer;
  /** The authority: the page plays the system around the thread with it. */
  authority: Writer;
  /** Posts a draft, waiting `delay` ms (default a pause a person can see); answers the refusal, or nothing. */
  send(draft: LineDraft, delay?: number): Promise<Refusal | undefined>;
  /** Asks for the subject of a new document. */
  askSubject(): Promise<string | null>;
}

/** What the page itself does for a writer, playing the system around the thread, as a button on a card or in the bar. */
export interface Command {
  id: string;
  label: string;
  /** Offered on the card of a line when this holds. */
  onLine?(line: EventLine, view: View): boolean;
  /** Offered in the bar after the offer of this gist, when the writer is offered it. */
  inBar?: { after: string };
  run(host: CommandHost, line?: EventLine): Promise<Refusal | undefined>;
}

/** The documents the page knows, for a domain whose lines name documents. */
export interface DocumentsUi {
  list(): ReadonlyArray<{ code: string; subject: string }>;
  subject(code: string): string | undefined;
  /** Forgets what the page learned from a thread. */
  reset(): void;
  /** Learns from the lines of the thread what it can, before the page draws them. */
  learn(lines: EventLine[]): void;
  /** The lines in force that say something about the document a line names: none when it names none. */
  factsOf(line: EventLine, view: View): EventLine[] | undefined;
  factSentence(fact: EventLine): string;
}

/** The sentences of the page that name the domain's own things. */
export interface Words {
  /** The page's title. */
  title: string;
  /** The aria-label of the ledger and of the inspector. */
  ledger: string;
  panel: string;
  /** The inspector's first tab, and the section it opens with. */
  tab: string;
  subject: string;
  /** Before the opening line. */
  none: string;
  /** The key of the value handle that holds the subject's name, and the one that holds its status. */
  nameKey: string;
  statusKey: string;
  /** The denunciation of a thread with no single opening line: {found} is how many there are. */
  opening: string;
  /** When the writer is offered nothing. */
  nothing: string;
  refusals: Record<Refusal['code'], string>;
}

export interface Example {
  id: string;
  /** The button's words. */
  label: string;
  steps: Step[];
}

export interface DomainSpec {
  id: string;
  /** The picker's words. */
  label: string;
  /** The text of the case's schema file, as it is. */
  file: string;
  /** The text of the case's policy file, as it is, when it has one. */
  policyFile?: string;
  words: Words;
  people: Person[];
  /** The «Scrivo come» list, the first who the page starts as. */
  writers: Array<{ writer: Writer; label: string }>;
  /** What the system's kin is called. */
  systemName: string;
  /** In the order of the bar of offers. `compose: {}` is a gist a person writes that asks for nothing in the shared draft. */
  ui: GistUi[];
  values: Record<string, ValueUi>;
  sets: Record<string, SetUi>;
  /** What a law says when it is broken, by the law and, for a law about a set, by the set. */
  laws: Record<string, Record<string, string>>;
  /** What each named guard of the schema says, as a condition of a sentence: one entry per guard, and no other. */
  guards: Record<string, string>;
  goals?: GoalsUi;
  documents?: DocumentsUi;
  commands?: Command[];
  examples: Example[];
}

export interface Domain extends DomainSpec {
  schema: Schema;
  /** The policy file, read against the schema. */
  policy?: Policy;
  /** The head of the schema, as the file writes it: what is neither a gist nor a law. */
  head: Json;
  /** The laws, as the file writes them. */
  lawsData: Json;
  gistData(gist: string): Json | undefined;
  uiOf(gist: string): GistUi | undefined;
  /** The position of a gist in the bar, for sorting; a gist with no entry goes last. */
  uiIndex(gist: string): number;
  /** The gist of a goal, and the one that revokes it. */
  goalGist: string | undefined;
  goalRevoke: string | undefined;
  /** The gists of the goals' own bookkeeping: the ledger hides them until asked. */
  goalLines: ReadonlySet<string>;
  /** A mention of a person, by id. */
  mention: RegExp;
}

/** Reads a domain's case, and refuses a case with problems and a domain whose words name what its schema has not. */
export function defineDomain(spec: DomainSpec): Domain {
  const file = JSON.parse(spec.file) as Record<string, Json>;
  const { schema, problems } = readSchema(file, BASE_KIT);
  if (problems.length > 0) throw new Error(`The case "${spec.id}" has problems: ${problems.join(' ')}`);
  const read = spec.policyFile === undefined ? undefined : readPolicy(JSON.parse(spec.policyFile), schema);
  if (read && read.problems.length > 0) throw new Error(`The policy of the case "${spec.id}" has problems: ${read.problems.join(' ')}`);

  const gists = new Set(schema.gists.map((g) => g.gist));
  const unknown = [...spec.ui.map((ui) => ui.gist), ...spec.examples.flatMap((e) => e.steps.map((s) => s.gist))].filter((gist) => !gists.has(gist));
  if (unknown.length > 0) throw new Error(`The domain "${spec.id}" names gists its case has not: ${[...new Set(unknown)].join(', ')}.`);
  const guards = Object.keys(schema.guards).sort();
  if (Object.keys(spec.guards).sort().join() !== guards.join()) throw new Error(`The domain "${spec.id}" must have words for its case's guards, and only for them: ${guards.join(', ')}.`);

  const goalGist = schema.gists.find((g) => g.rules.some((r) => r.rule === 'goal'))?.gist;
  const goalRevoke = goalGist === undefined ? undefined : schema.gists.find((g) => g.rules.some((r) => r.rule === 'revoke' && Array.isArray(r.gists) && r.gists.includes(goalGist)))?.gist;
  const byGist = new Map(spec.ui.map((ui, index) => [ui.gist, { ui, index }] as const));
  const { gists: _gists, laws: _laws, ...head } = file;

  return {
    ...spec,
    schema,
    policy: read?.policy,
    head,
    lawsData: file.laws,
    gistData: (gist) => (file.gists as Array<{ gist: string }>).find((entry) => entry.gist === gist) as Json | undefined,
    uiOf: (gist) => byGist.get(gist)?.ui,
    uiIndex: (gist) => byGist.get(gist)?.index ?? spec.ui.length,
    goalGist,
    goalRevoke,
    goalLines: new Set([goalGist, goalRevoke, schema.records.warning].filter((g): g is string => g !== undefined)),
    mention: new RegExp(`(?<!\\w)@(${spec.people.map((p) => p.id).join('|')})(?!\\w)`, 'g'),
  };
}

let current: Domain | undefined;

/** The domain in use. */
export function domain(): Domain {
  if (!current) throw new Error('No domain is in use: the page chooses one before it draws.');
  return current;
}

export function useDomain(next: Domain): void {
  current = next;
}

const record = (json: Json | undefined): Record<string, Json> => (typeof json === 'object' && json !== null && !Array.isArray(json) ? json : {});

/** One key of the value handle. */
export const valueIn = (handles: Handles, key: string): Json | undefined => record(handles.value)[key];

/** The names in one set of the set handle. */
export const membersIn = (handles: Handles, set: string): string[] => {
  const names = record(handles.set)[set];
  return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
};
