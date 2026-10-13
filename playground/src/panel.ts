// The inspector: five tabs. «Attività» is the activity as the thread explains it
// and its denunciations; «Riga» is the line selected in the ledger; «Schemi» and
// «Leggi» show the gist schemas and the laws as the code they are; «Consolida» is
// the consolidation panel. It is drawn from the page's state alone. The selected
// line and the schemas are the places a person reads an id.

import { answer, verify, type Denunciation, type EventLine, type Json, type LineId } from 'consequitur';
import { toKdl } from 'consequitur-kdl';
import { goalFacts, goalRows } from './cards.ts';
import { codeView } from './code.ts';
import { createConsolidation } from './consolidation-view.ts';
import type { Derived } from './deduce.ts';
import { domain, membersIn, valueIn } from './domain.ts';
import { chip, h } from './dom.ts';
import { HEAD_CHIP, LAWS_CHIP, type InspectorTab, type PageState } from './state.ts';
import { gistLabel, lineLabel, memberSentence, metadataLabel, metadataValue, uiIndex, uiOf, userName, warningGist, writerName } from './ui-schema.ts';

function denunciationSentence(d: Denunciation, lines: EventLine[]): string {
  switch (d.sort) {
    case 'handle': {
      if (d.kind === 'set') {
        const set = domain().sets[d.key];
        const words = set ? (d.expected ? set.should : set.shouldNot) : `{member} ${d.expected ? 'dovrebbe essere in' : 'non dovrebbe essere in'} ${d.key}`;
        return memberSentence(words, d.member ?? '');
      }
      const said = (present: boolean, value: Json | undefined) => (present && value !== undefined ? metadataValue(d.key, value, lines) : 'niente');
      return `${metadataLabel(d.key)}: atteso ${said('expected' in d, d.expected)}, trovato ${said('found' in d, d.found)}`;
    }
    case 'line':
      return d.gist === warningGist() ? 'Un traguardo deve avvisare che una condizione non può più avverarsi' : `Il traguardo attende la riga «${gistLabel(d.gist)}»`;
    case 'thread':
      return domain().words.opening.replace('{found}', String(d.found));
  }
}

const section = (title: string | null, ...children: Array<Node | null>): HTMLElement =>
  h('section', { class: 'panel-section' }, title && h('h2', { class: 'panel-title' }, title), ...children);

/** The gists of the case, in the order the bar offers them. */
const gistsOf = (): string[] => domain().schema.gists.map((schema) => schema.gist).sort((a, b) => uiIndex(a) - uiIndex(b));

/**
 * What the code of a chip shows: the head of the schema, its laws, or one gist's schema, as JSON holds it,
 * and as the part of a schema object KDL writes it from.
 */
const dataOf = (chip: string): { json: Json | undefined; part: Record<string, Json> } => {
  const { head, lawsData } = domain();
  if (chip === HEAD_CHIP) return { json: head, part: head as Record<string, Json> };
  if (chip === LAWS_CHIP) return { json: lawsData, part: { laws: lawsData } };
  const gist = domain().gistData(chip);
  return { json: gist, part: { gists: gist === undefined ? [] : [gist] } };
};

/** A part of the schema as code: in KDL, the form a person writes, or in JSON, the object as it is read. */
const codeOf = ({ json, part }: ReturnType<typeof dataOf>, as: PageState['schemaAs'], label: string): HTMLElement =>
  codeView(as === 'kdl' ? toKdl(part).trimEnd() : json, `${label} in ${as.toUpperCase()}`);

/** The sentence every tab and chip of the laws closes with. */
const LAWS_NOTE = 'Le leggi giudicano solo le righe scritte da persone.';

export interface PanelHandlers {
  onTab(tab: InspectorTab): void;
  onGist(gist: string): void;
  onSchemaAs(as: PageState['schemaAs']): void;
}

