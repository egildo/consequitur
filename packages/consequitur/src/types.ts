// The vocabulary of a thread. This package imports nothing outside itself:
// a client runs the same code, so it can read a thread the way the authority does.

/** SHA-256, 64 hex characters. */
export type LineId = string;

/** `KIN::ID`, for example `user::mrossi` or `goal::<line id>`. */
export type Writer = `${string}::${string}`;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Payload = { [key: string]: Json };

export interface EventLine {
  id: LineId;
  /** The thread's last line in reading order when this one was written; null on the first. */
  previous: LineId | null;
  gist: string;
  writer: Writer;
  /** The authority's time, as `Date.prototype.toISOString` writes it. */
  timestamp: string;
  payload: Payload;
}

/** What a writer hands over. The host states `writer` from the identity it authenticated. */
export type LineDraft = Pick<EventLine, 'gist' | 'writer' | 'payload'>;

/**
 * A rule as a gist schema binds it: the kind's name and the payload keys it reads.
 * Two kinds are mechanics and are read by the engine itself: `revoke` (`from`, the
 * payload key that holds a line id; `gists`, what it may take out of force) and
 * `goal` (no keys: the line carries `name`, `when`, `then`, and optionally `with`
 * and `final`).
 */
export interface RuleBinding {
  rule: string;
  [key: string]: Json | undefined;
}

export interface GistSchema {
  gist: string;
  /** The kins that may write it. */
  writers: string[];
  rules: RuleBinding[];
  /** When it may be written, read with the writer and the draft; a gist with none may be written at any point of a thread. */
  when?: Condition;
}

/** What a writer may post to a thread as it stands. */
export interface Offer {
  gist: string;
  /** For a revoking gist: the lines in force it may name, in reading order. */
  targets?: LineId[];
}

/** Every stated part must equal the line's; `payload` compares the keys it names. */
export interface Check {
  gist?: string;
  kin?: string;
  writer?: Writer;
  payload?: Payload;
}

/**
 * In a condition, what the thread expects under a name, read when the condition is: the value handle under a
 * key, the members of a set, and, in a `when` only, the writer's `id` or `kin` and a key of the draft's payload.
 */
export type Reference = { $value: string } | { $set: string } | { $writer: 'id' | 'kin' } | { $draft: string };

/** What `is` and `has` read: a plain value, or a reference. */
export type Operand = string | number | boolean | null | Reference;

/**
 * When a gist may be written, when a goal is met, while a law holds: consequitur's form of `kdlet-guards`'
 * conditions, with its two words, `line` and `atLeast`, and references written `{ "$<from>": field }`.
 */
export type Condition =
  /** The operand equals one of the values; a `$set` among the values stands for its members. */
  | { is: Operand; values: Operand[] }
  /** The operand is there, and not null, empty text or an empty list. */
  | { has: Operand }
  | { not: Condition }
  | { all: Condition[] }
  | { any: Condition[] }
  /** The schema's guard of that name holds. */
  | { guard: string }
  /** A line in force matches the check; a payload value in it may be a `$value` reference. */
  | { line: Check }
  /** At least `atLeast` of the conditions hold. */
  | { atLeast: number; of: Condition[] };

/**
 * What reading a condition found, node by node: the node as written, whether it holds, and its children (a
 * named guard has one, its body). A node's path is the indexes from the root, joined by dots; the root's is "".
 */
export interface Trace {
  condition: Condition;
  holds: boolean;
  children?: Trace[];
  /** A `line` node: the line that met it. */
  foundIn?: LineId;
  /** A `line` node: the check as matched, each reference replaced; absent when a reference names a key the thread does not hold. */
  check?: Check;
  /** The node can no longer hold: read only where warnings are. */
  lost?: true;
}

/** One entry per handle kind of the kit, keyed by the kind's name. */
export type Handles = Record<string, Json>;

