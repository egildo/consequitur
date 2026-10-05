// @vitest-environment jsdom
// The page itself: the body of `index.html` and `main.ts` run on it under jsdom, driven by clicks the
// way a person drives it, in the SIBAR domain. The timers are fake, so the page's waits cost nothing;
// what is checked is what a person would see go wrong.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');

/** A fresh page: the body of `index.html`, and `main.ts` run again on it. */
async function boot(): Promise<void> {
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('<script')).replace(/<body[^>]*>/, '');
  vi.resetModules();
  await import('../src/main.ts');
}

const q = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T | null => root.querySelector<T>(selector);

/** The first button under `root` whose words start with `words`. */
const button = (words: string, root: ParentNode | null = document): HTMLButtonElement | undefined =>
  [...(root ?? document).querySelectorAll('button')].find((b) => b.textContent!.trim().startsWith(words));

function click(element: HTMLElement | null | undefined): void {
  if (!element) throw new Error('Nothing to click.');
  element.click();
}

function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (!element) throw new Error('Nothing to type into.');
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(element: HTMLSelectElement | null, value: string): void {
  if (!element) throw new Error('Nothing to choose from.');
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Lets the page's timers run, and the hashing that is not a timer, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (done()) return;
    await vi.advanceTimersByTimeAsync(50);
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('The page never got there.');
}

/** Sends the open draft, and waits for it to close. */
async function send(): Promise<void> {
  click(q('.draft-send'));
  await until(() => q('.draft') === null);
}

/** The words of the dock's blocks, the goals then the wrapper. */
const dockWords = (): string[] => [...document.querySelectorAll('#dock .goal-block')].map((b) => b.textContent!.replace(/\s+/g, ' '));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await boot();
});
afterEach(() => vi.useRealTimers());

/** An activity with a memo to lbianchi, a goal that awaits her answer, and the wrapper that awaits the goal. */
async function withGoals(): Promise<void> {
  click(button('Nuova attività', q('#offers')));
  type(q('.draft .draft-input'), 'Prova');
  await send();
  click(button('Promemoria', q('#offers')));
  type(q('.draft textarea'), 'Serve un parere @lbianchi');
  await send();
  click(button('Imposta un traguardo', q('#dock')));
  click(button('attendi:', q('#ledger')));
  await send();
  click(button('Imposta il completamento', q('#dock')));
  click(button('attendi:', q('#dock .dock-view')));
  await send();
  await until(() => dockWords().length === 2);
}

describe('«Cambia» on a goal the wrapper awaits', () => {
  it('a refusal of the new goal changes nothing, and once it goes through the old goal goes and the wrapper follows', async () => {
    await withGoals();
    expect(dockWords()[1]).toMatch(/«Traguardo 1» è raggiunto/);
    click(button('Cambia', q('#dock .goal-grid')));
    type(q('.goal-draft .draft-input'), 'Nuovo');
    // a goal with no condition is refused
    click(q('.goal-draft .condition-remove'));
    click(q('.goal-draft .draft-send'));
    await until(() => q('.draft-refusal')?.hidden === false && !q('.goal-draft')!.classList.contains('is-pending'));
    // the draft still takes the old goal's place, and the wrapper will follow it
    expect(q('.goal-draft .draft-note')!.hidden).toBe(false);
    expect(dockWords()).toHaveLength(2);
    expect(dockWords()[0]).toMatch(/^Traguardo 1/);

    click(button('attendi:', q('#ledger')));
    click(q('.goal-draft .draft-send'));
    await until(() => q('.goal-draft') === null && dockWords().some((w) => w.includes('«Nuovo»')));
    expect(dockWords()).toHaveLength(2);
    expect(dockWords()[0]).toMatch(/^Nuovo/);
    expect(dockWords()[1]).toMatch(/«Nuovo» è raggiunto/);
  });
});

describe('«Scrivo come»', () => {
  it('cannot change while lines are on their way, so all of them are written as the one who sent them', async () => {
    await withGoals();
    const writer = q<HTMLSelectElement>('#writer')!;
    click(button('Cambia', q('#dock .goal-grid')));
    type(q('.goal-draft .draft-input'), 'Nuovo');
    click(q('.goal-draft .draft-send'));
    expect(writer.disabled).toBe(true);
    choose(writer, 'user::lbianchi');
    expect(writer.value).toBe('user::mrossi');
    await until(() => !writer.disabled);
    expect(dockWords()[1]).toMatch(/«Nuovo» è raggiunto/);
    expect(writer.value).toBe('user::mrossi');
  });
});

describe('the ledger', () => {
  it('keeps the cards that draw the same when a goal is being composed', async () => {
    click(button('Nuova attività', q('#offers')));
    type(q('.draft .draft-input'), 'Prova');
    await send();
    // the records offer nothing to await, and had no action either
    const records = [...document.querySelectorAll('#ledger .card-record')];
    expect(records.length).toBeGreaterThan(0);
    click(button('Imposta un traguardo', q('#dock')));
    const during = [...document.querySelectorAll('#ledger .card-record')];
    expect(during.filter((node, i) => node === records[i])).toHaveLength(records.length);
  });
});

describe('pointing at a line', () => {
  it('stops when the element pointing is built again, with no leave or blur to say so', async () => {
    click(button('Nuova attività', q('#offers')));
    type(q('.draft .draft-input'), 'Prova');
    await send();
    click(button('Promemoria', q('#offers')));
    type(q('.draft textarea'), 'Serve un parere @lbianchi');
    await send();
    click(button('Imposta un traguardo', q('#dock')));
    click(button('attendi:', q('#ledger')));
    await send();
    // lbianchi answers: the goal's check is found, and its tick points at her line
    choose(q('#writer'), 'user::lbianchi');
    click(button('Ricevuto', q('#ledger')));
    await send();
    const tick = q('#dock .tick-button')!;
    tick.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelectorAll('#ledger .is-lit')).toHaveLength(1);
    expect(q('svg.band')!.hasAttribute('hidden')).toBe(false);
    // a line arrives while the pointer rests on the tick, and the dock is drawn again
    click(button('Commento', q('#offers')));
    type(q('.draft textarea'), 'Fatto');
    await send();
    expect(tick.isConnected).toBe(false);
    expect(document.querySelectorAll('#ledger .is-lit')).toHaveLength(0);
    expect(q('svg.band')!.hasAttribute('hidden')).toBe(true);
  });
});
