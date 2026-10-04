# Glossary

One entry per name. Status: settled — the names come from `sibardoc-prototype`, where Egildo gave most of them;
those marked *(new)* were proposed by the plan and accepted.

| Name | What it is |
|---|---|
| **thread** | The append-only list of lines of one record. Read in **reading order**: by timestamp, ties by id. |
| **line** | One entry: `id`, `previous`, `gist`, `writer`, `timestamp`, `payload`. The payload is free JSON. |
| **id** | The SHA-256 of the line's content and its `previous` id, computed once when the line is written and stored. |
| **gist** | What a line says happened: `memo`, `doc_signed`, `bank_tr_complete`. Lower snake case, at most 32 characters. |
| **writer** | Who wrote a line, as `KIN::ID`: `user::mrossi`, `system::bridge`, `goal::<line id>`. |
| **kin** | The part of a writer before `::`. A gist's schema says which kins may write it. |
| **schema** | A domain, as data: a head, its gist schemas, its laws. Read once by `readSchema` against a kit. |
| **head** *(new)* | The part of a schema that names its own words: the `opening` gist, the `authority`, the `sets`, the `records`, the kins `judged`. |
| **authority** *(new)* | The writer of the lines that record a reconciliation, named by the head. In SIBAR, `system::sibardoc`. |
| **gist schema** | One gist's configuration: its writers, its `when`, its rule bindings. |
| **opening gist** *(new)* | The gist a thread starts with; exactly one is in force. In SIBAR, `create`. |
| **rule** | A registered kind of consequence, bound to a gist by a **binding** that names the payload keys it reads. A rule states expectations; it never compares. |
| **mechanic** *(new)* | What belongs to the thread itself and is not a kind: the envelope and its hash, reading order, **revoke**, **goal**, the opening rule, `when`, the loop and cap of reconciliation, the place of laws in a post. The engine reads them; a kit cannot replace them. |
| **rule kind** *(new)* | The code behind a rule: how its binding is read, why a payload cannot carry it, what it expects, and into which handle kinds. |
| **revoke** | The rule that takes a line out of force. Always specific: a revoking gist lists the gists it may revoke. |
| **in force** | Not revoked by a line that is itself in force. |
| **handles** | The values on the record that the thread explains, outside the thread so they can be listed and searched. |
| **handle kind** | The code behind a sort of handle: its empty form, how expectations of it are compared with it, how a denunciation of it is answered, how two of its handles differ, and the roles of the records it writes. Two ship with the library: |
| **value handle** | A handle that holds one JSON value under a key. In SIBAR, a metadata key. |
| **set handle** | A handle that holds a set of names. In SIBAR, the assignees. |
| **kit** | The handle, rule and law kinds a schema may use. `BASE_KIT` ships with the library; a schema is read against one, and refuses a kind it lacks. |
| **join**, **leave** | The rules that put names into a set handle, and take the writer out of one. In SIBAR, assign and release. |
| **expectation** | What the thread says a handle should be, or that a line should exist. |
| **reading** | The result of reducing a thread against its handles: lines in force, expectations, goals, denunciations. |
| **denunciation** | One difference between an expectation and the handles (`sort: 'handle'`), a line a goal owes (`'line'`), or a breach of the opening rule (`'thread'`). |
| **change** *(new)* | One difference between two handles, as its handle kind says it, for a host to apply to its own copy. `diff` lists them. |
| **reconciliation** | The answer to a denunciation: the handles change and a line records it. Settling repeats it, at most three rounds. |
| **record** *(new)* | A line the authority writes to say a reconciliation changed a handle. Each has a **role** (`value`, `join`, `leave`, or one of a kit's own), and the head's `records` names the gist of each role, and of the goal's `warning`. |
| **goal** | A line that names checks and an outcome. When every check finds a line, the goal writes its outcome, once. |
| **check** | An equality on a line's gist, kin, writer and payload keys. |
| **outcome** | The line a goal writes, with the payload the goal carries. |
| **final** | A goal whose outcome can never be revoked. |
| **warning** | The line a goal writes, once per check, when the thread lost what the check names. |
| **when** | When a gist may be written: `checks`, being `in` a set, `values` of the value handle. What the menu is built from. |
| **offer** | A gist a writer may write now, with the lines it may name if it revokes. |
| **law** | A registered judgement on what a line would cause, with a strength: refuse, or confirm. The schema binds it, and its head says whose lines are `judged`. |
| **verdict** | One law found broken by a dry run. |
| **dry run** | A post whose result is kept and not applied: the lines it would add, the rounds, the verdicts. |
| **policy** *(new)* | Which denunciations an authority leaves unanswered, each entry with an optional condition on the value handle. Conf, outside the thread. A reading that only the policy keeps from settling counts as settled. |
| **render** | `consequitur-render`: helpers that turn a reading into DOM — nodes kept by line id, the dry-run preview loop. |
| **playground** | The sample application: a domain's thread written by hand, its reading inspected, its schema shown as code. |
