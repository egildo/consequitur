// A schema written in KDL: read into the schema object, the JSON that `readSchema` reads, and written
// back. JSON stays the model (a goal is a line, and payloads are JSON); KDL is how a person writes a
// schema. Conditions are read and written by `kdlet-guards/kdl`, in the module's form, which
// `consequitur`'s `fromModuleForm` and `toModuleForm` translate; a `line` node, whose check holds a
// payload, and `at-least`, whose argument is one number, are read and written here.
//
//     name sibar-activity
//     version 1
//     opening create
//     authority "system::sibardoc"
//     sets assignees
//     records value=metadata_set join=assigned leave=unassigned warning=goal_warning
//     judged user
//     guard assignee {
//         is (writer)id (set)assignees
//     }
//     gist got_it user {
//         value key=acknowledged from=about required=#true
//         when {
//             all {
//                 guard assignee
//                 line gist=memo
//             }
//         }
//     }
//     law keeps-set set=assignees strength=refuse {
//         while {
//             is (value)status open
//         }
//     }
//
// A binding's keys of plain value are its properties; one whose value is a list is a child node with
// the items as arguments, one whose value is an object of plain values a child node with them as
// properties. The reader checks the shape of the text and says where it is wrong; what the schema means
// is `readSchema`'s to check.

import { clearFormat, Document, Entry, format, InvalidKdlError, Node, parse } from '@bgotink/kdl';
import { fromModuleForm, toModuleForm, type Check, type Condition, type Json, type Payload } from 'consequitur';
import type { Condition as ModuleCondition, Problem } from 'kdlet-guards';
import { locOf, readBody, writeGuard } from 'kdlet-guards/kdl';

type Primitive = string | number | boolean | null;
type Sink = Problem[];

/** The tags that make a reference in a condition. */
const FROM = ['value', 'set', 'writer', 'draft', 'now'];

/** The words consequitur registers on the module. */
const WORDS = ['line', 'at-least'];

const isPlain = (value: Json): value is Primitive => value === null || typeof value !== 'object';

const problem = (sink: Sink, message: string, at: Node | Entry): void => {
  const { line, column } = locOf(at);
  sink.push({ message, line, column });
};

/** The entries of a node, its arguments and its properties apart. */
const entriesOf = (node: Node) => ({ args: node.getArgumentEntries(), props: node.getPropertyEntries() });

/** A plain value of an entry, or a problem where it has a tag. */
function plain(sink: Sink, entry: Entry, what: string): Primitive | undefined {
  if (entry.getTag() === null) return entry.getValue();
  problem(sink, `${what} takes plain values, not a tagged one`, entry);
  return undefined;
}

/** The plain words a node holds as its arguments; it has no properties, and a body only where `body` says. */
function words(sink: Sink, node: Node, body = false): string[] {
  const { args, props } = entriesOf(node);
  if (!body) for (const entry of props) problem(sink, `"${node.getName()}" takes no properties`, entry);
  if (!body && node.hasChildren()) problem(sink, `"${node.getName()}" takes no body`, node);
  return args.flatMap((entry) => {
    const value = plain(sink, entry, `"${node.getName()}"`);
    if (typeof value === 'string') return [value];
    if (value !== undefined) problem(sink, `"${node.getName()}" takes words`, entry);
    return [];
  });
}

/** The one plain word a node holds. */
function word(sink: Sink, node: Node): string | undefined {
  const all = words(sink, node);
  if (all.length !== 1) problem(sink, `"${node.getName()}" takes one word`, node);
  return all.length === 1 ? all[0] : undefined;
}

