// The consolidation panel: two played threads picked as sources, the schema derived from them with its
// conflicts, and the drill walked choice by choice. The element is built once and draws itself from its own
// bench after every event. It never reads the page's thread, state or domain in use, and names no gist: a
// domain is read through DOMAINS alone.

import { consequitur, type Choice, type Consolidation, type Drill, type Json, type Schema, type Step, type Stop } from 'consequitur';
import { advance, begin, EMPTY_BENCH, pick, run, type Bench } from './consolidation.ts';
import { codeView } from './code.ts';
import { h } from './dom.ts';
import type { Domain } from './domain.ts';
import { DOMAINS } from './domains/index.ts';

type Side = 'first' | 'second';

const SIDES: Array<{ side: Side; label: string }> = [
  { side: 'first', label: 'Prima fonte' },
  { side: 'second', label: 'Seconda fonte' },
];

/** The time of an event. The playground is a host, so it is the one place the clock is read. */
const now = (): string => new Date().toISOString();

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A schema's name and version, as the page writes them: `name v1`. */
const nameOf = (schema: Schema): string => [schema.name, schema.version === undefined ? undefined : `v${schema.version}`].filter(Boolean).join(' ');

/** A conflict's part and name; the name is left out when the part has none. */
const conflictName = (part: string, name: string): string => [part, name].filter(Boolean).join(' ');

/** The first eight hex characters of a line's id, after its algorithm's prefix. */
const shortId = (id: string): string => id.replace('sha256:', '').slice(0, 8);

/** The two parts of a schema as code, each under its label. */
function pair(first: Json, second: Json): HTMLElement {
  return h(
    'div',
    { class: 'consolidation-pair' },
    h('p', { class: 'panel-label' }, 'Prima'),
    codeView(first, 'Prima'),
    h('p', { class: 'panel-label' }, 'Seconda'),
    codeView(second, 'Seconda'),
  );
}

const section = (title: string, ...children: Array<Node | null>): HTMLElement => h('section', { class: 'panel-section' }, h('h2', { class: 'panel-title' }, title), ...children);

/** The marks of a step: where the drill stopped, whether it was skipped or played, and whether it was edited. */
function marksOf(drill: Drill, index: number): string[] {
  const marks: string[] = [];
  if (drill.stop?.at === 'step' && drill.stop.index === index) marks.push('✗');
  // a skipped step is behind the drill too, so it is told before the played ones
  else if (drill.skipped.includes(index)) marks.push('salta');
  else if (index < drill.next) marks.push('✓');
  else if (index === drill.next && drill.status === 'going') marks.push('▶');
  if (drill.edited.includes(index)) marks.push('modificato');
  return marks;
}

