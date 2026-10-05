// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewer } from '../src/index.ts';

/** A run whose answer is given by the test, when it chooses. */
function control() {
  const pending: Array<{ draft: string; resolve(answer: string): void; reject(error: Error): void }> = [];
  const run = (draft: string) => new Promise<string>((resolve, reject) => pending.push({ draft, resolve, reject }));
  return { pending, run };
}

describe('previewer', () => {
  const shown: Array<[string | null, boolean]> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    shown.length = 0;
    failed.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  const failed: Array<[unknown, string]> = [];
  const make = (run: (draft: string) => Promise<string>, delay?: number, onError?: (error: unknown, draft: string) => void) =>
    previewer<string, string>({ delay, keyOf: (d) => d.toLowerCase(), run, show: (answer, fresh) => shown.push([answer, fresh]), onError });

  it('runs a draft only after the default 250 ms of quiet', async () => {
    const { pending, run } = control();
    const p = make(run);
    p.change('A');
    await vi.advanceTimersByTimeAsync(249);
    expect(pending).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(pending.map((r) => r.draft)).toEqual(['A']);
  });

  it('starts the wait again on each change, and runs only the last draft', async () => {
    const { pending, run } = control();
    const p = make(run, 100);
    p.change('a');
    await vi.advanceTimersByTimeAsync(80);
    p.change('ab');
    await vi.advanceTimersByTimeAsync(80);
    expect(pending).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(pending.map((r) => r.draft)).toEqual(['ab']);
  });

  it('shows the answer fresh and keeps it as current', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    expect(p.current()).toBeNull();
    p.change('A');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].resolve('yes');
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual([['yes', true]]);
    expect(p.current()).toEqual({ key: 'a', answer: 'yes', fresh: true });
  });

  it('drops an answer that arrives for an older draft', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    p.change('b');
    pending[0].resolve('old');
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual([]);
    expect(p.current()).toBeNull();
    await vi.advanceTimersByTimeAsync(10);
    pending[1].resolve('new');
    await vi.advanceTimersByTimeAsync(0);
    expect(p.current()).toEqual({ key: 'b', answer: 'new', fresh: true });
  });

  it('shows the last answer as not fresh while a newer draft waits, and fresh again when it is answered', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].resolve('one');
    await vi.advanceTimersByTimeAsync(0);
    p.change('b');
    expect(shown.at(-1)).toEqual(['one', false]);
    expect(p.current()).toEqual({ key: 'a', answer: 'one', fresh: false });
    await vi.advanceTimersByTimeAsync(10);
    pending[1].resolve('two');
    await vi.advanceTimersByTimeAsync(0);
    expect(shown.at(-1)).toEqual(['two', true]);
    expect(p.current()?.fresh).toBe(true);
  });

  it('does nothing for a draft with the key of the one it already has', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('A');
    await vi.advanceTimersByTimeAsync(5);
    p.change('a');
    await vi.advanceTimersByTimeAsync(5);
    expect(pending).toHaveLength(1);
    pending[0].resolve('x');
    await vi.advanceTimersByTimeAsync(0);
    p.change('A');
    await vi.advanceTimersByTimeAsync(50);
    expect(pending).toHaveLength(1);
    expect(shown).toEqual([['x', true]]);
  });

  it('shows an answer again as fresh, with no new run, when the draft comes back to its key', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].resolve('one');
    await vi.advanceTimersByTimeAsync(0);
    p.change('b');
    p.change('a');
    expect(shown.at(-1)).toEqual(['one', true]);
    await vi.advanceTimersByTimeAsync(50);
    expect(pending).toHaveLength(1);
  });

  it('closing the draft cancels the wait and the run, clears the answer and shows nothing', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].resolve('one');
    await vi.advanceTimersByTimeAsync(0);
    p.change('b');
    p.change(null);
    expect(shown.at(-1)).toEqual([null, true]);
    expect(p.current()).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    expect(pending).toHaveLength(1);

    p.change('c');
    await vi.advanceTimersByTimeAsync(10);
    p.change(null);
    pending[1].resolve('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(p.current()).toBeNull();
    expect(shown.at(-1)).toEqual([null, true]);
  });

  it('keeps the answer on screen, stale, when a run fails', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].resolve('one');
    await vi.advanceTimersByTimeAsync(0);
    p.change('b');
    await vi.advanceTimersByTimeAsync(10);
    pending[1].reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(p.current()).toEqual({ key: 'a', answer: 'one', fresh: false });
  });

  it('tells onError of a run that rejects, with the error and the draft, and the answer on screen stays stale', async () => {
    const { pending, run } = control();
    const p = make(run, 10, (error, draft) => failed.push([error, draft]));
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].resolve('one');
    await vi.advanceTimersByTimeAsync(0);
    p.change('B');
    await vi.advanceTimersByTimeAsync(10);
    const down = new Error('down');
    pending[1].reject(down);
    await vi.advanceTimersByTimeAsync(0);
    expect(failed).toEqual([[down, 'B']]);
    expect(p.current()?.fresh).toBe(false);
    expect(shown.at(-1)).toEqual(['one', false]);
  });

  it('tells onError of a failure with no answer on screen, and shows nothing', async () => {
    const { pending, run } = control();
    const p = make(run, 10, (error, draft) => failed.push([error, draft]));
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(failed).toHaveLength(1);
    expect(p.current()).toBeNull();
    expect(shown).toEqual([]);
  });

  it('runs the same draft again after its run rejected, and answers it', async () => {
    const { pending, run } = control();
    const p = make(run, 10, (error, draft) => failed.push([error, draft]));
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(0);
    // the same draft again: no run was in hand and no answer on screen, so it is run again
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    expect(pending).toHaveLength(2);
    pending[1].resolve('one');
    await vi.advanceTimersByTimeAsync(0);
    expect(p.current()).toEqual({ key: 'a', answer: 'one', fresh: true });
    expect(failed).toHaveLength(1);
  });

  it('does not tell onError of a run whose draft has moved on, or been closed or disposed', async () => {
    const { pending, run } = control();
    const p = make(run, 10, (error, draft) => failed.push([error, draft]));
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    p.change('b');
    pending[0].reject(new Error('old'));
    await vi.advanceTimersByTimeAsync(10);
    p.change(null);
    pending[1].reject(new Error('closed'));
    await vi.advanceTimersByTimeAsync(0);
    p.change('c');
    await vi.advanceTimersByTimeAsync(10);
    p.dispose();
    pending[2].reject(new Error('disposed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(failed).toEqual([]);
  });

  it('swallows a rejected run when no onError is given', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    await vi.advanceTimersByTimeAsync(10);
    pending[0].reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(p.current()).toBeNull();
  });

  it('dispose stops the wait and drops what is in flight', async () => {
    const { pending, run } = control();
    const p = make(run, 10);
    p.change('a');
    p.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(pending).toHaveLength(0);

    const q = make(run, 10);
    q.change('b');
    await vi.advanceTimersByTimeAsync(10);
    q.dispose();
    pending[0].resolve('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(shown).toEqual([]);
    expect(q.current()).toBeNull();
  });
});