/** The properties of a node, as an object of plain values. */
function propsOf(sink: Sink, node: Node, what: string): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const entry of entriesOf(node).props) {
    const value = plain(sink, entry, what);
    if (value !== undefined) out[entry.getName()!] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** A `line` node as a check: `gist`, `kin`, `writer` as properties, and a `payload` child whose `(value)key` is a reference. */
function readCheck(sink: Sink, node: Node): Check {
  const check: Check = {};
  for (const entry of entriesOf(node).args) problem(sink, '"line" takes properties, not arguments', entry);
  for (const [key, value] of Object.entries(propsOf(sink, node, '"line"'))) {
    if (key !== 'gist' && key !== 'kin' && key !== 'writer') problem(sink, `"line" takes gist, kin and writer, not "${key}"`, node);
    else if (typeof value !== 'string') problem(sink, `"line": ${key} is a word`, node);
    else if (key === 'writer') check.writer = value as Check['writer'];
    else check[key] = value;
  }
  for (const child of node.children?.nodes ?? []) {
    if (child.getName() !== 'payload' || check.payload !== undefined) {
      problem(sink, '"line" takes one "payload" in its body', child);
      continue;
    }
    const payload: Payload = {};
    for (const entry of child.getPropertyEntries()) {
      const tag = entry.getTag();
      const value = entry.getValue();
      if (tag === null) payload[entry.getName()!] = value;
      else if (tag === 'value' && typeof value === 'string') payload[entry.getName()!] = { $value: value };
      else problem(sink, 'a payload value is plain, or a reference to the value handle: (value)key', entry);
    }
    for (const entry of child.getArgumentEntries()) problem(sink, '"payload" takes properties, not arguments', entry);
    check.payload = payload;
  }
  return check;
}

/** Makes every `line` among the nodes, at any depth, `line <n>`, its check the nth of `checks`, so the module's reader reads the rest where it was written. */
function standIn(sink: Sink, nodes: Node[], checks: Check[]): void {
  nodes.forEach((node, i) => {
    if (node.getName() !== 'line') {
      if (node.children) standIn(sink, node.children.nodes, checks);
      return;
    }
    const stand = Node.create('line');
    stand.addArgument(checks.length);
    checks.push(readCheck(sink, node));
    nodes[i] = stand;
  });
}

/** The module's form with the stand-ins of `line` and the one argument of `at-least` put back as consequitur's words have them. */
function putBack(condition: ModuleCondition, checks: Check[]): ModuleCondition {
  if ('not' in condition) return { not: putBack(condition.not, checks) };
  if ('all' in condition) return { all: condition.all.map((c) => putBack(c, checks)) };
  if ('any' in condition) return { any: condition.any.map((c) => putBack(c, checks)) };
  if (!('word' in condition)) return condition;
  const [first] = Array.isArray(condition.args) ? condition.args : [];
  if (condition.word === 'line') return { word: 'line', args: (typeof first === 'number' ? checks[first] : {}) as unknown as Json };
  return { ...condition, args: first ?? null, body: condition.body?.map((c) => putBack(c, checks)) };
}

/** The condition a node's body holds: one node, or several, which are all of them. The node's entries are its caller's. */
function readCondition(sink: Sink, node: Node): Condition | undefined {
  const nodes = node.children?.nodes ?? [];
  if (nodes.length === 0) {
    problem(sink, `"${node.getName()}" holds a condition in its body`, node);
    return undefined;
  }
  const checks: Check[] = [];
  const before = sink.length;
  standIn(sink, nodes, checks);
  const read = readBody(nodes, { words: WORDS, isReference: (tag) => FROM.includes(tag) });
  sink.push(...read.problems);
  if (sink.length > before) return undefined;
  const [only] = read.conditions;
  const translated = fromModuleForm(putBack(read.conditions.length === 1 ? only : { all: read.conditions }, checks));
  if (typeof translated === 'string') {
    problem(sink, translated, node);
    return undefined;
  }
  return translated;
}

/** A `line` node of a check. Throws a `RangeError` for a payload value KDL cannot hold as a property. */
function checkNode(check: Check): Node {
  const node = Node.create('line');
  for (const key of ['gist', 'kin', 'writer'] as const) if (check[key] !== undefined) node.setProperty(key, check[key]);
  if (check.payload !== undefined) {
    const payload = Node.create('payload');
    for (const [key, value] of Object.entries(check.payload)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value.$value === 'string') payload.setProperty(key, value.$value, 'value');
      else if (isPlain(value)) payload.setProperty(key, value);
      else throw new RangeError(`the payload key "${key}" of a check holds a list or an object, which KDL cannot hold as a property`);
    }
    node.appendNode(payload);
  }
  return node;
}

/** The nodes of a condition, `line` nodes written here and the rest by the module. */
function conditionNode(name: string, condition: Condition): Node {
  const checks: Check[] = [];
  const standing = (c: ModuleCondition): ModuleCondition => {
    if ('not' in c) return { not: standing(c.not) };
    if ('all' in c) return { all: c.all.map(standing) };
    if ('any' in c) return { any: c.any.map(standing) };
    if (!('word' in c)) return c;
    if (c.word === 'line') {
      checks.push(c.args as unknown as Check);
      return { word: 'line', args: [checks.length - 1] };
    }
    return { ...c, args: [c.args ?? null], body: c.body?.map(standing) };
  };
  const written = parse(writeGuard(standing(toModuleForm(condition))), { as: 'node' });
  const real = (node: Node): Node => {
    if (node.getName() === 'line') return checkNode(checks[node.getArgument(0) as number]);
    const children = node.children?.nodes;
    if (children) node.children = new Document(children.map(real));
    return node;
  };
  const holder = Node.create(name);
  holder.appendNode(real(written));
  return holder;
}