export function createConsolidation(): { el: HTMLElement } {
  const el = h('div', { class: 'consolidation' });
  // the panel's whole state: a bench is never changed, the next one replaces it
  let bench: Bench = EMPTY_BENCH;
  let pending = false;
  // the domain each picker shows; a pick does not change it, and only the picker does
  const chosen: Record<Side, Domain> = { first: DOMAINS[0], second: DOMAINS[0] };
  // the textarea a stop revealed: by hand for a schema conflict, an edit for a refused step
  let reveal: 'hand' | 'edit' | undefined;

  /** Draws the panel from the bench. */
  function draw(): void {
    const parts: Array<HTMLElement | null> = sections();
    el.replaceChildren(...parts.filter((part): part is HTMLElement => part !== null));
  }

  /** Replaces the bench with one that needed no waiting, and draws it. */
  function set(next: Bench): void {
    bench = next;
    reveal = undefined;
    draw();
  }

  /**
   * Runs an event that waits (a pick, an advance, a run). The buttons are disabled while it runs, so a second
   * event cannot start on a bench that is about to change. A failure is the bench's error, never a rejection.
   */
  async function wait(work: () => Promise<Bench>): Promise<void> {
    pending = true;
    draw();
    try {
      bench = await work();
    } catch (error) {
      bench = { ...bench, error: messageOf(error) };
    } finally {
      pending = false;
      reveal = undefined;
      draw();
    }
  }

  const choose = (choice: Choice): void => {
    void wait(() => advance(bench, now(), choice));
  };

  function button(label: string, onClick: () => void, extra?: string): HTMLButtonElement {
    const element = h('button', { type: 'button', class: extra === undefined ? 'action' : `action ${extra}` }, label);
    element.disabled = pending;
    element.addEventListener('click', onClick);
    return element;
  }

  /**
   * A textarea that holds JSON, and «Applica» to post what it reads as. JSON that does not read says so and posts
   * nothing, so a typo leaves the drill where it stands.
   */
  function handEditor<T>(text: string, post: (value: T) => void): HTMLElement {
    const area = h('textarea', { class: 'consolidation-hand', spellcheck: 'false' });
    area.value = text;
    // empty until a problem is found, and hidden by the stylesheet while it is
    const problem = h('p', { class: 'consolidation-error' });
    const apply = button('Applica', () => {
      let value: T;
      try {
        value = JSON.parse(area.value);
      } catch {
        problem.textContent = 'JSON non valido';
        return;
      }
      post(value);
    });
    return h('div', { class: 'consolidation-edit' }, area, apply, problem);
  }

  /** One source: its domain, its example, and its line count once it is picked. */
  function sourceRow(side: Side, label: string): HTMLElement {
    const domain = chosen[side];
    const picked = bench[side];
    const domainSelect = h('select', { 'data-side': side, 'data-role': 'domain' }, ...DOMAINS.map((d) => h('option', { value: d.id }, d.label)));
    domainSelect.value = domain.id;
    const exampleSelect = h('select', { 'data-side': side, 'data-role': 'example' });
    // the first option is empty: choosing it picks nothing
    const fill = (of: Domain, value: string): void => {
      exampleSelect.replaceChildren(h('option', { value: '' }, 'Scegli…'), ...of.examples.map((e) => h('option', { value: e.id }, e.label)));
      exampleSelect.value = value;
    };
    fill(domain, picked?.domain.id === domain.id ? picked.example.id : '');

    domainSelect.addEventListener('change', () => {
      const next = DOMAINS.find((d) => d.id === domainSelect.value);
      if (next === undefined) return;
      chosen[side] = next;
      // a new domain offers its own examples, and picks none of them
      fill(next, '');
    });
    exampleSelect.addEventListener('change', () => {
      const of = chosen[side];
      const example = of.examples.find((e) => e.id === exampleSelect.value);
      if (example === undefined) return;
      void wait(() => pick(bench, side, of, example, now()));
    });

    domainSelect.disabled = pending;
    exampleSelect.disabled = pending;
    return h(
      'div',
      { class: 'consolidation-row', role: 'group', 'aria-label': label },
      h('p', { class: 'panel-label' }, label),
      h('div', { class: 'consolidation-pick' }, domainSelect, exampleSelect),
      picked ? h('p', { class: 'panel-label' }, `${picked.source.lines.length} righe`) : null,
    );
  }

  /** The schema the two sources derive, with its conflicts, and the name the new schema is given. */
  function schemaSection(c: Consolidation): HTMLElement {
    const input = h('input', { class: 'consolidation-name', type: 'text' });
    input.value = bench.name;
    input.disabled = pending;
    // the name is kept as it is typed; a redraw here would move the caret
    input.addEventListener('input', () => {
      bench = { ...bench, name: input.value };
    });

    const { conflicts } = c.derived;
    return section(
      'Schema derivato',
      c.derived.same
        ? h('p', { class: 'panel-label' }, `Lo stesso schema: ${nameOf(c.schemas[0])}`)
        : h(
            'div',
            { class: 'consolidation-conflicts' },
            h('p', { class: 'panel-label' }, 'Conflitti di schema'),
            conflicts.length === 0
              ? h('p', { class: 'panel-empty' }, 'Nessun conflitto')
              : h(
                  'ul',
                  { class: 'consolidation-list' },
                  ...conflicts.map((conflict) => h('li', { class: 'consolidation-conflict' }, h('p', null, conflictName(conflict.part, conflict.name)), pair(conflict.first, conflict.second))),
                ),
          ),
      h('label', { class: 'consolidation-field' }, h('span', { class: 'panel-label' }, 'Nome dello schema'), input),
    );
  }

  /** Where a drill stopped: a schema conflict to answer, or a refused step to retry, edit, skip or abort. */
  function stopView(stop: Stop): HTMLElement {
    if (stop.at === 'schema') {
      const { conflict, problems } = stop;
      return h(
        'div',
        { class: 'consolidation-stop' },
        h('p', { class: 'panel-label' }, 'Conflitto di schema'),
        h('p', null, conflictName(conflict.part, conflict.name)),
        pair(conflict.first, conflict.second),
        problems.length > 0 ? h('p', { class: 'consolidation-error' }, problems.join(' ')) : null,
        h(
          'div',
          { class: 'consolidation-choices' },
          button('Prima', () => choose({ do: 'first' })),
          button('Seconda', () => choose({ do: 'second' })),
          button('A mano', () => revealed('hand')),
          button('Interrompi', () => choose({ do: 'abort' })),
        ),
        reveal === 'hand' ? handEditor<Json>('', (part) => choose({ do: 'by-hand', part })) : null,
      );
    }
    return h(
      'div',
      { class: 'consolidation-stop' },
      h('p', { class: 'panel-label' }, 'Passo rifiutato'),
      // the refusal's code and detail when the engine refused the step; otherwise the drill's own reason
      h('p', null, stop.refusal ? `${stop.refusal.code}: ${stop.refusal.detail}` : stop.why),
      h(
        'div',
        { class: 'consolidation-choices' },
        button('Riprova', () => choose({ do: 'again' })),
        button('Modifica', () => revealed('edit')),
        button('Salta', () => choose({ do: 'skip' })),
        button('Interrompi', () => choose({ do: 'abort' })),
      ),
      reveal === 'edit' ? handEditor<Step>(JSON.stringify(stop.step, null, 2), (step) => choose({ do: 'edit', step })) : null,
    );
  }

  /** Reveals one textarea of the stop, and draws it. */
  function revealed(which: 'hand' | 'edit'): void {
    reveal = which;
    draw();
  }

  /** One step of the drill: its place, its source, what it says, and its marks. */
  function stepItem(drill: Drill, step: Step, index: number): HTMLElement {
    const [firstCount] = drill.consolidation.taken;
    return h(
      'li',
      { class: 'consolidation-step' },
      h('span', { class: 'consolidation-source' }, index < firstCount ? '1' : '2'),
      `${index + 1}. ${step.gist} · ${step.writer}`,
      h('span', { class: 'consolidation-mark' }, marksOf(drill, index).join(' ')),
    );
  }

  function drillSection(drill: Drill): HTMLElement {
    const { stop } = drill;
    const after: Array<Node | null> = [];
    if (stop) after.push(stopView(stop));
    else if (drill.status === 'going') {
      after.push(
        h(
          'div',
          { class: 'consolidation-choices' },
          button('Avanti', () => void wait(() => advance(bench, now()))),
          button('Fino al prossimo arresto', () => void wait(() => run(bench, now()))),
        ),
      );
    }
    if (drill.status === 'aborted') after.push(h('p', { class: 'panel-empty' }, 'Consolidamento interrotto'));
    return section('Passi', h('ol', { class: 'consolidation-steps' }, ...drill.steps.map((step, index) => stepItem(drill, step, index))), ...after);
  }

  /** The new thread once the drill is done: whether it agrees with its own lines, what was skipped and edited, and its declaration. */
  function newThread(drill: Drill): HTMLElement | null {
    const { state, schema } = drill;
    if (state === undefined || schema === undefined) return null;
    const settled = consequitur(state.lines, state.handles, schema).settled;
    const [first] = state.lines;
    return section(
      'Nuovo filo',
      h('p', { class: settled ? 'settled is-ok' : 'settled is-bad' }, `${state.lines.length} righe, ${settled ? 'in accordo con le righe' : 'non in accordo'}`),
      h('p', { class: 'panel-label' }, `saltati: ${drill.skipped.length}, modificati: ${drill.edited.length}`),
      h('ol', { class: 'consolidation-lines' }, ...state.lines.map((line) => h('li', null, `${line.gist} · ${line.writer} · ${shortId(line.id)}`))),
      first ? h('p', { class: 'panel-label' }, 'Dichiarazione') : null,
      first ? codeView(first.thread ?? null, 'Dichiarazione') : null,
    );
  }

  function sections(): Array<HTMLElement | null> {
    const { consolidation, drill } = bench;
    return [
      section('Fonti', ...SIDES.map(({ side, label }) => sourceRow(side, label))),
      consolidation ? schemaSection(consolidation) : null,
      consolidation && !drill ? h('div', { class: 'consolidation-choices' }, button('Avvia', () => set(begin(bench)), 'consolidation-start')) : null,
      drill ? drillSection(drill) : null,
      drill?.status === 'done' ? newThread(drill) : null,
      bench.error === undefined ? null : h('p', { class: 'consolidation-error' }, bench.error),
    ];
  }

  draw();
  return { el };
}
