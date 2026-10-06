// `settles`: broken when the thread, after the line and the reconciliations it
// causes, would still hold a denunciation: the bound of rounds was reached.

import type { LawBinding, LawKind } from '../types.ts';
import { keysAre } from '../util.ts';

export const settles: LawKind = {
  law: 'settles',
  read: (binding) => (keysAre(binding, ['strength']) ? (binding as LawBinding) : 'does not have exactly the keys of a settles law.'),
  judge: (_binding, _before, after) => (after.reading.settled ? [] : [{ detail: 'The thread would not settle.' }]),
};
