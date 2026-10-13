// What a client does with the words of the domain in use (`domain.ts`): the labels, the sentences of
// a line, a check, a condition, a goal, a record, a law, and what a draft would cause. The domain holds the
// data; these are the functions that read it, and they name no gist.

import { conditionProblem, isValueReference, kinOf, nodes, type Check, type Condition, type DryRun, type EventLine, type Json, type Operand, type Payload, type Trace, type Verdict, type Writer } from 'consequitur';
import { domain } from './domain.ts';

export const uiOf = (gist: string) => domain().uiOf(gist);

/** The position of a gist in the bar, for sorting; a gist with no entry goes last. */
export const uiIndex = (gist: string): number => domain().uiIndex(gist);

export const gistLabel = (gist: string): string => uiOf(gist)?.label ?? gist;

/** The gists of the goals' own bookkeeping: the ledger hides them until asked, and the dock tells what they say. */
export const isGoalLine = (gist: string): boolean => domain().goalLines.has(gist);

/** The gist of a goal's warning. */
export const warningGist = (): string | undefined => domain().schema.records.warning;

/** What a writer's kin is called, for the badge on a fact. */
export const KIN_WORDS: Record<string, string> = { user: 'utente', system: 'sistema', goal: 'traguardo' };

/** The words a person reads on the optional comment's text area. */
export const NOTE_PLACEHOLDER = 'Aggiungi un commento (facoltativo)';

export const userName = (id: string): string => domain().people.find((p) => p.id === id)?.name ?? id;

/** A memo's text as a person reads it: a mention of a known user is written with the user's name. The stored text keeps the id. */
export const readable = (text: string): string => text.replace(domain().mention, (_, id: string) => `@${userName(id)}`);

/** The users a payload value names: a string, or a list of strings. */
export const usersOf = (value: Json | undefined): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function writerName(writer: Writer): string {
  const at = writer.indexOf('::');
  const kin = writer.slice(0, at);
  if (kin === 'user') return userName(writer.slice(at + 2));
  if (kin === 'goal') return 'Il traguardo';
  if (kin === 'system') return domain().systemName;
  return writer;
}

/** A payload value in a sentence: a user is by name, a list is its items, a reference to the value handle is «attuale», anything else as it is. */
function said(value: Json | undefined): string {
  if (typeof value === 'string') return domain().people.some((p) => p.id === value) ? userName(value) : value;
  if (isValueReference(value)) return 'attuale';
  if (Array.isArray(value)) return value.map(said).join(', ');
  return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** A mark card's sentence: {writer} is the writer's name, any other {key} the payload's value. */
export function sayOf(ui: ReturnType<typeof uiOf>, line: EventLine): string {
  const text = ui?.says ?? ui?.label ?? line.gist;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => (key === 'writer' ? writerName(line.writer) : said(line.payload[key])));
}

export const documentSubject = (code: string): string | undefined => domain().documents?.subject(code);

/** `HH:MM:SS` in Italian time. */
export const timeOf = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString('it-IT', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const WORDS_IN_A_LABEL = 6;

/** What a person recognises a line by: its gist, its writer, the time, and the first words of its text. */
export function lineLabel(line: EventLine): string {
  const parts = [gistLabel(line.gist), writerName(line.writer), timeOf(line.timestamp)];
  const excerpt = uiOf(line.gist)?.excerpt;
  const text = excerpt === undefined ? undefined : line.payload[excerpt];
  if (typeof text === 'string') {
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
    return line ? lineLabel(line) : domain().people.some((p) => p.id === value) ? userName(value) : readable(value);
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
  const keyed = entries.find((a) => a.each !== undefined && check.payload !== undefined && a.each.key in check.payload && a.key in check.payload);
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
  const by = awaited.each === undefined ? undefined : check.payload?.[awaited.each.key];
  const line = typeof asked === 'string' ? lines.find((l) => l.id === asked) : undefined;
  return awaited.phrase.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (key === 'who') return check.writer === undefined ? 'qualcuno' : writerName(check.writer);
    if (key === 'line') return line ? lineLabel(line) : `un ${gistLabel(awaited.on).toLowerCase()}`;
    if (key === 'document') return typeof asked === 'string' ? asked : '';
    if (key === 'by') return typeof by === 'string' ? userName(by) : '';
    const value = check.payload?.[key];
    return value === undefined ? whole : said(value);
  });
}

