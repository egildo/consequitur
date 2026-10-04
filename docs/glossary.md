# Glossary

One entry per name. Status: proposed — the names come from `sibardoc-prototype`, where Egildo
gave most of them; the ones marked *(new)* are proposals of this plan and are open in
[plan.md](plan.md).

| Name | What it is |
|---|---|
| **thread** | The append-only list of lines of one record. Read in **reading order**: by timestamp, ties by id. |
| **line** | One entry: `id`, `previous`, `gist`, `writer`, `timestamp`, `payload`. The payload is free JSON. |
| **id** | The SHA-256 of the line's content and its `previous` id, computed once when the line is written and stored. |
| **gist** | What a line says happened: `memo`, `doc_signed`, `bank_tr_complete`. Lower snake case, at most 32 characters. |
| **writer** | Who wrote a line, as `KIN::ID`: `user::mrossi`, `system::bridge`, `goal::<line id>`. |
| **kin** | The part of a writer before `::`. A gist's schema says which kins may write it. |
| **schema** | A domain, as data: its gist schemas, the name of its opening gist, its laws. |
| **gist schema** | One gist's configuration: its writers, its `when`, its rule bindings. |
| **opening gist** *(new)* | The gist a thread starts with; exactly one is in force. In SIBAR, `create`. |
| **rule** | A registered kind of consequence, bound to a gist by a **binding** that names the payload keys it reads. A rule states expectations; it never compares. |
| **rule kind** *(new)* | The code behind a rule: how its binding is validated, what it expects, how a denunciation of it is answered. |
| **revoke** | The rule that takes a line out of force. Always specific: a revoking gist lists the gists it may revoke. |
| **in force** | Not revoked by a line that is itself in force. |
| **handles** | The values on the record that the thread explains, outside the thread so they can be listed and searched. |
| **value handle** *(new)* | A handle that holds one JSON value under a key. In SIBAR, a metadata key. |
| **set handle** *(new)* | A handle that holds a set of names. In SIBAR, the assignees. |
| **expectation** | What the thread says a handle should be, or that a line should exist. |
| **reading** | The result of reducing a thread against its handles: lines in force, expectations, goals, denunciations. |
| **denunciation** | One difference between an expectation and the handles. |
| **reconciliation** | The answer to a denunciation: the handles change and a line records it. Settling repeats it, at most three rounds. |
| **goal** | A line that names checks and an outcome. When every check finds a line, the goal writes its outcome, once. |
| **check** | An equality on a line's gist, kin, writer and payload keys. |
| **outcome** | The line a goal writes, with the payload the goal carries. |
| **final** | A goal whose outcome can never be revoked. |
| **warning** | The line a goal writes, once per check, when the thread lost what the check names. |
| **when** | When a gist may be written: checks, being in a set handle, values. What the menu is built from. |
| **offer** | A gist a writer may write now, with the lines it may name if it revokes. |
| **law** | A registered judgement on what a line would cause, with a strength: refuse, or confirm. |
| **verdict** | One law found broken by a dry run. |
| **dry run** | A post whose result is kept and not applied: the lines it would add, the rounds, the verdicts. |
| **policy** *(new)* | Which denunciations an authority leaves unanswered. Conf, outside the thread. |
| **playground** | The development page: a domain's schema edited live, a thread written by hand, its reading inspected. |