/** One difference between what the thread expects of a handle and what the handle holds. */
export interface HandleDenunciation {
  sort: 'handle';
  /** The handle kind's name. */
  kind: string;
  /** The value's key, or the set's name. */
  key: string;
  /** Set: the name in question. */
  member?: string;
  /** Value: the expected value, absent when no line expects the key. Set: true (should be in) or false. */
  expected?: Json;
  /** Value: what the handle holds, absent when it lacks the key. */
  found?: Json;
  /** The line that states the expectation, when one does. */
  line?: LineId;
}

export type Denunciation =
  | HandleDenunciation
  /** A line a goal owes the thread: its outcome once met, or a warning. `line` is the goal; `payload` is what the line carries. */
  | { sort: 'line'; gist: string; writer: Writer; line: LineId; payload: Payload }
  /** The opening rule: exactly one line of the opening gist in force. Nothing can reconcile it. */
  | { sort: 'thread'; rule: 'one-opening'; found: number };

/** What a host applies to its own copy of a handle, as the handle kind says it. */
export interface Change {
  kind: string;
  key: string;
  [field: string]: Json | undefined;
}

export interface GoalReading {
  line: LineId;
  name: string;
  then: string;
  /** Its condition, node by node: each node with `holds`, a `line` node with the line that met it and the check as matched, and, where warnings are, `lost` on a node that can no longer hold. */
  trace: Trace;
  /** The root of the trace holds. */
  met: boolean;
  /** The payload of the line the goal writes, when it states one. */
  with?: Payload;
  /** Whether the line the goal writes can never be revoked. */
  final: boolean;
  /** The goal's line in the thread, in force or revoked: a goal writes it once. */
  outcome?: LineId;
  /** The outcome has been revoked, and the goal does not write it again. */
  outcomeRevoked?: true;
}

/** A value some lines in force refer to by `{ "$value": key }` and no line states: awaited, never denounced. */
export interface Hole {
  key: string;
  /** The lines in force that hold the reference, in reading order. */
  lines: LineId[];
}

export interface Reading {
  inForce: LineId[];
  revoked: LineId[];
  /** What the thread expects the handles to be. */
  expected: Handles;
  /** The values awaited, by key. */
  holes: Hole[];
  goals: GoalReading[];
  denunciations: Denunciation[];
  settled: boolean;
}

/** A thread, in order of arrival, and its handles. */
export interface ThreadState {
  lines: EventLine[];
  handles: Handles;
}

export interface Refusal {
  code:
    | 'unknown-gist'
    | 'writer-not-allowed'
    | 'not-now'
    | 'invalid-payload'
    | 'unknown-line'
    | 'not-revocable'
    | 'unreconcilable'
    /** A `refuse` verdict: the line would leave the thread in a state a law does not allow. */
    | 'law'
    /** A `confirm` verdict the writer did not confirm. */
    | 'unconfirmed';
  /** For developers, in English: which gist, key or id. */
  detail: string;
  /** Present on `law` and `unconfirmed`: every law the dry run found broken. */
  verdicts?: Verdict[];
}

/** A law as the schema binds it: its kind's name, its strength, and the keys the kind reads. */
export interface LawBinding {
  law: string;
  /** `confirm` lets a line through when the writer says so. */
  strength: 'refuse' | 'confirm';
  [key: string]: Json | undefined;
}

/** One law a dry run found broken. */
export interface Verdict {
  law: string;
  strength: 'refuse' | 'confirm';
  /** For developers, in English. */
  detail: string;
  /** `keeps-goals`: the goal that would be lost, and the path of the node that would make it lost. */
  goal?: LineId;
  path?: string;
  /** `keeps-set`: the set that would be empty. */
  set?: string;
}

/** What a post would do, kept and not applied. */
export interface DryRun {
  /** The state the post would leave; the state given is unchanged. */
  state: ThreadState;
  reading: Reading;
  refusal?: Refusal;
  /** The lines the post would append: the draft's first, then what reconciliation writes. */
  added: EventLine[];
  /** The denunciations each round of reconciliation answered, round by round. */
  rounds: Denunciation[][];
  verdicts: Verdict[];
}

export interface PostResult {
  state: ThreadState;
  reading: Reading;
  refusal?: Refusal;
  added: EventLine[];
  rounds: Denunciation[][];
}

