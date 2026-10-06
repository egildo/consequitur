// Conditions: when a gist may be written, when a goal is met, while a law holds. consequitur's form
// (`Condition`) is the one a schema and a goal's payload store. `kdlet-guards` reads it in the module's
// own form, to which this file translates it for one evaluation, with a host that resolves the
// references from the thread and registers consequitur's two words, `line` and `at-least`; the module's
// trace is translated back into consequitur's. The module's form is never stored.
//
// Pure: the same condition and scope give the same answer. The reading is closed-world: a reference to
// something no line states is absent, and an absent operand makes `is` false. The one unknown is the draft
// a menu is drawn for: there, a node that reads `$draft` is neither true nor false.

import { check, evaluate, problems, UNKNOWN, type Condition as ModuleCondition, type Host, type Operand as ModuleOperand, type Ref, type Trace as ModuleTrace, type Word } from 'kdlet-guards';
import { matches, resolvePayload, validCheck } from './check.ts';
import type { Check, Condition, EventLine, Handles, Json, LineId, Operand, Payload, Reference, Trace, Writer } from './types.ts';
import { has, idOf, isObject, isRecord, kinOf } from './util.ts';

/** What a condition may name: the schema's sets and its named guards. */
export interface Names {
  sets: string[];
  guards: Record<string, Condition>;
}

const FROM = ['value', 'set', 'writer', 'draft'];

/** The first thing wrong with an operand, or undefined. `$writer` and `$draft` stand only in a `when`. */
function operandProblem(value: unknown, names: Names, inWhen: boolean): string | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : 'a number operand must be finite.';
  const keys = isObject(value) ? Object.keys(value) : [];
  if (!isObject(value) || keys.length !== 1 || !FROM.includes(keys[0].slice(1)) || !keys[0].startsWith('$') || typeof value[keys[0]] !== 'string') {
    return 'an operand is a string, a number, a boolean, null, or a reference: $value, $set, $writer or $draft, naming a string.';
  }
  const [key] = keys;
  const field = value[key] as string;
  if (key === '$set' && !names.sets.includes(field)) return `the reference names the set "${field}", which the schema does not declare.`;
  if (key === '$writer' && field !== 'id' && field !== 'kin') return '$writer reads id or kin.';
  if ((key === '$writer' || key === '$draft') && !inWhen) return `${key} may stand only in a when.`;
  return undefined;
}

/**
 * The first thing wrong with a condition, in English, or undefined. Every node has exactly the keys of its
 * kind; `all`, `any` and `atLeast`'s `of` hold at least one condition, and `atLeast` is a whole number from
 * one to their count; a `line` holds a check; a guard is one the schema names. `$writer` and `$draft` stand
 * only in a `when` (`inWhen`), and elsewhere not in a guard the condition uses either.
 */
export function conditionProblem(value: unknown, names: Names, inWhen: boolean): string | undefined {
  const entered = new Set<string>();
  const list = (items: unknown, word: string): string | undefined => {
    if (!Array.isArray(items) || items.length === 0) return `${word} must hold a non-empty list of conditions.`;
    for (const item of items) {
      const problem = visit(item);
      if (problem !== undefined) return problem;
    }
    return undefined;
  };
  const visit = (node: unknown): string | undefined => {
    if (!isObject(node)) return 'a condition is an object.';
    const keys = Object.keys(node);
    const shape = (...words: string[]) => keys.length === words.length && words.every((w) => keys.includes(w));
    if (shape('is', 'values')) {
      if (!Array.isArray(node.values) || node.values.length === 0) return 'is must have a non-empty list of values.';
      // a set stands for its members only among the values: on the left it could never equal one
      if (isObject(node.is) && has(node.is, '$set')) return 'the left operand of is cannot be a $set: a set stands for its members among the values.';
      for (const operand of [node.is, ...node.values]) {
        const problem = operandProblem(operand, names, inWhen);
        if (problem !== undefined) return problem;
      }
      return undefined;
    }
    if (shape('has')) return operandProblem(node.has, names, inWhen);
    if (shape('not')) return visit(node.not);
    if (shape('all')) return list(node.all, 'all');
    if (shape('any')) return list(node.any, 'any');
    if (shape('guard')) {
      const name = node.guard;
      if (typeof name !== 'string' || !Object.hasOwn(names.guards, name)) return `the guard ${JSON.stringify(name) ?? 'nothing'} is not one the schema names.`;
      // a guard's own references are checked where it is written; here only whether it may be used outside a `when`
      if (inWhen || entered.has(name)) return undefined;
      entered.add(name);
      return visit(names.guards[name]);
    }
    if (shape('line')) return validCheck(node.line) ? undefined : 'line must hold a check: a gist, a kin, a writer or a payload, and nothing else.';
    if (shape('atLeast', 'of')) {
      const problem = list(node.of, 'of');
      if (problem !== undefined) return problem;
      const n = node.atLeast;
      const fits = typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= (node.of as unknown[]).length;
      return fits ? undefined : 'atLeast must be a whole number from 1 to the count of its conditions.';
    }
    return 'a condition has exactly one of is (with values), has, not, all, any, guard, line and atLeast (with of).';
  };
  return visit(value);
}

