// What a writer may post to a thread as it stands. The menu a screen draws from
// these offers and the admission of a line are one answer: `holds` decides both,
// and the opening rule is read here the way `post` enforces it.

import { kinOf } from './check.ts';
import { lockedBy, revokeOf } from './line.ts';
import { expectations, holds } from './reduce.ts';
import type { EventLine, Offer, Schema, Writer } from './types.ts';

/**
 * One offer per gist, in the order of the schema, for each gist this writer may
 * post now. What the thread expects is computed once for the whole call. A gist
 * that revokes is offered only while a line it may revoke is in force, and carries
 * those lines as `targets`, leaving out what a final goal wrote. A line of the gist
 * must also leave the opening rule standing: the opening gist only when none is in
 * force, any other gist only when exactly one is, since `post` refuses the rest.
 */
export function offers(lines: EventLine[], writer: Writer, schema: Schema): Offer[] {
  const kin = kinOf(writer);
  const expected = expectations(lines, schema);
  const standing = expected.standing.inForce;
  const openings = standing.filter((l) => l.gist === schema.opening).length;
  const seen = new Set<string>();
  const out: Offer[] = [];

  for (const gist of schema.gists) {
    // the first schema of a gist is the one read
    if (seen.has(gist.gist)) continue;
    seen.add(gist.gist);
    if (kin === undefined || !gist.writers.includes(kin)) continue;
    if (gist.when && !holds(expected, writer, gist.when)) continue;
    if (gist.gist === schema.opening ? openings !== 0 : openings !== 1) continue;

    const revoking = revokeOf(gist);
    if (!revoking) {
      out.push({ gist: gist.gist });
      continue;
    }
    const targets = standing.filter((l) => revoking.gists.includes(l.gist) && lockedBy(l, lines) === undefined).map((l) => l.id);
    if (targets.length > 0) out.push({ gist: gist.gist, targets });
  }
  return out;
}
