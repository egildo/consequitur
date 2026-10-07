# The chain is the order

Status: settled 2026-10-06, built in the round «Chain order» ([plan](../plan.md) §4). One of the three decisions that change ids for ever, so it binds before publishing 0.1.0.

## Context

Every line carries `previous`, the id of the line before it, and that id is inside the line's hash. So a thread is already a hash chain, the shape of git's commits. Yet nothing reads the chain. The reading order is the timestamps': by timestamp, ties by id.

Today the two orders never disagree, and only because `stamp` makes them agree. It sets `previous` to the last line in reading order, and when the clock gives an instant not after that line's, it writes the last timestamp plus one millisecond instead. The stored time is bent so that the order stays right.

That leaves a thread with two orders, one stated and one sorted, and the sorted one wins. Where they could part, it is the sorted one that is wrong:

- **A clock that goes back.** The authority's clock is corrected by a minute. The next line is stored a minute later than it was written, and every line after it too until the clock catches up. The order holds; the times lie.
- **A line lost.** A line is deleted from the store by hand, or a copy drops it. Sorted by time, the thread reads without complaint, and a goal that line met no longer fires. The reading is different and says nothing.
- **A line slipped in.** A line stamped validly elsewhere, from another thread or an old backup of this one, is pasted into the store. `verify` passes, since its own hash is right. Sorted by time, it takes a place in the middle, and since a revoke reaches only an earlier line, where it lands changes what it can take out and what can take it out.

In each case the thread is damaged and the timestamp order reads it as whole. The chain would not: the line after the lost one names an id that is not there, and the slipped-in line names a `previous` another line already names, or one that is not in the thread.

The canon, from memory and not re-read for this decision: git orders commits by their parent links and treats the dates as what the author says, which can be wrong without harm. Event stores order by a sequence number and keep the clock as data. Lamport's paper on clocks argues that physical time is not the order of events in a system, only a hint of it. Certificate Transparency logs are append-only chains whose damage is detectable for the same reason.

## Decision

**The reading order is the chain.** The first line is the one whose `previous` is null. Each next line is the one whose `previous` is the id of the line before. The array's own order is still never read.

**A thread that is not one chain is broken, and the reading refuses it.** Broken means any of: no first line, or more than one; two lines naming the same `previous` (a fork); a line whose `previous` is not in the thread (a gap); a line the walk from the first never reaches. The refusal names the place: the last line read before the break. The form of that refusal comes with structured errors, which are parked; until then it is a sentence, as the reader's other refusals are.

**The timestamp is a statement, not the order.** It is the authority's clock when it stamped the line, as the clock gave it. It may repeat. It may go back. `stamp` no longer bends it. It stays in the hash, because it is part of what the line says: an edited time is still an edited line.

## Nuance

**Nothing stored changes.** Every thread written so far was stamped with `previous` set to the last line in reading order, so its chain and its timestamp order are the same. It reads the same under the new rule, and no id moves. Only lines yet to be written, where the clock would have been bent, get a different timestamp and so a different id than they would have today.

**The tail is not protected.** Cutting the last lines off a thread leaves a valid chain, shorter. The chain proves that what is there hangs together, not that it is all there. Git has the same limit: resetting a branch is invisible in the commits. The defence is outside the thread, in whoever keeps its last id, as a git ref does or a transparency log's signed head. That belongs to the authority's storage, which is outside the library; the library can give the last id in reading order, and the application decides where to keep it.

**A whole other thread is not detected either.** A valid thread swapped for another valid thread reads cleanly. Whether a thread carries its own identity is one of the parked decisions on what the hash covers.

**Times can still be read, as values.** Nothing in the engine reads a timestamp today but the order, so nothing else changes. A law that compares times, such as a deadline, should read a time some line states, not the envelope's, or it reads the authority's clock as if it were the domain's.

**Two times, and no loose mode.** Added 2026-10-08. The pattern adopted is **bitemporal data**, from temporal databases (Snodgrass; SQL:2011 names the two periods *system time* and *application time*). A fact has a **transaction time**, when it was recorded, and a **valid time**, when it held in the world. The chain and the envelope's timestamp are the transaction time. A valid time is something a line states in its payload. A bank statement is the everyday form: its entries keep the order they were booked in, and each carries a **booking date** and a **value date** (*data contabile*, *data valuta*); a back-dated entry is booked today with an earlier value date, and interest reads the value date. So the reading never reorders by date, not even as an option: what follows from what depends on the order things were known in, and a reading by date would reopen the three damages above. Showing a thread sorted by a stated date is a view, the application's or the render package's. Where a line states its valid time, under which key, is parked as «value dates».

**One authority per thread.** A fork is refused because only a broken store can make one: one authority stamps every line, in turn. If two authorities ever extend a thread apart and meet again, the answer is not the wall clock either. It is a merge that names both ends, as git's merge commit does, or a logical clock. That is a later decision, if it is ever needed.

**The cost.** Sorting by time is n log n; walking the chain is a map from `previous` to line and one pass, so linear. The refusals cost a count of what the walk reached.

## Consequences

`inOrder` walks the chain and refuses a broken one, and `stamp` writes the instant it is given without bending it. The glossary's reading order becomes «by the chain: from the line with no `previous`, each next line the one that names the last». The tests that pin the bent millisecond and the ties by id become tests of the walk and of each way a thread breaks. The principle that a line never changes is unchanged; this decision makes it checkable across lines, not only within one.
