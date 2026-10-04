// What a writer may post to a thread as it stands. The menu a screen draws from
// these offers and the admission of a line are one answer: `whenHolds` decides
// both, and the zero-gist rule is read here the way `post` enforces it.

import { CREATE_GIST, inForce, lockedBy } from './line.ts';
import { kinOf, whenHolds } from './reduce.ts';
import type { EventLine, GistSchema, Offer, Writer } from './types.ts';

/**
 * One offer per gist, in the order of `gists`, for each gist this writer may post
 * now. A gist that revokes is offered only while a line it may revoke is in force,
 * and carries those lines as `targets`, leaving out what a final goal wrote. A line of the gist must also leave the
 * zero-gist rule standing: a `create` only when none is in force, any other gist
 * only when exactly one is, since `post` refuses the rest.
 */
export function offers(lines: EventLine[], writer: Writer, gists: GistSchema[]): Offer[] {
  const kin = kinOf(writer);
  const standing = inForce(lines, gists).inForce;
  const creates = standing.filter((l) => l.gist === CREATE_GIST).length;
  const seen = new Set<string>();
  const out: Offer[] = [];

  for (const schema of gists) {
    // the first schema of a gist is the one read
    if (seen.has(schema.gist)) continue;
    seen.add(schema.gist);
    if (kin === undefined || !schema.writers.includes(kin)) continue;
    if (!whenHolds(lines, writer, schema, gists)) continue;
    if (schema.gist === CREATE_GIST ? creates !== 0 : creates !== 1) continue;

    // only the first revoke binding of a gist is read
    const revoking = schema.rules.find((r) => r.rule === 'revoke');
    if (revoking?.rule !== 'revoke') {
      out.push({ gist: schema.gist });
      continue;
    }
    const targets = standing.filter((l) => revoking.gists.includes(l.gist) && lockedBy(l, lines) === undefined).map((l) => l.id);
    if (targets.length > 0) out.push({ gist: schema.gist, targets });
  }
  return out;
}
