// The kinds the library ships. A schema names kinds; `readSchema` refuses one its
// kit lacks. A consumer builds its own kit by adding to these lists.

import { setHandle } from './handles/set.ts';
import { valueHandle } from './handles/value.ts';
import { keepsGoals } from './laws/keeps-goals.ts';
import { keepsSet } from './laws/keeps-set.ts';
import { settles } from './laws/settles.ts';
import { collectWriterRule } from './rules/collect-writer.ts';
import { joinRule } from './rules/join.ts';
import { leaveRule } from './rules/leave.ts';
import { valueRule } from './rules/value.ts';
import type { Kit } from './types.ts';

/** Handles `value` and `set`; rules `value`, `collect-writer`, `join`, `leave`; laws `keeps-set`, `keeps-goals`, `settles`. The order of the handles is the order of denunciations. */
export const BASE_KIT: Kit = {
  handles: [valueHandle, setHandle],
  rules: [valueRule, collectWriterRule, joinRule, leaveRule],
  laws: [keepsSet, keepsGoals, settles],
};