/** The words consequitur registers: `line` and `at-least`. `problems` asks only that they exist; the reader above checks their use. */
const NO_WORDS: Record<string, Word> = { line: { test: () => ({ holds: false }) }, 'at-least': { test: () => ({ holds: false }) } };

/**
 * The problems of a schema's named guards: an object of conditions, each read as a `when` reads (a guard
 * may read the writer and the draft; a goal that uses such a guard is refused where the goal is read), and
 * none that names a guard the object lacks, or depends on itself.
 */
export function guardsProblems(value: unknown, sets: string[]): string[] {
  if (!isObject(value)) return ['guards must be an object of conditions, by name.'];
  const guards = value as Record<string, Condition>;
  const names = { sets, guards };
  const out: string[] = [];
  for (const [name, body] of Object.entries(guards)) {
    const problem = name === '' ? 'a guard has a name.' : conditionProblem(body, names, true);
    if (problem !== undefined) out.push(`guard "${name}": ${problem}`);
  }
  if (out.length > 0) return out;
  const translated = Object.fromEntries(Object.entries(guards).map(([name, body]) => [name, toModuleForm(body)]));
  for (const body of Object.values(translated)) out.push(...problems(body, { guards: translated, words: NO_WORDS }));
  return [...new Set(out)];
}

const refOf = (reference: Reference): Ref => {
  const [[key, field]] = Object.entries(reference) as Array<[string, string]>;
  return { from: key.slice(1), field };
};

const isReference = (operand: Operand): operand is Reference => typeof operand === 'object' && operand !== null;

/**
 * consequitur's form to the module's: a reference becomes a `ref` (`$value` reads from `value`, and so on),
 * `line` and `atLeast` become the words `line` and `at-least`. Given `members`, a `$set` among an `is`'s values
 * is replaced by the set's members, as an evaluation needs; without it, the translation is the inverse of
 * `fromModuleForm`.
 */
export function toModuleForm(condition: Condition, members?: (set: string) => string[]): ModuleCondition {
  const operand = (o: Operand): ModuleOperand => (isReference(o) ? { ref: refOf(o) } : o);
  const go = (c: Condition): ModuleCondition => toModuleForm(c, members);
  if ('is' in condition) {
    const values = condition.values.flatMap((v) => (members && isReference(v) && '$set' in v ? members(v.$set) : [operand(v)]));
    return { is: operand(condition.is), values };
  }
  if ('has' in condition) return { has: operand(condition.has) };
  if ('not' in condition) return { not: go(condition.not) };
  if ('all' in condition) return { all: condition.all.map(go) };
  if ('any' in condition) return { any: condition.any.map(go) };
  if ('guard' in condition) return { guard: condition.guard };
  if ('line' in condition) return { word: 'line', args: asJson(condition.line) };
  return { word: 'at-least', args: condition.atLeast, body: condition.of.map(go) };
}

/**
 * The module's form to consequitur's, for a schema read from elsewhere: a `ref` from `value`, `set`, `writer` or
 * `draft` becomes a reference, the words `line` and `at-least` the two nodes. What consequitur's form cannot say
 * (another word, a reference from elsewhere) is a problem, in English. Whether the result is a valid condition is
 * `conditionProblem`'s to say.
 */
