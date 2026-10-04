// The activity thread's vocabulary. This folder imports nothing outside itself:
// the client runs the same code, so it can read a thread the way the server does.

/** SHA-256, 64 hex characters. */
export type LineId = string;

/** `KIN::ID`, for example `user::mrossi` or `goal::<line id>`. */
export type Writer = `${string}::${string}`;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Payload = { [key: string]: Json };

export interface EventLine {
  id: LineId;
  /** The thread's last line when this one was written; null on the first. */
  previous: LineId | null;
  gist: string;
  writer: Writer;
  /** Server time, as `Date.prototype.toISOString` writes it. */
  timestamp: string;
  payload: Payload;
}

/** What a writer hands over. The host states `writer` from the identity it authenticated. */
export type LineDraft = Pick<EventLine, 'gist' | 'writer' | 'payload'>;

export type RuleBinding =
  /** The line revokes the line whose id is under `payload[from]`, if its gist is listed. */
  | { rule: 'revoke'; from: string; gists: string[] }
  /** The users under `payload[from]` are expected as assignees. */
  | { rule: 'assign'; from: string; required?: boolean }
  /** The line's writer stops being expected as an assignee, until a later line asks again. */
  | { rule: 'release' }
  /** Metadata `key` is expected to be `payload[from]`. */
  | { rule: 'metadata'; key: string; from: string; required?: boolean; where?: Payload }
  /** Metadata `key` is expected to be `value`. */
  | { rule: 'metadata'; key: string; value: Json; where?: Payload }
  /** Metadata `key` is expected to be the list of every `payload[collect]` the lines in force state. */
  | { rule: 'metadata'; key: string; collect: string; required?: boolean; where?: Payload }
  /** The line is a goal: it reads `name`, `checks`, `then`, and optionally `with` and `final`, from its payload. */
  | { rule: 'goal' };

export interface GistSchema {
  gist: string;
  /** The kins that may write it. */
  writers: string[];
  rules: RuleBinding[];
  /** When it may be written; a gist with none may be written at any point of a thread. */
  when?: When;
}

/** When a gist may be written. Every stated part must hold. */
export interface When {
  /** Each check finds a line in force, as a goal's checks do. */
  checks?: Check[];
  /** The writer is one of the assignees the thread expects. */
  assignee?: true;
  /** Each key is, in the metadata the thread expects, the value given. */
  metadata?: Record<string, Json>;
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

/** The two plain values of an activity that its thread explains. */
export interface Handles {
  metadata: Record<string, Json>;
  assignees: string[];
}

export type Denunciation =
  /** `expected` absent: no line expects the key. `found` absent: the activity lacks it. */
  | { sort: 'metadata'; key: string; expected?: Json; found?: Json; line?: LineId }
  /** `expected` true: a line asks and the activity lacks. False: the activity has, no line asks. */
  | { sort: 'assignment'; user: string; expected: boolean; line?: LineId }
  /** A line a goal owes the thread: its outcome once met, or a warning. `line` is the goal; `payload` is what the line carries. */
  | { sort: 'line'; gist: string; writer: Writer; line: LineId; payload: Payload }
  /** A zero-gist rule. Nothing can reconcile it. */
  | { sort: 'thread'; rule: 'one-create'; found: number };

export interface GoalReading {
  line: LineId;
  name: string;
  then: string;
  /** `orphan`: no line in force holds what the check names, so it cannot come true. Read only where warnings are. */
  checks: Array<{ check: Check; foundIn?: LineId; orphan?: true }>;
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

export interface Reading {
  inForce: LineId[];
  revoked: LineId[];
  /** What the thread expects the handles to be. */
  expected: Handles;
  goals: GoalReading[];
  denunciations: Denunciation[];
  settled: boolean;
}

/** An activity as this folder knows it: its thread, in order of arrival, and its handles. */
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

export type LawName = 'keeps-assignee' | 'keeps-goals' | 'settles';

/** A law judges what a user's line would leave behind. `confirm` lets it through when the writer says so. */
export interface Law {
  law: LawName;
  strength: 'refuse' | 'confirm';
}

/** One law a dry run found broken. */
export interface Verdict {
  law: LawName;
  strength: 'refuse' | 'confirm';
  /** For developers, in English. */
  detail: string;
  /** `keeps-goals`: the goal and the index of the check that would be orphaned. */
  goal?: LineId;
  check?: number;
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