// ---------------------------------------------------------------------------
// Bindings: rules and laws
// ---------------------------------------------------------------------------

/** A binding's keys from a node: its properties, and its children (a list as arguments, an object as properties). `condition` names the child that is a condition. */
function readBinding(sink: Sink, node: Node, head: string, condition?: string): Record<string, Json> {
  const binding: Record<string, Json> = { [head]: node.getName(), ...propsOf(sink, node, `"${node.getName()}"`) };
  for (const child of node.children?.nodes ?? []) {
    const key = child.getName();
    if (key in binding) problem(sink, `"${key}" is written twice on "${node.getName()}"`, child);
    else if (key === condition) {
      if (child.hasArguments() || child.hasProperties()) problem(sink, `"${key}" takes a condition in its body, and nothing else`, child);
      const read = readCondition(sink, child);
      if (read !== undefined) binding[key] = read as unknown as Json;
    } else if (child.hasProperties()) {
      if (child.hasArguments() || child.hasChildren()) problem(sink, `"${key}" holds an object as properties, or a list as arguments, not both`, child);
      binding[key] = propsOf(sink, child, `"${key}"`);
    } else {
      if (child.hasChildren()) problem(sink, `"${key}" takes no body`, child);
      binding[key] = child.getArgumentEntries().flatMap((entry) => {
        const value = plain(sink, entry, `"${key}"`);
        return value === undefined ? [] : [value];
      });
    }
  }
  return binding;
}

/** A binding as a node, its head key the node's name. Throws a `RangeError` for a value KDL cannot hold as written. */
function bindingNode(binding: Record<string, Json>, head: string, condition?: string): Node {
  const node = Node.create(String(binding[head]));
  for (const [key, value] of Object.entries(binding)) {
    if (key === head) continue;
    if (key === condition) node.appendNode(conditionNode(key, value as unknown as Condition));
    else if (isPlain(value)) node.setProperty(key, value);
    else {
      const child = Node.create(key);
      const fail = () => new RangeError(`"${key}" of "${binding[head]}" holds a value inside a value, which this form does not write`);
      if (Array.isArray(value)) for (const item of value) child.addArgument(isPlain(item) ? item : (() => { throw fail(); })());
      else for (const [k, v] of Object.entries(value)) child.setProperty(k, isPlain(v) ? v : (() => { throw fail(); })());
      node.appendNode(child);
    }
  }
  return node;
}

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

const TOP = ['name', 'version', 'opening', 'authority', 'sets', 'records', 'judged', 'guard', 'gist', 'law'];

/**
 * Reads a schema written in KDL into the schema object, which `readSchema` then reads against a kit. Never
 * throws: what is wrong with the text is in `problems`, each with its line and column, and the object holds
 * what could be read. Check `problems` before trusting it.
 */