export function fromModuleForm(condition: ModuleCondition): Condition | string {
  let problem: string | undefined;
  const fail = (why: string): Condition => {
    problem ??= why;
    return { all: [] };
  };
  const operand = (o: ModuleOperand): Operand => {
    if (typeof o !== 'object' || o === null) return o;
    const { from, field } = o.ref;
    if (from === 'value') return { $value: field };
    if (from === 'set') return { $set: field };
    if (from === 'draft') return { $draft: field };
    if (from === 'writer' && (field === 'id' || field === 'kin')) return { $writer: field };
    fail(`the reference (${from})${field} is not one consequitur reads.`);
    return null;
  };
  const go = (c: ModuleCondition): Condition => {
    if ('is' in c) return { is: operand(c.is), values: c.values.map(operand) };
    if ('has' in c) return { has: operand(c.has) };
    if ('not' in c) return { not: go(c.not) };
    if ('all' in c) return { all: c.all.map(go) };
    if ('any' in c) return { any: c.any.map(go) };
    if ('guard' in c) return { guard: c.guard };
    if (c.word === 'line') return { line: (c.args ?? {}) as unknown as Check };
    if (c.word === 'at-least') return { atLeast: typeof c.args === 'number' ? c.args : Number.NaN, of: (c.body ?? []).map(go) };
    return fail(`the word "${c.word}" is not one consequitur registers.`);
  };
  const out = go(condition);
  return problem ?? out;
}

/** A check is JSON, but an interface does not say so. */
const asJson = (check: Check): Json => check as unknown as Json;

/** What a condition is read against: what the thread expects, the lines in force, and, for a `when`, who writes what. */
export interface Scope {
  /** The handles a reference reads: `$value` the value handle, `$set` the set handle. */
  handles: Handles;
  /** The lines a `line` node looks among: those in force. */
  lines: EventLine[];
  /** The schema's named guards. */
  guards: Record<string, Condition>;
  /** The line a `line` node never finds: a goal's own. */
  self?: LineId;
  /** The writer of the line being written, which `$writer` reads. */
  writer?: Writer;
  /** The payload of the line being written, which `$draft` reads; `unknown` for a menu, drawn before there is a draft. */
  draft?: Payload | 'unknown';
}

/** The members a set handle holds in one set; anything that is not a list of names holds none. */
const membersOf = (handles: Handles, set: string): string[] => {
  const sets = isRecord(handles.set) ? handles.set : {};
  const list = sets[set];
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
};

/** The check with each `$value` in its payload replaced by what the value handle holds, or nothing when a key is not held. */
export function resolveCheck(line: Check, handles: Handles): Check | undefined {
  if (line.payload === undefined) return line;
  const payload = resolvePayload(line.payload, isRecord(handles.value) ? handles.value : {});
  return Object.keys(payload).length === Object.keys(line.payload).length ? { ...line, payload } : undefined;
}

/** `at-least n`: true with n children true, false when fewer than n could still be, otherwise unknown. */
const atLeastWord: Word = {
  test(args, body = []) {
    const n = typeof args === 'number' ? args : Number.POSITIVE_INFINITY;
    const yes = body.filter((t) => t.holds).length;
    const open = body.filter((t) => t.unknown).length;
    if (yes >= n) return { holds: true };
    return yes + open >= n ? { holds: false, unknown: true } : { holds: false };
  },
};

/** The host of one evaluation: the references resolved from the scope, the guards translated, the two words. */
function hostOf(scope: Scope): Host {
  const members = (set: string) => membersOf(scope.handles, set);
  const line: Word = {
    test(args): ReturnType<Word['test']> {
      if (!validCheck(args)) return { holds: false };
      const resolved = resolveCheck(args, scope.handles);
      if (resolved === undefined) return { holds: false, detail: {} };
      const hit = scope.lines.find((l) => l.id !== scope.self && matches(resolved, l));
      return hit ? { holds: true, detail: { check: asJson(resolved), foundIn: hit.id } } : { holds: false, detail: { check: asJson(resolved) } };
    },
  };
  return {
    resolve(ref) {
      if (ref.from === 'value') {
        const values = isRecord(scope.handles.value) ? scope.handles.value : {};
        return has(values, ref.field) ? values[ref.field] : undefined;
      }
      if (ref.from === 'set') return isRecord(scope.handles.set) && has(scope.handles.set, ref.field) ? members(ref.field) : undefined;
      if (ref.from === 'writer') return ref.field === 'id' ? idOf(scope.writer) : ref.field === 'kin' ? kinOf(scope.writer) : undefined;
      if (ref.from === 'draft') return scope.draft === 'unknown' ? UNKNOWN : has(scope.draft, ref.field) ? scope.draft![ref.field] : undefined;
      return undefined;
    },
    guards: Object.fromEntries(Object.entries(scope.guards).map(([name, body]) => [name, toModuleForm(body, members)])),
    words: { line, 'at-least': atLeastWord },
    missing: 'false',
  };
}

