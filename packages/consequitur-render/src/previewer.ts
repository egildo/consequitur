// The dry run while composing. After the draft has rested the application runs it as sending
// would, and keeps the answer with the key of the draft it answers. The answer is advice: the
// authority judges again on sending, so an application confirms only what `current()` says is
// fresh. Timers only, no `requestAnimationFrame`, so a hidden page still settles.

export interface Previewer<D, A> {
  /** The draft changed (or closed, with null). */
  change(draft: D | null): void;
  /** The answer on screen, and whether it answers the draft as it is now. */
  current(): { key: string; answer: A; fresh: boolean } | null;
  dispose(): void;
}

export function previewer<D, A>(spec: {
  /** Default 250 ms. */
  delay?: number;
  keyOf(draft: D): string;
  run(draft: D): Promise<A>;
  /** Called with the answer to show, or null; `fresh` false while a newer draft waits. */
  show(answer: A | null, fresh: boolean): void;
  /** Called when the run of the draft now on screen rejects; the one way an application hears it. */
  onError?(error: unknown, draft: D): void;
}): Previewer<D, A> {
  const delay = spec.delay ?? 250;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // bumped whenever the draft changes, so an answer that arrives late is dropped
  let runs = 0;
  let draftKey: string | null = null;
  let answered: { key: string; answer: A } | null = null;

  async function runDraft(draft: D, key: string, run: number): Promise<void> {
    let answer: A;
    try {
      answer = await spec.run(draft);
    } catch (error) {
      // no answer: the one on screen stays, and stays stale, so nothing is confirmed on it; the
      // application hears of it only while the draft is the one on screen, as it would of an answer
      if (run !== runs) return;
      // with no run in hand, the same draft is run again when it comes back
      draftKey = null;
      spec.onError?.(error, draft);
      return;
    }
    if (run !== runs) return;
    answered = { key, answer };
    spec.show(answer, true);
  }

  return {
    change(draft) {
      if (draft === null) {
        clearTimeout(timer);
        runs++;
        draftKey = null;
        answered = null;
        spec.show(null, true);
        return;
      }
      const key = spec.keyOf(draft);
      // the same draft again: the run in hand, or the answer on screen, is still the one
      if (key === draftKey) return;
      clearTimeout(timer);
      const run = ++runs;
      draftKey = key;
      if (answered) spec.show(answered.answer, answered.key === key);
      if (answered?.key === key) return;
      timer = setTimeout(() => void runDraft(draft, key, run), delay);
    },

    current: () => (answered ? { ...answered, fresh: answered.key === draftKey } : null),

    dispose() {
      clearTimeout(timer);
      runs++;
      draftKey = null;
      answered = null;
    },
  };
}
