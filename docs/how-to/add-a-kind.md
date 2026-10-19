# How to add a kind to a kit

This guide gets you a [rule kind](../reference/glossary.md) of your own, registered in a [kit](../reference/glossary.md) and used by a schema. It then says where a handle kind and a law kind differ.

The example is `stamped`: a rule that states, under a key, the timestamp of the latest line of the gist.

## Before you begin

You need `consequitur` and a schema that reads without a problem: see [How to write a schema](write-a-schema.md). The shipped rule kinds are a model; [`collect-writer`](../../packages/consequitur/src/rules/collect-writer.ts) is the shortest.

## Steps

1. **Write the kind.** A rule kind is a plain object of four members. `read` and `admit` return a sentence when something is wrong, `expect` states what a line expects.

   ```ts
   import { keysAre, type RuleKind, type ValueAcc } from 'consequitur';

   export const stampedRule: RuleKind = {
     rule: 'stamped',
     // the handle kinds it states into: a kit without `value` cannot hold it
     handles: ['value'],
     // the binding as typed, or a problem; keysAre refuses a key the kind does not know
     read: (binding) =>
       keysAre(binding, ['key']) && typeof binding.key === 'string'
         ? { rule: 'stamped', key: binding.key }
         : 'a stamped binding has exactly a key.',
     // why a payload cannot carry the binding; this rule reads the envelope, so any payload does
     admit: () => undefined,
     // what the line expects of the handles: the value handle holds the line's timestamp under the key
     expect(binding, line, acc) {
       const stated = acc('value') as ValueAcc | undefined;
       stated?.set(binding.key as string, { value: line.timestamp, line: line.id, collected: false });
     },
   };
   ```

   The rule states and never compares: the handle kind compares what the thread expects with the handle. The lines reach `expect` in reading order, so the latest line of the gist wins. The members are on the [schema](../reference/schema.md#rule-kinds) page.

2. **Put it in a kit.** A kit is three lists. Add to the base kit's list and leave the rest:

   ```ts
   import { BASE_KIT, type Kit } from 'consequitur';

   export const kit: Kit = { ...BASE_KIT, rules: [...BASE_KIT.rules, stampedRule] };
   ```

3. **Bind it in a schema.** Add the binding to a gist of the JSON schema:

   ```json
   { "gist": "approve", "writers": ["user"], "rules": [{ "rule": "stamped", "key": "approvedAt" }] }
   ```

   In KDL it is `stamped key=approvedAt`.

4. **Read the schema against the new kit.** The base kit refuses the binding; yours reads it.

   ```ts
   import { readSchema } from 'consequitur';

   console.log(readSchema(json, BASE_KIT).problems);
   // ['binding 0 of gist "approve": it names the rule "stamped", which the kit does not have.']
   const { schema, problems } = readSchema(json, kit);
   // problems is []
   ```

5. **Post a line and read the handle.** Post a `create` and an `approve`, as in [How to be the authority](be-the-authority.md):

   ```ts
   console.log(state.handles.value);
   // { name: 'Review', status: 'open', approvedAt: '2026-10-19T09:00:00.000Z' }
   ```

   The schema keeps the kit it was read against, so reading, admission and the laws use `stampedRule` with no further step.

## Variations

- **A rule that refuses a payload.** Return a sentence from `admit(binding, payload, written, schema)`. It becomes an `invalid-payload` refusal with the gist added. `payload` has each reference that resolves replaced; a reference that does not resolve counts as present.
- **A handle kind.** Add it to `handles` of the kit. It owns one sort of handle, so it gives `empty`, `start`, `expected`, `compare`, `answer` and `diff`, and names its `roles`. The schema must then name a record gist for each role in `records`, or `readSchema` refuses it. The order of `handles` is the order of the [denunciations](../reference/reading.md#denunciations). A rule that states into it lists its name in `handles`, and reaches its accumulator with `acc('<kind>')`. The test `counterHandle` in [`kinds.test.ts`](../../packages/consequitur/test/kinds.test.ts) is a small model, with a rule and a law that go with it.
- **A law kind.** Add it to `laws`. It gives `read` and `judge`; `judge` returns one entry, with a `detail` in English, for each breach. A schema binds it in `laws` with its `strength`:

  ```json
  { "law": "cap", "counter": "votes", "limit": 2, "strength": "refuse" }
  ```

  `read` receives the binding with `strength` among its keys: pass `strength` to `keysAre` as a required key, and return it in the binding.
- **A smaller kit.** Leave kinds out: `{ handles: [valueHandle], rules: [valueRule], laws: [] }`. The kinds are exported alone.

## See also

- [The schema and the kit](../reference/schema.md#the-kit): the interfaces of the three kinds, the base kinds and their accumulators.
- [Posting](../reference/posting.md#laws-and-verdicts): how a verdict is made from a law's entry.
- [How it works: mechanics and kinds](../explanation/how-it-works.md#the-boundary-mechanics-and-kinds): why these are kinds and the rest are not.
