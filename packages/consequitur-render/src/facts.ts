// What a card shows beyond its own line: the facts the reading holds about each line of a
// thread. Pure and without DOM: the same lines, reading and schema give the same answer.
// A domain's own facts (the signatures on a document) are the application's.

import { idOf, inOrder, kinOf, type EventLine, type GoalReading, type LineId, type Payload, type Reading, type Schema } from 'consequitur';

export interface LineFacts {
  line: EventLine;
  inForce: boolean;
  /** The line in force that revokes this one. */
  revokedBy?: EventLine;
  /** This line is a goal: its reading. */
  goal?: GoalReading;
  /** This line was written by a goal: that goal's line id. */
  writtenBy?: LineId;
  /** A goal line: its warning lines, by check index. */
  warnings?: Record<number, EventLine>;
  /** A goal line: whether its outcome is locked against revoking. */
  locked?: boolean;
}

/** The facts of every line, in reading order. */
export function lineFacts(lines: EventLine[], reading: Reading, schema: Schema): LineFacts[] {
  const ordered = inOrder(lines);
  const position = new Map(ordered.map((l, i) => [l.id, i] as const));
  const standing = new Set(reading.inForce);
  const revoked = new Set(reading.revoked);
  const goals = new Map(reading.goals.map((g) => [g.line, g] as const));

  // a revoking line in force names an earlier line of a gist it may revoke; when several do, the last in reading order
  const revokers = new Map<LineId, EventLine>();
  for (const line of ordered) {
    if (!standing.has(line.id)) continue;
    const binding = schema.gists.find((g) => g.gist === line.gist)?.rules.find((r) => r.rule === 'revoke');
    if (binding === undefined || typeof binding.from !== 'string' || !Array.isArray(binding.gists)) continue;
    const target = payloadOf(line)[binding.from];
    if (typeof target !== 'string' || !revoked.has(target)) continue;
    const at = position.get(target);
    if (at !== undefined && at < position.get(line.id)! && binding.gists.includes(ordered[at].gist)) revokers.set(target, line);
  }

  // the warnings a goal wrote, by goal and check
  const warned = new Map<LineId, Record<number, EventLine>>();
  for (const line of ordered) {
    const goal = writerGoal(line);
    const { check } = payloadOf(line);
    if (goal === undefined || line.gist !== schema.records.warning || typeof check !== 'number') continue;
    warned.set(goal, { ...warned.get(goal), [check]: line });
  }

  return ordered.map((line): LineFacts => {
    const facts: LineFacts = { line, inForce: standing.has(line.id) };
    const revokedBy = revokers.get(line.id);
    if (revokedBy) facts.revokedBy = revokedBy;
    const writtenBy = writerGoal(line);
    if (writtenBy !== undefined) facts.writtenBy = writtenBy;
    const goal = goals.get(line.id);
    if (goal) {
      facts.goal = goal;
      facts.warnings = warned.get(line.id) ?? {};
      facts.locked = goal.final;
    }
    return facts;
  });
}

/** A line's payload, or an empty one when what was stored is not an object: such a line states nothing. */
function payloadOf(line: EventLine): Payload {
  const { payload } = line;
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? payload : {};
}

/** The id of the goal that wrote a line: its writer is `goal::<id of the goal's line>`; a stored writer that is not a string names none. */
function writerGoal(line: EventLine): LineId | undefined {
  return kinOf(line.writer) === 'goal' ? idOf(line.writer) : undefined;
}
