// The SIBAR activity: a request among colleagues, with memos, documents and signatures. The case is
// `cases/sibar-activity/`; this is the application's side of it: the words, the cards, how a line is
// composed, how a goal awaits it, the people, and the document system the page plays.

import { kinOf, type EventLine } from 'consequitur';
import policyText from '../../../cases/sibar-activity/policy.json?raw';
import scenariosText from '../../../cases/sibar-activity/scenarios.json?raw';
import schemaText from '../../../cases/sibar-activity/schema.json?raw';
import { readScenarios } from '../../../cases/scenario.ts';
import { defineDomain, membersIn, NOTE, valueIn, type Command, type DocumentsUi, type GistUi, type View } from '../domain.ts';
import { gistLabel, timeOf, userName, writerName } from '../ui-schema.ts';

const STAGES = ['istruttoria', 'firma', 'invio'];

const PEOPLE = [
  { id: 'mrossi', name: 'Mario Rossi' },
  { id: 'lbianchi', name: 'Laura Bianchi' },
  { id: 'gverdi', name: 'Giulia Verdi' },
];

/** In the order of the bar of offers. */
const ui: GistUi[] = [
  {
    gist: 'create',
    label: 'Nuova attività',
    card: 'header',
    head: { title: 'name', people: ['assignTo'], by: 'aperta da' },
    compose: { fields: [{ key: 'name', label: 'Nome' }], atoms: { mention: 'assignTo' }, self: 'assignTo' },
  },
  {
    gist: 'memo',
    label: 'Promemoria',
    card: 'note',
    excerpt: 'text',
    compose: { body: 'text', atoms: { mention: 'assignTo', document: 'document' } },
  },
  { gist: 'comment', label: 'Commento', card: 'note', compose: { body: 'text', atoms: { mention: 'mentions' } } },
  {
    gist: 'got_it',
    label: 'Ricevuto',
    card: 'mark',
    says: '{writer} ha confermato',
    compose: { refer: { key: 'about', gists: ['memo'] }, body: NOTE, bodyOptional: true },
    awaited: [{ on: 'memo', key: 'about', value: { id: true }, by: { users: 'assignTo' }, phrase: '{who} conferma {line}' }],
  },
  {
    gist: 'doc_ref',
    label: 'Collega documento',
    card: 'document',
    compose: {
      pick: { document: 'document', direction: 'direction' },
      refer: { key: 'about', gists: ['memo'], optional: true },
      body: NOTE,
      bodyOptional: true,
    },
  },
  { gist: 'set_goal', label: 'Traguardo', card: 'goal', compose: {} },
  {
    gist: 'stage',
    label: 'Fase',
    card: 'mark',
    says: "{writer} ha portato l'attività alla fase {stage}",
    compose: { fields: [{ key: 'stage', label: 'Fase', options: STAGES }], body: NOTE, bodyOptional: true },
  },
  { gist: 'closed', label: 'Chiudi', card: 'mark', says: "{writer} ha chiuso l'attività", compose: { body: NOTE, bodyOptional: true } },
  {
    gist: 'memo_revoke',
    label: 'Annulla promemoria',
    card: 'mark',
    says: '{writer} ha annullato un promemoria',
    compose: { refer: { key: 'target', gists: ['memo'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'doc_ref_revoke',
    label: 'Scollega documento',
    card: 'mark',
    says: '{writer} ha scollegato un documento',
    compose: { refer: { key: 'target', gists: ['doc_ref'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'set_goal_revoke',
    label: 'Annulla traguardo',
    card: 'mark',
    says: '{writer} ha annullato il traguardo',
    compose: { refer: { key: 'target', gists: ['set_goal'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'closed_revoke',
    label: 'Riapri',
    card: 'mark',
    says: "{writer} ha riaperto l'attività",
    compose: { refer: { key: 'target', gists: ['closed'] }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'quit',
    label: 'Esci',
    card: 'mark',
    says: "{writer} ha lasciato l'attività",
    compose: {
      confirm: { question: "Vuoi uscire da un'attività ancora aperta?", yes: 'Esci', no: 'Resta', while: { key: 'status', value: 'open' } },
      body: NOTE,
      bodyOptional: true,
    },
  },
  {
    gist: 'doc_signed',
    label: 'Documento firmato',
    card: 'fact',
    compose: { pick: { document: 'document' } },
    awaited: [
      { on: 'doc_ref', key: 'document', value: { payload: 'document' }, by: { kin: 'system' }, phrase: 'il documento {document} è firmato' },
      {
        on: 'doc_ref',
        key: 'document',
        value: { payload: 'document' },
        by: { kin: 'system' },
        each: { key: 'by', set: 'assignees' },
        phrase: 'il documento {document} è firmato da {by}',
      },
    ],
  },
  { gist: 'doc_created', label: 'Documento creato', card: 'fact' },
  { gist: 'goal_warning', label: 'Avviso', card: 'mark' },
  { gist: 'assigned', label: 'Assegnazione', card: 'record' },
  { gist: 'unassigned', label: 'Fine assegnazione', card: 'record' },
  { gist: 'metadata_set', label: 'Metadato', card: 'record' },
];

// ── the document system the page plays ──

const FIXED_DOCUMENTS = [
  { code: '34132412', subject: 'Determina di liquidazione fornitura arredi' },
  { code: '34132587', subject: 'Richiesta di parere sul bilancio di previsione' },
  { code: '34133019', subject: 'Verbale della riunione di coordinamento' },
  { code: '34133264', subject: 'Contratto di manutenzione degli impianti' },
];

/** The documents the page knows: the fixed four, then those the thread says were created. */
let known = [...FIXED_DOCUMENTS];

/** The code of the next new document: the highest code the list holds, plus one. */
const nextDocumentCode = (): string => String(Math.max(...known.map((d) => Number(d.code))) + 1).padStart(8, '0');

const userIdOf = (writer: string): string => writer.slice(writer.indexOf('::') + 2);

/** A user who is an expected assignee signs a document of the thread once, while the activity is open. */
function canSign(view: View, line: EventLine): boolean {
  const user = userIdOf(view.writer);
  const document = line.payload.document;
  if (kinOf(view.writer) !== 'user' || typeof document !== 'string') return false;
  if (valueIn(view.reading.expected, 'status') !== 'open' || !membersIn(view.reading.expected, 'assignees').includes(user)) return false;
  return !view.thread.lines.some((l) => view.standing.has(l.id) && l.gist === 'doc_signed' && l.payload.document === document && l.payload.by === user);
}

const documents: DocumentsUi = {
  list: () => known,
  subject: (code) => known.find((d) => d.code === code)?.subject,
  reset() {
    known = [...FIXED_DOCUMENTS];
  },
  learn(lines) {
    for (const { gist, payload } of lines) {
      const { document, subject } = payload;
      if (gist === 'doc_created' && typeof document === 'string' && typeof subject === 'string' && !known.some((d) => d.code === document)) known.push({ code: document, subject });
    }
  },
  factsOf(line, view) {
    const document = line.payload.document;
    if (line.gist !== 'doc_ref' || document === undefined) return undefined;
    const byId = new Map(view.thread.lines.map((l) => [l.id, l] as const));
    return view.reading.inForce
      .map((id) => byId.get(id))
      .filter((l): l is EventLine => l !== undefined && kinOf(l.writer) !== 'user' && l.payload.document === document);
  },
  factSentence(fact) {
    const { by } = fact.payload;
    if (fact.gist === 'doc_signed' && typeof by === 'string') return `Firmato da ${userName(by)} · ${timeOf(fact.timestamp)}`;
    if (fact.gist === 'doc_created') return `Creato · ${timeOf(fact.timestamp)}`;
    return `${gistLabel(fact.gist)} · ${writerName(fact.writer)} · ${timeOf(fact.timestamp)}`;
  },
};

const commands: Command[] = [
  {
    id: 'sign',
    label: 'Firma',
    onLine: (line, view) => line.gist === 'doc_ref' && view.standing.has(line.id) && canSign(view, line),
    run: (host, line) => host.send({ gist: 'doc_signed', writer: host.authority, payload: { document: String(line?.payload.document), by: userIdOf(host.writer) } }),
  },
  {
    id: 'new-document',
    label: 'Nuovo documento',
    // a memo also offers a document made on the spot, written about it
    onLine: (line, view) => line.gist === 'memo' && view.standing.has(line.id) && view.offered.has('doc_ref'),
    inBar: { after: 'doc_ref' },
    async run(host, line) {
      const subject = await host.askSubject();
      if (subject === null) return undefined;
      const document = nextDocumentCode();
      const made = await host.send({ gist: 'doc_created', writer: host.authority, payload: { document, subject } });
      if (made) return made;
      return host.send({ gist: 'doc_ref', writer: host.writer, payload: { document, direction: 'outbound', ...(line ? { about: line.id } : {}) } });
    },
  },
];

const scenarios = new Map(readScenarios(scenariosText).map((s) => [s.id, s]));
const steps = (id: string) => scenarios.get(id)!.steps;

export const sibar = defineDomain({
  id: 'sibar',
  label: 'Attività (SIBAR)',
  file: schemaText,
  policyFile: policyText,
  words: {
    title: 'Banco delle attività · consequitur',
    ledger: "Le righe dell'attività",
    panel: "Stato dell'attività",
    tab: 'Attività',
    subject: "L'attività",
    none: 'Nessuna attività',
    nameKey: 'name',
    statusKey: 'status',
    opening: "L'attività non ha una sola «Nuova attività»: {found}",
    nothing: 'Nessuna riga da scrivere adesso.',
    refusals: {
      'unknown-gist': 'Questo tipo di riga non esiste.',
      'writer-not-allowed': 'Chi scrive non può scrivere questa riga.',
      'not-now': 'Questa riga non si può scrivere adesso.',
      'invalid-payload': 'Manca qualcosa di necessario, o qualcosa non va.',
      'unknown-line': "La riga indicata non è nell'attività.",
      'not-revocable': 'Questa riga non può annullare quella indicata.',
      unreconcilable: "Un'attività comincia con «Nuova attività», una volta sola.",
      law: "Questa riga lascerebbe l'attività in uno stato non ammesso.",
      unconfirmed: 'Questa riga ha delle conseguenze: confermale per inviarla.',
    },
  },
  people: PEOPLE,
  writers: [
    { writer: 'user::mrossi', label: 'Mario Rossi' },
    { writer: 'user::lbianchi', label: 'Laura Bianchi' },
    { writer: 'user::gverdi', label: 'Giulia Verdi' },
    { writer: 'system::sibardoc', label: 'Sistema' },
  ],
  systemName: 'Sistema',
  ui,
  values: {
    name: { label: 'Nome' },
    status: { label: 'Stato', words: { open: 'aperta', closed: 'chiusa' } },
    stage: { label: 'Fase' },
    acknowledged: { label: 'Confermato', kind: 'line' },
    documents: { label: 'Documenti', kind: 'list' },
    documents_in: { label: 'In entrata', kind: 'list' },
    documents_out: { label: 'In uscita', kind: 'list' },
  },
  sets: {
    assignees: {
      label: 'Assegnatari',
      joined: '{member} è assegnatario',
      left: '{member} non è più assegnatario',
      should: '{member} dovrebbe essere assegnatario',
      shouldNot: '{member} non dovrebbe esserlo',
    },
  },
  laws: {
    'keeps-set': { assignees: "L'attività resterebbe aperta senza assegnatari." },
    settles: { '': "L'attività resterebbe in disaccordo con le sue righe." },
  },
  goals: {
    most: 2,
    wrapper: { name: 'Completamento' },
    empty: "Nessun traguardo: l'attività si chiude a mano",
    outcomes: [
      { then: 'closed', label: "chiudi l'attività", sentence: "→ chiude l'attività" },
      { then: 'stage', label: 'passa alla fase…', sentence: '→ passa alla fase {stage}', with: [{ key: 'stage', kind: 'choice', options: STAGES }] },
      {
        then: 'memo',
        label: 'scrivi un promemoria a…',
        sentence: '→ scrive un promemoria a {assignTo}',
        bare: '→ scrive un promemoria',
        with: [
          { key: 'assignTo', kind: 'person' },
          { key: 'text', kind: 'text', placeholder: 'Testo del promemoria' },
        ],
      },
    ],
  },
  documents,
  commands,
  examples: [
    { id: 'first', label: "Carica l'esempio", steps: steps('first') },
    { id: 'opinion', label: 'Esempio: parere e firme', steps: steps('opinion') },
  ],
});