export function createPanel(root: HTMLElement, handlers: PanelHandlers) {
  // a line's id is the hash of its fields, so one answer per line is the answer
  const verified = new Map<LineId, boolean>();
  let current: LineId | null = null;
  // the «Interfaccia» block stays as the person left it
  let interfaceOpen = false;
  // made once, not on each draw: its sources, drill and name survive leaving the tab
  const consolidation = createConsolidation();

  const tabs: Array<{ tab: InspectorTab; label: string }> = [
    { tab: 'activity', label: domain().words.tab },
    { tab: 'line', label: 'Riga' },
    { tab: 'schemas', label: 'Schemi' },
    { tab: 'laws', label: 'Leggi' },
    { tab: 'consolidation', label: 'Consolida' },
  ];
  const buttons = tabs.map(({ tab, label }) => {
    const button = h('button', { class: 'tab', type: 'button', role: 'tab', 'data-tab': tab }, label);
    button.addEventListener('click', () => handlers.onTab(tab));
    return button;
  });
  const body = h('div', { class: 'panel-body', role: 'tabpanel' });
  root.replaceChildren(h('div', { class: 'tabs', role: 'tablist' }, ...buttons), body);

  function activity(state: PageState): HTMLElement[] {
    const { thread, reading } = state;
    const { lines, handles } = thread;
    const answered = state.answered.flat();
    // what the authority answers; the rest, but for the thread's own, its policy leaves
    const { words, sets, policy = [] } = domain();
    const owed = new Set(answer(reading, handles, policy));
    const sentence = (d: Denunciation) =>
      h('li', null, denunciationSentence(d, lines), d.sort !== 'thread' && !owed.has(d) && h('span', { class: 'denunciation-note' }, ' · lasciata senza risposta'));

    const name = valueIn(handles, words.nameKey);
    const others = Object.entries(handles.value as Record<string, Json>).filter(([key]) => key !== words.nameKey);
    others.sort(([a], [b]) => (a === words.statusKey ? -1 : b === words.statusKey ? 1 : 0));
    // each set of the domain that has members, under its own name
    const groups = Object.entries(sets)
      .map(([set, { label }]) => ({ label, members: membersIn(handles, set) }))
      .filter(({ members }) => members.length > 0);

    return [
      section(
        words.subject,
        h('p', { class: 'activity-name' }, typeof name === 'string' ? name : words.none),
        others.length
          ? h(
              'dl',
              { class: 'facts-list' },
              ...others.flatMap(([key, value]) => [h('dt', null, metadataLabel(key)), h('dd', null, metadataValue(key, value, lines))]),
            )
          : null,
        ...groups.map(({ label, members }) =>
          h('div', { class: 'panel-group' }, h('p', { class: 'panel-label' }, label), h('div', { class: 'chips' }, ...members.map((u) => chip(userName(u), 'user')))),
        ),
        h('p', { class: reading.settled ? 'settled is-ok' : 'settled is-bad' }, reading.settled ? 'In accordo con le righe' : 'Non in accordo'),
      ),
      section(
        'Denunce',
        reading.denunciations.length
          ? h('ul', { class: 'denunciations' }, ...reading.denunciations.map(sentence))
          : h('p', { class: 'panel-empty' }, 'Nessuna.'),
        // what the server found and answered in the last post: by the time the panel draws, it agrees again
        ...(answered.length
          ? [
              h('p', { class: 'answered-label' }, "Risolte nell'ultimo invio"),
              h('ul', { class: 'denunciations is-answered' }, ...answered.map((d) => h('li', null, denunciationSentence(d, lines)))),
            ]
          : []),
      ),
    ];
  }

  function selected(state: PageState): HTMLElement[] {
    const line = state.selected === null ? undefined : state.thread.lines.find((l) => l.id === state.selected);
    if (!line) {
      current = null;
      return [section(null, h('p', { class: 'panel-empty' }, 'Nessuna riga selezionata.'))];
    }
    current = line.id;
    const verdict = h('p', { class: 'verdict' });
    const show = (ok: boolean) => {
      verdict.textContent = ok ? 'Verificata' : 'Non verificata';
      verdict.className = ok ? 'verdict is-ok' : 'verdict is-bad';
    };
    const known = verified.get(line.id);
    if (known !== undefined) show(known);
    else {
      verdict.textContent = 'Verifica in corso…';
      void verify(line).then((ok) => {
        verified.set(line.id, ok);
        // the selection may have moved while the hash was computed
        if (current === line.id) show(ok);
      });
    }
    // a goal's line shows its condition as the reading reads it, node by node
    const goal = state.reading.goals.find((g) => g.line === line.id);
    const condition = goal ? [h('p', { class: 'panel-label' }, 'La sua condizione, nodo per nodo'), h('div', { class: 'goal' }, ...goalRows(goalFacts(goal), state.thread.lines))] : [];
    return [section(null, h('p', { class: 'activity-name' }, lineLabel(line)), verdict, ...condition, h('p', { class: 'panel-label' }, 'La riga come è conservata'), codeView(line, 'La riga come JSON'))];
  }

  function schemas(state: PageState, derived: Derived): HTMLElement[] {
    const { gist } = state;
    const head = gist === HEAD_CHIP;
    const laws = gist === LAWS_CHIP;
    const pill = (name: string, label: string) => {
      const shown = name === HEAD_CHIP ? 'schema' : name === LAWS_CHIP ? 'laws' : name;
      const button = h('button', { class: 'gist-chip', type: 'button', 'aria-pressed': String(name === gist) }, h('span', { class: 'gist-name' }, shown), h('span', { class: 'gist-label' }, label));
      button.addEventListener('click', () => handlers.onGist(name));
      return button;
    };
    const chips = [pill(HEAD_CHIP, 'Testa'), ...gistsOf().map((name) => pill(name, gistLabel(name))), pill(LAWS_CHIP, 'Leggi')];
    const offered = derived.offered.has(gist);
    const who = writerName(state.writer);
    const ui = head || laws ? undefined : uiOf(gist);
    const details = h(
      'details',
      { class: 'interface' },
      h('summary', null, 'Interfaccia'),
      h('p', { class: 'panel-label' }, 'Come il banco compone, disegna e attende questa riga: non fa parte dello schema.'),
      ui ? codeView(ui, `Interfaccia di ${gist}`) : null,
    );
    details.open = interfaceOpen;
    details.addEventListener('toggle', () => (interfaceOpen = details.open));
    return [
      section(null, h('div', { class: 'gist-chips' }, ...chips)),
      section(
        null,
        head
          ? h('p', { class: 'panel-label' }, 'Le parole dello schema: come inizia, chi scrive le righe di sistema, gli insiemi, quali righe sono giudicate.')
          : laws
            ? h('p', { class: 'panel-label' }, LAWS_NOTE)
            : h('p', { class: offered ? 'offered is-yes' : 'offered is-no' }, offered ? `Offerta adesso a ${who}` : `Non offerta adesso a ${who}`),
        writtenAs(state),
        codeOf(dataOf(gist), state.schemaAs, head ? 'La testa dello schema' : laws ? 'Le leggi dello schema' : `Schema di ${gist}`),
      ),
      ui ? details : null,
    ].filter((part): part is HTMLElement => part !== null);
  }

  /** The switch between the two ways of writing the schema. */
  function writtenAs(state: PageState): HTMLElement {
    const choice = (as: PageState['schemaAs'], label: string) => {
      const button = h('button', { class: 'gist-chip', type: 'button', 'aria-pressed': String(state.schemaAs === as) }, h('span', { class: 'gist-label' }, label));
      button.addEventListener('click', () => handlers.onSchemaAs(as));
      return button;
    };
    return h('div', { class: 'gist-chips schema-as' }, choice('kdl', 'KDL'), choice('json', 'JSON'));
  }

  const laws = (state: PageState): HTMLElement[] => [
    section(null, writtenAs(state), codeOf(dataOf(LAWS_CHIP), state.schemaAs, 'Le leggi'), h('p', { class: 'panel-empty' }, LAWS_NOTE)),
  ];

  return {
    render(state: PageState, derived: Derived): void {
      // the first tab is named for what the domain is about
      buttons[0].textContent = domain().words.tab;
      for (const button of buttons) button.setAttribute('aria-selected', String(button.dataset.tab === state.tab));
      const content = state.tab === 'activity' ? activity(state) : state.tab === 'line' ? selected(state) : state.tab === 'schemas' ? schemas(state, derived) : state.tab === 'consolidation' ? [consolidation.el] : laws(state);
      body.replaceChildren(...content);
    },
  };
}