export function fromKdl(text: string): { json: Record<string, Json>; problems: Problem[] } {
  const sink: Sink = [];
  let document: Document;
  try {
    document = parse(text, { storeLocations: true });
  } catch (error) {
    const message = error instanceof InvalidKdlError ? error.message : String(error);
    return { json: {}, problems: [{ message, line: 1, column: 1 }] };
  }
  const json: Record<string, Json> = {};
  const guards: Record<string, Json> = {};
  const gists: Json[] = [];
  const laws: Json[] = [];
  for (const node of document.nodes) {
    const name = node.getName();
    if (!TOP.includes(name)) {
      problem(sink, `a schema takes ${TOP.join(', ')}, not "${name}"`, node);
      continue;
    }
    if (['name', 'version', 'opening', 'authority', 'sets', 'records', 'judged'].includes(name) && name in json) {
      problem(sink, `"${name}" is written twice`, node);
      continue;
    }
    if (name === 'name' || name === 'opening' || name === 'authority') {
      const value = word(sink, node);
      if (value !== undefined) json[name] = value;
    } else if (name === 'version') {
      const [entry, ...more] = entriesOf(node).args;
      const value = entry === undefined ? undefined : plain(sink, entry, '"version"');
      if (typeof value !== 'number' || more.length > 0 || node.hasProperties() || node.hasChildren()) problem(sink, '"version" takes one number', node);
      else json.version = value;
    } else if (name === 'sets' || name === 'judged') json[name] = words(sink, node);
    else if (name === 'records') {
      if (node.hasArguments() || node.hasChildren()) problem(sink, '"records" takes properties only', node);
      json.records = propsOf(sink, node, '"records"');
    } else if (name === 'guard') {
      const [entry] = entriesOf(node).args;
      const guard = entry === undefined ? undefined : plain(sink, entry, '"guard"');
      if (typeof guard !== 'string' || node.getArgumentEntries().length !== 1 || node.hasProperties()) problem(sink, '"guard" takes its name, and its condition in its body', node);
      else if (guard in guards) problem(sink, `the guard "${guard}" is written twice`, node);
      else {
        const read = readCondition(sink, node);
        if (read !== undefined) guards[guard] = read as unknown as Json;
      }
    } else if (name === 'gist') {
      const [first, ...rest] = words(sink, node, true);
      for (const entry of entriesOf(node).props) problem(sink, '"gist" takes its name and its writers, and no properties', entry);
      if (first === undefined) problem(sink, '"gist" takes its name and its writers', node);
      const gist: Record<string, Json> = { gist: first ?? '', writers: rest, rules: [] };
      const rules: Json[] = [];
      for (const child of node.children?.nodes ?? []) {
        if (child.getName() !== 'when') rules.push(readBinding(sink, child, 'rule'));
        else if ('when' in gist) problem(sink, '"when" is written twice', child);
        else if (child.hasArguments() || child.hasProperties()) problem(sink, '"when" takes a condition in its body, and nothing else', child);
        else {
          const read = readCondition(sink, child);
          if (read !== undefined) gist.when = read as unknown as Json;
        }
      }
      gist.rules = rules;
      gists.push(gist);
    } else {
      const args = entriesOf(node).args;
      const kind = args.length === 1 ? plain(sink, args[0], '"law"') : undefined;
      if (typeof kind !== 'string') problem(sink, '"law" takes the name of its kind, then its keys', node);
      laws.push({ ...readBinding(sink, node, 'law', 'while'), law: typeof kind === 'string' ? kind : '' });
    }
  }
  if (Object.keys(guards).length > 0) json.guards = guards;
  json.gists = gists;
  if (laws.length > 0) json.laws = laws;
  return { json, problems: sink };
}

/**
 * Writes a schema object as KDL, in the order the reader reads it: the head, the guards, the gists, the laws;
 * only the parts the object has, so a part of a schema writes alone. Throws a `RangeError` for a value this form
 * cannot hold: a value inside a value of a binding, or a list or an object in a check's payload.
 */
export function toKdl(json: Record<string, Json>): string {
  const document = new Document();
  const put = (node: Node) => document.appendNode(node);
  for (const key of ['name', 'version', 'opening', 'authority'] as const) {
    const value = json[key];
    // a version is a number, the others are words
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if ((key === 'version') !== (typeof value === 'number')) continue;
    const node = Node.create(key);
    node.addArgument(value);
    put(node);
  }
  for (const key of ['sets', 'records', 'judged'] as const) {
    const value = json[key];
    if (value === undefined) continue;
    const node = Node.create(key);
    if (Array.isArray(value)) for (const item of value) node.addArgument(isPlain(item) ? item : String(item));
    else if (typeof value === 'object' && value !== null) for (const [k, v] of Object.entries(value)) node.setProperty(k, isPlain(v) ? v : String(v));
    put(node);
  }
  if (typeof json.guards === 'object' && json.guards !== null && !Array.isArray(json.guards)) {
    for (const [name, body] of Object.entries(json.guards)) {
      const node = conditionNode('guard', body as unknown as Condition);
      node.addArgument(name);
      put(node);
    }
  }
  for (const gist of Array.isArray(json.gists) ? json.gists : []) {
    const entry = gist as Record<string, Json>;
    const node = Node.create('gist');
    node.addArgument(String(entry.gist));
    for (const writer of Array.isArray(entry.writers) ? entry.writers : []) node.addArgument(String(writer));
    for (const rule of Array.isArray(entry.rules) ? entry.rules : []) node.appendNode(bindingNode(rule as Record<string, Json>, 'rule'));
    if (entry.when !== undefined) node.appendNode(conditionNode('when', entry.when as unknown as Condition));
    put(node);
  }
  for (const law of Array.isArray(json.laws) ? json.laws : []) {
    const binding = law as Record<string, Json>;
    const { law: kind, ...rest } = binding;
    const node = bindingNode({ law: 'law', ...rest }, 'law', 'while');
    node.addArgument(String(kind), undefined, 0);
    put(node);
  }
  return `${format(clearFormat(document)).replace(/\t/g, '    ').trimEnd()}\n`;
}
