# consequitur-kdl

This page covers every export of `consequitur-kdl`, `fromKdl` and `toKdl`, and the KDL form of a [schema](glossary.md). JSON is the model: a goal is a line and payloads are JSON. KDL is how a person writes a schema. `fromKdl` reads the text into the schema object, which [`readSchema`](schema.md#readschema) then reads as it reads a schema written in JSON; `toKdl` writes the object back.

Its dependencies are `consequitur`, for the two forms of a condition; `kdlet-guards`, whose `kdlet-guards/kdl` entry reads and writes a condition's nodes; and `@bgotink/kdl`, which parses and formats KDL.

## `fromKdl`

```ts
interface Problem {
  message: string;
  line: number;
  column: number;
}

function fromKdl(text: string): { json: Record<string, Json>; problems: Problem[] };
```

Reads a schema written in KDL into the schema object. It never throws. What is wrong with the text is in `problems`, each with its line and column, one-based; text that is not KDL gives one problem, at line 1, column 1, and an empty object. `json` holds what could be read, so `problems` is checked before it is trusted. `fromKdl` checks the text's shape; what the schema means is `readSchema`'s to check.

`gists` is always in `json`; `guards` and `laws` only when the text has one.

```ts
const { json, problems } = fromKdl(text);
if (problems.length > 0) throw new Error(problems.map((p) => `${p.line}:${p.column} ${p.message}`).join('\n'));
const { schema, problems: more } = readSchema(json, BASE_KIT);
```

## `toKdl`

```ts
function toKdl(json: Record<string, Json>): string;
```

Writes a schema object as KDL, in the order the reader reads it: the head, the guards, the gists, the laws. It writes only the parts the object has, so a part of a schema, such as one guard, writes alone. Indentation is four spaces, and the text ends with a newline. What `toKdl` writes reads back with `fromKdl` to the same object, but for an empty `guards` or `laws`, which it leaves out, and a condition KDL cannot say (see [conditions](#conditions)).

It throws a `RangeError` for a value this form cannot hold: a value inside a value of a binding (a list of lists, an object in an object), and a list or an object in a check's payload.

## The form

```kdl
name sibar-activity
version 1
opening create
authority system::sibardoc
sets assignees
records join=assigned leave=unassigned value=metadata_set warning=goal_warning
judged user
guard assignee {
    is (writer)id (set)assignees
}
gist create user {
    value from=name key=name required=#true
    value key=status value=open
    join from=assignTo required=#true set=assignees
}
gist quit user {
    leave set=assignees
    when {
        guard assignee
    }
}
gist metadata_set system
gist assigned system
gist unassigned system
gist goal_warning goal
law keeps-set set=assignees strength=refuse {
    while {
        is (value)status open
    }
}
law settles strength=refuse
```

A schema's text is a list of top-level nodes, each one of `name`, `version`, `opening`, `authority`, `sets`, `records`, `judged`, `guard`, `gist` and `law`. Any other node is a problem.

| Node | Form | JSON |
|---|---|---|
| `name` | `name <word>` | `name` |
| `version` | `version <number>` | `version` |
| `opening` | `opening <word>` | `opening` |
| `authority` | `authority <word>` | `authority` |
| `sets` | `sets <word>…` | `sets` |
| `records` | `records <role>=<gist>…` | `records` |
| `judged` | `judged <kin>…` | `judged` |
| `guard` | `guard <name> { <condition> }` | one entry of `guards` |
| `gist` | `gist <name> <kin>… { <binding>… when { <condition> } }` | one entry of `gists` |
| `law` | `law <kind> <key>=<value>… { while { <condition> } }` | one entry of `laws` |

`name`, `version`, `opening`, `authority`, `sets`, `records` and `judged` are written once each; a second is a problem, and so is a guard name written twice. `version` holds one number and nothing else; `records` holds properties only.

**A gist** is its name, then the kins of its writers, as arguments, and no properties. Its children are its rule bindings, in order, and at most one `when`, which holds a condition in its body and nothing else.

**A binding** is a node named for its rule, or `law <kind>` for a law. Its keys of plain value are its properties. A key whose value is a list is a child node with the items as arguments; one whose value is an object of plain values is a child node with them as properties. A key written as a child node when the node already holds it, as a property or as an earlier child, is a problem: «"key" is written twice on "value"».

**A property written twice on one node is a problem,** at the second one, in a binding, a `where`, a `records` node, a `law` and a `payload`: `value key=k key=j from=x` gives «"key" is written twice on "value"», as a key written twice as a child node does. The first stands in the object the reader returns.

```kdl
gist memo_revoke user {
    revoke from=target {
        gists memo
    }
}
gist inbound system {
    value key=received from=date {
        where direction=inbound
    }
}
```

A law's `while` is a child node that holds a condition in its body, as a `when` does.

## Conditions

A condition is written as `kdlet-guards`' files write a guard's body. The nodes, their KDL and their JSON are on the [conditions](conditions.md#nodes) page; references are tagged values, `(value)`, `(set)`, `(writer)`, `(draft)` and `(now)`. A body that holds several conditions holds all of them.

Two words are read and written here, not by `kdlet-guards`:

- `line`, whose `gist`, `kin` and `writer` are properties, and whose payload is one child node `payload` of properties; a payload value is plain, or a `$value` reference, `(value)key`.
- `at-least <n> { <condition>… }`, with n as its one argument.

```kdl
gist publish user {
    when {
        at-least 2 {
            line gist=approve writer=user::bgalli
            line gist=approve {
                payload version=(value)version
            }
            line kin=system
        }
    }
}
```

The reader refuses what `kdlet-guards`' KDL reader refuses, with its line and column: a reference of another tag, a word consequitur does not register, a left operand of `is` or of a comparison that is not a reference, `(now)` that reads another field than `instant`. So a condition whose `is` compares a plain value on the left can be written in JSON and not in KDL.
