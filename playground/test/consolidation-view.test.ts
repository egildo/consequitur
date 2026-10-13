// @vitest-environment jsdom
// The consolidation panel, driven the way a person drives it: the pickers are set and changed, the buttons clicked,
// and the events that wait are waited for. The sources are the domains' own examples, picked by their ids.

import { describe, expect, it, beforeEach } from 'vitest';
import { begin, EMPTY_BENCH, pick, run } from '../src/consolidation.ts';
import type { Domain, Example } from '../src/domain.ts';
import { createConsolidation } from '../src/consolidation-view.ts';
import { DOMAINS } from '../src/domains/index.ts';

const NOW = '2026-10-13T10:00:00.000Z';
const [sibar, editorial] = DOMAINS;

/** The example of a domain with this id. */
function exampleOf(domain: Domain, id: string): Example {
  const example = domain.examples.find((e) => e.id === id);
  if (!example) throw new Error(`No example «${id}» in ${domain.id}.`);
  return example;
}

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector);

/** The first button under the panel whose words are `words`. */
const button = (words: string): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === words);

function click(words: string): void {
  const element = button(words);
  if (!element) throw new Error(`No button «${words}».`);
  element.click();
}

/** Sets a picker to a value and dispatches the change a person makes. */
function choose(side: 'first' | 'second', role: 'domain' | 'example', value: string): void {
  const select = q<HTMLSelectElement>(`select[data-side="${side}"][data-role="${role}"]`);
  if (!select) throw new Error(`No ${role} picker for the ${side} source.`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Lets the posts that wait run, polling with real timers for up to about five seconds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The panel never got there.');
}

/** Waits until no button or picker is disabled: an event that waits disables them while it runs. */
const settled = (): Promise<void> => until(() => [...document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select')].every((el) => !el.disabled));

/** Picks an example of a domain on one side. */
async function pickExample(side: 'first' | 'second', domainId: string, exampleId: string): Promise<void> {
  choose(side, 'domain', domainId);
  choose(side, 'example', exampleId);
  await settled();
}

beforeEach(() => {
  document.body.replaceChildren(createConsolidation().el);
});

describe('the consolidation panel', () => {
  it('shows the pickers, both rows, with every domain and the «Scegli…» option, and nothing else yet', () => {
    const rows = document.querySelectorAll('.consolidation-row');
    expect(rows).toHaveLength(2);
    expect([...rows].map((row) => row.querySelector('p')?.textContent)).toEqual(['Prima fonte', 'Seconda fonte']);
    for (const side of ['first', 'second']) {
      const domains = q<HTMLSelectElement>(`select[data-side="${side}"][data-role="domain"]`);
      expect([...(domains?.options ?? [])].map((o) => o.value)).toEqual(DOMAINS.map((d) => d.id));
      expect([...(domains?.options ?? [])].map((o) => o.textContent)).toEqual(DOMAINS.map((d) => d.label));
      const examples = q<HTMLSelectElement>(`select[data-side="${side}"][data-role="example"]`);
      expect(examples?.options[0].textContent).toBe('Scegli…');
    }
    expect([...document.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Fonti']);
  });

  it('changing the domain refills the examples with «Scegli…» and picks none of them', () => {
    choose('first', 'domain', editorial.id);
    const examples = q<HTMLSelectElement>('select[data-side="first"][data-role="example"]');
    expect([...(examples?.options ?? [])].map((o) => o.value)).toEqual(['', ...editorial.examples.map((e) => e.id)]);
    expect(examples?.value).toBe('');
  });

  it('shows «Lo stesso schema» and «Avvia» for two examples of one domain', async () => {
    await pickExample('first', editorial.id, 'published');
    await pickExample('second', editorial.id, 'late');
    expect(document.body.textContent).toContain('Lo stesso schema');
    expect(button('Avvia')).toBeDefined();
    expect(document.querySelectorAll('.consolidation-row')[0].textContent).toContain('righe');
    expect(document.querySelectorAll('.consolidation-row')[1].textContent).toContain('righe');
  });

  it('lists 8 conflicts, names the schema with the two names joined by a dash, and «Avvia» starts a schema stop', async () => {
    await pickExample('first', sibar.id, 'first');
    await pickExample('second', editorial.id, 'published');
    expect(document.querySelectorAll('.consolidation-conflict')).toHaveLength(8);
    expect(q<HTMLInputElement>('.consolidation-name')?.value).toBe(`${sibar.schema.name}-${editorial.schema.name}`);

    click('Avvia');
    await settled();
    const stop = q('.consolidation-stop');
    expect(stop?.textContent).toContain('Conflitto di schema');
    expect([...(stop?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())).toEqual(['Prima', 'Seconda', 'A mano', 'Interrompi']);
  });

  it('answering every schema conflict with «Prima» ends at the steps list, with «Avanti» and «Fino al prossimo arresto»', async () => {
    await pickExample('first', sibar.id, 'first');
    await pickExample('second', editorial.id, 'published');
    const conflicts = document.querySelectorAll('.consolidation-conflict').length;
    click('Avvia');
    await settled();
    for (let i = 0; i < conflicts; i++) {
      click('Prima');
      await settled();
    }
    expect(q('.consolidation-stop')).toBeNull();
    expect(button('Avanti')).toBeDefined();
    expect(button('Fino al prossimo arresto')).toBeDefined();
  });

  it('stops at a step refused with «unreconcilable», and «Salta» then «Fino al prossimo arresto» ends with the new thread', async () => {
    await pickExample('first', editorial.id, 'late');
    await pickExample('second', editorial.id, 'late');
    click('Avvia');
    await settled();
    click('Fino al prossimo arresto');
    await settled();
    expect(q('.consolidation-stop')?.textContent).toContain('unreconcilable');

    click('Salta');
    await settled();
    click('Fino al prossimo arresto');
    await settled();
    expect(document.querySelector('.consolidation-stop')).toBeNull();
    expect([...document.querySelectorAll('h2')].map((h) => h.textContent)).toContain('Nuovo filo');
    expect(q('pre[aria-label="Dichiarazione"]')?.textContent).toContain('"from"');
    expect(document.querySelectorAll('.consolidation-lines li').length).toBeGreaterThan(0);
  });

  it('«A mano» with JSON that does not read says so, and the drill does not move', async () => {
    await pickExample('first', sibar.id, 'first');
    await pickExample('second', editorial.id, 'published');
    click('Avvia');
    await settled();
    click('A mano');
    const area = q<HTMLTextAreaElement>('.consolidation-hand');
    expect(area).not.toBeNull();
    if (area) area.value = 'not json';
    click('Applica');
    expect(q('.consolidation-error')?.textContent).toBe('JSON non valido');
    expect(q('.consolidation-stop')?.textContent).toContain('Conflitto di schema');
    expect(button('Prima')).toBeDefined();
  });

  it('«Interrompi» at a schema conflict shows «Consolidamento interrotto»', async () => {
    await pickExample('first', sibar.id, 'first');
    await pickExample('second', editorial.id, 'published');
    click('Avvia');
    await settled();
    click('Interrompi');
    await settled();
    expect(document.body.textContent).toContain('Consolidamento interrotto');
    expect(q('.consolidation-stop')).toBeNull();
  });

  it('«Modifica» opens a textarea holding the refused step as JSON', async () => {
    await pickExample('first', editorial.id, 'late');
    await pickExample('second', editorial.id, 'late');
    click('Avvia');
    await settled();
    click('Fino al prossimo arresto');
    await settled();
    click('Modifica');
    const area = q<HTMLTextAreaElement>('.consolidation-hand');
    expect(area).not.toBeNull();

    // the same drill, run outside the panel, stops at the same step with the same step
    const bench = await pick(await pick(EMPTY_BENCH, 'first', editorial, exampleOf(editorial, 'late'), NOW), 'second', editorial, exampleOf(editorial, 'late'), NOW);
    const { drill } = await run(begin(bench), NOW);
    const stop = drill?.stop;
    expect(stop?.at).toBe('step');
    expect(JSON.parse(area?.value ?? 'null')).toEqual(stop && drill?.steps[stop.index]);
  });
});