/** What a goal does when it is met, as a sentence. */
export function outcomeSentence(then: string, outcome: Payload | undefined): string {
  const doing = domain().goals?.outcomes.find((o) => o.then === then);
  if (!doing) return `→ scrive «${gistLabel(then)}»`;
  const empty = (key: string) => said(outcome?.[key]) === '';
  const keys = [...doing.sentence.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (doing.bare !== undefined && keys.some(empty)) return doing.bare;
  return doing.sentence.replace(/\{(\w+)\}/g, (_, key: string) => said(outcome?.[key])).trim();
}

/** An operand of a condition in a sentence: a reference by what it reads, a value as a person reads it under the key it is compared with. */
function operandSentence(operand: Operand, key?: string): string {
  if (operand === null || typeof operand !== 'object') return key === undefined ? said(operand) : metadataValue(key, operand, []);
  if ('$value' in operand) return metadataLabel(operand.$value);
  if ('$set' in operand) return `«${domain().sets[operand.$set]?.label ?? operand.$set}»`;
  if ('$writer' in operand) return operand.$writer === 'id' ? 'chi scrive' : 'il tipo di chi scrive';
  if ('$now' in operand) return 'adesso';
  return `«${operand.$draft}» della riga`;
}

/** The words of the four comparisons, between their two operands. */
const ORDER_WORDS = { before: 'è prima di', after: 'è dopo', less: 'è meno di', more: 'è più di' } as const;

/** A comparison in a sentence: its two operands, a value as the left's key reads it, and the days that move the right one. */
function comparisonSentence(word: keyof typeof ORDER_WORDS, [left, right]: [Operand, Operand], days = 0): string {
  const key = typeof left === 'object' && left !== null && '$value' in left ? left.$value : undefined;
  const moved = days === 0 ? '' : ` ${days > 0 ? 'più' : 'meno'} ${Math.abs(days)} ${Math.abs(days) === 1 ? 'giorno' : 'giorni'}`;
  return `${operandSentence(left)} ${ORDER_WORDS[word]} ${operandSentence(right, key)}${moved}`;
}

/**
 * The sentence of one node of a condition, without its children: a `line` is its check's sentence, a guard
 * the domain's words for it, `is`, `has` and the comparisons what they compare; `all`, `any`, `atLeast` and `not` say how their
 * children count, and the children follow.
 */
export function nodeSentence(condition: Condition, lines: EventLine[], check?: Check): string {
  if ('line' in condition) return checkSentence(check ?? condition.line, lines);
  if ('guard' in condition) return domain().guards[condition.guard] ?? `«${condition.guard}»`;
  if ('is' in condition) {
    const key = typeof condition.is === 'object' && condition.is !== null && '$value' in condition.is ? condition.is.$value : undefined;
    const values = condition.values.map((v) => (typeof v === 'object' && v !== null && '$set' in v ? `tra ${operandSentence(v)}` : `«${operandSentence(v, key)}»`));
    return `${operandSentence(condition.is)} è ${values.join(' o ')}`;
  }
  if ('has' in condition) return `${operandSentence(condition.has)} non è vuoto`;
  if ('before' in condition) return comparisonSentence('before', condition.before, condition.days);
  if ('after' in condition) return comparisonSentence('after', condition.after, condition.days);
  if ('less' in condition) return comparisonSentence('less', condition.less);
  if ('more' in condition) return comparisonSentence('more', condition.more);
  if ('not' in condition) return 'non è vero che:';
  if ('all' in condition) return 'tutte queste:';
  if ('any' in condition) return 'almeno una di queste:';
  return `almeno ${condition.atLeast} di queste:`;
}

/** A whole condition, as one sentence: the children of a node that counts them follow it, separated by «;». */
export function conditionSentence(condition: Condition, lines: EventLine[]): string {
  const children = 'not' in condition ? [condition.not] : 'all' in condition ? condition.all : 'any' in condition ? condition.any : 'atLeast' in condition ? condition.of : [];
  const head = nodeSentence(condition, lines);
  return children.length === 0 ? head : `${head} ${children.map((child) => conditionSentence(child, lines)).join('; ')}`;
}

/** A goal's stored condition as a trace nothing has read: every node unmet, a guard with its body. One the core would not read is an empty `all`. */
export function unread(when: Json | undefined): Trace {
  const { schema } = domain();
  const walk = (condition: Condition): Trace => {
    const children = 'not' in condition ? [condition.not] : 'all' in condition ? condition.all : 'any' in condition ? condition.any : 'atLeast' in condition ? condition.of : 'guard' in condition ? [schema.guards[condition.guard]] : [];
    return children.length === 0 ? { condition, holds: false } : { condition, holds: false, children: children.map(walk) };
  };
  return conditionProblem(when, schema, false) === undefined ? walk(when as unknown as Condition) : { condition: { all: [] }, holds: false };
}

/** The sentence of the node at a path of a goal line's condition, or nothing when there is none there. */
function sentenceAt(goal: EventLine | undefined, path: unknown, lines: EventLine[]): string | undefined {
  if (goal === undefined || typeof path !== 'string') return undefined;
  const node = nodes(unread(goal.payload.when)).find((n) => n.path === path)?.node;
  return node && conditionSentence(node.condition, lines);
}

/** A goal's warning, as a sentence: the goal by name and the condition that cannot come true. */
export function warningSentence(warning: EventLine, lines: EventLine[]): string {
  const goalId = warning.writer.slice(warning.writer.indexOf('::') + 2);
  const goal = lines.find((l) => l.id === goalId);
  const name = typeof goal?.payload.name === 'string' ? goal.payload.name : '';
  return `Il traguardo «${name}» non può più avverarsi: ${sentenceAt(goal, warning.payload.path, lines) ?? 'una sua condizione'}`;
}

export const metadataLabel = (key: string): string => domain().values[key]?.label ?? key;

export function metadataValue(key: string, value: Json, lines: EventLine[]): string {
  const ui = domain().values[key];
  if (ui?.kind === 'line') {
    const line = typeof value === 'string' ? lines.find((l) => l.id === value) : undefined;
    return line ? lineLabel(line) : 'una riga';
  }
  // a list may hold people (the approvals): each id reads as the person's name, as a mention does
  if (ui?.kind === 'list' && Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? (domain().people.some((p) => p.id === v) ? userName(v) : v) : JSON.stringify(v))).join(', ');
  const word = ui?.words?.[String(value)];
  if (word !== undefined) return word;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The words of a set's sentence, with the member's name in it. */
export const memberSentence = (text: string, member: Json | undefined): string => text.replace('{member}', typeof member === 'string' ? userName(member) : '');

/** A record line, as the card and the preview say it: the role is the one the head's `records` gives its gist. */
export function recordSentence(line: EventLine, lines: EventLine[]): string {
  const { payload } = line;
  const key = typeof payload.key === 'string' ? payload.key : '';
  const role = Object.entries(domain().schema.records).find(([, gist]) => gist === line.gist)?.[0];
  const set = typeof payload.set === 'string' ? domain().sets[payload.set] : undefined;
  if (role === 'join' && set) return memberSentence(set.joined, payload.member);
  if (role === 'leave' && set) return memberSentence(set.left, payload.member);
  return 'value' in payload ? `${metadataLabel(key)} → ${metadataValue(key, payload.value, lines)}` : `${metadataLabel(key)} tolto`;
}

/** A law a dry run found broken, as a sentence; `lines` are the thread's, where the goal of a check is read. */
export function verdictSentence(verdict: Verdict, lines: EventLine[]): string {
  if (verdict.law === 'keeps-goals') {
    const goal = lines.find((l) => l.id === verdict.goal);
    const name = typeof goal?.payload.name === 'string' ? goal.payload.name : '';
    return `Il traguardo «${name}» non potrebbe più avverarsi: ${sentenceAt(goal, verdict.path, lines) ?? 'una sua condizione'}.`;
  }
  // a law about a set is worded by the set
  const set = verdict.law === 'keeps-set' ? (verdict.set ?? '') : '';
  return domain().laws[verdict.law]?.[set] ?? 'Questa riga violerebbe una regola dello schema.';
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
  if (line.gist === warningGist()) return warningSentence(line, lines);
  if (kinOf(line.writer) === 'goal') {
    const goalId = line.writer.slice(line.writer.indexOf('::') + 2);
    const name = lines.find((l) => l.id === goalId)?.payload.name;
    return `Il traguardo «${typeof name === 'string' ? name : ''}» è raggiunto ${outcomeSentence(line.gist, line.payload)}`;
  }
  return `${gistLabel(line.gist)} · ${writerName(line.writer)}`;
}

/** The preview of a dry run. Pure. */
export function previewOf(run: DryRun, gist: string): Preview {
  if (run.refusal) return { gist, unsent: domain().words.refusals[run.refusal.code], happens: [], verdicts: [], confirm: false };
  const lines = run.state.lines;
  return {
    gist,
    happens: run.added.slice(1).map((line) => addedSentence(line, lines)),
    verdicts: verdictsOf(run.verdicts, lines),
    confirm: run.verdicts.some((v) => v.strength === 'confirm') && !run.verdicts.some((v) => v.strength === 'refuse'),
  };
}
