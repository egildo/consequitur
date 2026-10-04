// What the tests share: SIBAR's case, read from `cases/`, and a thread written line by line.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_KIT, emptyState, post, readSchema, type LineDraft, type PostResult, type Schema, type ThreadState, type Writer } from 'consequitur';

const root = join(import.meta.dirname, '..', '..', '..');

const { schema, problems } = readSchema(JSON.parse(readFileSync(join(root, 'cases', 'sibar-activity', 'schema.json'), 'utf8')), BASE_KIT);
if (problems.length > 0) throw new Error(`The case has problems: ${problems.join(' ')}`);

/** The case, with its laws. */
export const SIBAR: Schema = schema;

export const NOW = '2026-10-03T10:00:00.000Z';

const by = (writer: Writer) => (gist: string, payload: LineDraft['payload']): LineDraft => ({ gist, writer, payload });
export const mrossi = by('user::mrossi');
export const lbianchi = by('user::lbianchi');
export const system = by(schema.authority);

/** Posts each draft to the state the one before left; a refusal fails the test that built the thread. */
export async function written(drafts: LineDraft[], confirmed = false): Promise<PostResult> {
  let state: ThreadState = emptyState(SIBAR);
  let last!: PostResult;
  for (const draft of drafts) {
    last = await post(state, draft, SIBAR, NOW, { confirmed });
    if (last.refusal) throw new Error(`Refused ${draft.gist}: ${last.refusal.detail}`);
    state = last.state;
  }
  return last;
}

export const opening = mrossi('create', { name: 'Richiesta parere', assignTo: ['mrossi'] });