/**
 * The authority's choice of which denunciations it leaves unanswered. It is conf
 * and lives outside the thread: the thread says what is expected, the policy says
 * what the authority does not enforce, and a reading that only the policy keeps
 * from settling counts as settled.
 */
export type Policy = Array<{
  /** A denunciation is left when it equals every part stated. */
  leave: { sort?: 'handle' | 'line'; kind?: string; key?: string; member?: string; gist?: string };
  /** Read on the handles as they stand: each key of the value handle holds the value given. */
  while?: { values: Record<string, Json> };
}>;

/** What a schema says before any of its gists or laws: the words the kinds read it by. */
export interface SchemaHead {
  /** The gist a thread starts with; exactly one line of it is in force. */
  opening: string;
  /** The writer of the lines that record a reconciliation. */
  authority: Writer;
  /** The names of the sets of the `set` handle. */
  sets: string[];
  /** The gist each record role is written as: the roles the handle kinds answer with, and `warning`. */
  records: Record<string, string>;
  /** The kins whose lines the laws judge. */
  judged: string[];
  /** The named guards: conditions a `when`, a goal or a law uses by name, `{ "guard": name }`. */
  guards: Record<string, Condition>;
}

/** A domain, as data, with the kit it was read against. */
export interface Schema extends SchemaHead {
  gists: GistSchema[];
  laws: LawBinding[];
  kit: Kit;
}

/**
 * The code behind one sort of handle: its empty form, how the expectations the
 * rules state into it accumulate, how they are compared with the handle, how a
 * difference is answered, and how two handles differ.
 */
export interface HandleKind {
  kind: string;
  /** The roles its answers are recorded as; the schema's `records` names a gist for each. */
  roles: string[];
  empty(schema: Schema): Json;
  /** A fresh accumulator for one reading. */
  start(schema: Schema): unknown;
  /** The thread's expectation, read out of the accumulator, as a handle of this kind. */
  expected(acc: unknown): Json;
  /** Every difference, in a fixed order. */
  compare(acc: unknown, found: Json): HandleDenunciation[];
  /** The handle with one difference answered, and the record line's role and payload. */
  answer(d: HandleDenunciation, found: Json): { handle: Json; role: string; payload: Payload };
  /** What changed between two handles of this kind, for a host to apply. */
  diff(before: Json, after: Json): Change[];
}

/** The code behind one rule: it reads a binding and states expectations into handle kinds. */
export interface RuleKind {
  rule: string;
  /** The handle kinds its expectations go into: a kit that lacks one cannot hold the rule. */
  handles: string[];
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): RuleBinding | string;
  /**
   * Why a payload cannot carry this binding, in English and without the gist, or nothing. `payload` is the draft with
   * each reference that resolves replaced by its value and the others left as they are: a reference counts as present
   * and is not checked. `written` is the draft as it was written, and `schema` the schema it is written under.
   */
  admit(binding: RuleBinding, payload: Payload, written: Payload, schema: Schema): string | undefined;
  /** States what the line expects, into the accumulators of the handle kinds; the line's payload is read with each reference replaced, one left out when its key is not stated. */
  expect(binding: RuleBinding, line: EventLine, acc: (kind: string) => unknown): void;
}

/** The code behind one law: it judges what a line would leave behind. */
export interface LawKind {
  law: string;
  /** The binding as typed, or a problem in English. Unknown keys are a problem. */
  read(binding: Record<string, unknown>, schema: SchemaHead): LawBinding | string;
  /** `before` is the thread as it was, `after` as the line would leave it, settled; `schema` gives what a condition names. */
  judge(
    binding: LawBinding,
    before: { reading: Reading; handles: Handles; lines: EventLine[] },
    after: { reading: Reading; handles: Handles; lines: EventLine[] },
    schema: Schema,
  ): Array<Omit<Verdict, 'strength' | 'law'>>;
}

/** The handle, rule and law kinds a schema may use. */
export interface Kit {
  handles: HandleKind[];
  rules: RuleKind[];
  laws: LawKind[];
}