/** Whether a condition holds in a scope: true, false, or `unknown` when it hangs on the draft a menu does not have. */
export function conditionHolds(condition: Condition, scope: Scope): boolean | 'unknown' {
  const host = hostOf(scope);
  const answer = check(toModuleForm(condition, (set) => membersOf(scope.handles, set)), host);
  return answer.unknown ? 'unknown' : answer.holds;
}

/**
 * Reads a condition in a scope, node by node. Every node has its trace, those the module did not need to ask
 * (an `all` stops at its first child that fails, an `any` at its first that holds) included, so a screen can
 * tick each one and the reading can say which can no longer hold.
 */
export function evaluateCondition(condition: Condition, scope: Scope): Trace {
  const host = hostOf(scope);
  const members = (set: string) => membersOf(scope.handles, set);
  const again = (c: Condition): ModuleTrace => evaluate(toModuleForm(c, members), host);
  const back = (c: Condition, node: ModuleTrace | undefined): Trace => {
    const found = node ?? again(c);
    const out: Trace = { condition: c, holds: found.holds };
    const kids = found.children ?? [];
    const child = (item: Condition, i: number) => back(item, kids[i]);
    if ('not' in c) out.children = [child(c.not, 0)];
    else if ('all' in c) out.children = c.all.map(child);
    else if ('any' in c) out.children = c.any.map(child);
    else if ('atLeast' in c) out.children = c.of.map(child);
    // a guard's body is in its trace once it was asked; one that failed (a cycle) has none
    else if ('guard' in c && kids[0] !== undefined && Object.hasOwn(scope.guards, c.guard)) out.children = [back(scope.guards[c.guard], kids[0])];
    else if ('line' in c && isObject(found.detail)) {
      if (validCheck(found.detail.check)) out.check = found.detail.check;
      if (typeof found.detail.foundIn === 'string') out.foundIn = found.detail.foundIn;
    }
    return out;
  };
  return back(condition, evaluate(toModuleForm(condition, members), host));
}

/** Every node of a trace with its path, depth first from the root, whose path is "". */
export function nodes(trace: Trace): Array<{ path: string; node: Trace }> {
  const out: Array<{ path: string; node: Trace }> = [];
  const walk = (node: Trace, path: string) => {
    out.push({ path, node });
    node.children?.forEach((child, i) => walk(child, path === '' ? String(i) : `${path}.${i}`));
  };
  walk(trace, '');
  return out;
}

/**
 * Marks each node of a trace that can no longer hold, given when a `line` node cannot: an `all` when a child
 * cannot, an `any` when none can, an `atLeast n` when fewer than n can, a guard as its body; `not`, `is` and `has`
 * never. A node that holds is never marked. Answers whether the root is.
 */
export function markLost(trace: Trace, lineLost: (node: Trace) => boolean): boolean {
  const lost = (trace.children ?? []).map((child) => markLost(child, lineLost));
  const c = trace.condition;
  const is =
    'line' in c ? !trace.holds && lineLost(trace)
    : 'all' in c ? lost.some(Boolean)
    : 'any' in c ? lost.every(Boolean)
    : 'atLeast' in c ? lost.filter((l) => !l).length < c.atLeast
    : 'guard' in c ? lost[0] === true
    : false;
  if (is) trace.lost = true;
  return is;
}

/**
 * The path of the node that made a lost trace lost: down from the root, through an `all` to its first child
 * that is lost and through a guard to its body, to the node where the loss is its own (a `line`) or its
 * children's together (an `any`, an `atLeast`). Nothing when the root is not lost.
 */
export function lostAt(trace: Trace): string | undefined {
  if (!trace.lost) return undefined;
  let node = trace;
  let path = '';
  for (;;) {
    const c = node.condition;
    const i = 'all' in c ? (node.children ?? []).findIndex((child) => child.lost) : 'guard' in c && node.children?.[0]?.lost ? 0 : -1;
    if (i < 0) return path;
    node = node.children![i];
    path = path === '' ? String(i) : `${path}.${i}`;
  }
}
