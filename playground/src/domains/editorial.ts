// The editorial review: an article, its author, two reviewers who must both approve a version, and an
// editor who publishes. The case is `cases/editorial-review/`; this is the application's side of it.
// It has no policy, no documents and no command: the clock is a writer like the others, who posts
// that a deadline passed, and the only thing the page adds to the thread is its words.

import { readScenarios } from 'consequitur';
import scenariosText from '../../../cases/editorial-review/scenarios.json?raw';
import schemaText from '../../../cases/editorial-review/schema.json?raw';
import { defineDomain, NOTE, type GistUi } from '../domain.ts';

/** In the order of the bar of offers. */
const ui: GistUi[] = [
  {
    gist: 'submit',
    label: 'Proposta articolo',
    card: 'header',
    head: { title: 'title', people: ['authors', 'editor'], by: 'proposto da' },
    compose: {
      fields: [
        { key: 'title', label: 'Titolo' },
        { key: 'version', label: 'Versione', initial: 'v1' },
        { key: 'editor', label: 'Direttore', options: 'people', initial: 'drusso' },
      ],
      self: 'authors',
    },
  },
  {
    gist: 'request_review',
    label: 'Chiedi revisione',
    card: 'mark',
    says: '{writer} ha chiesto la revisione a {reviewers}',
    compose: { atoms: { mention: 'reviewers' }, body: NOTE, bodyOptional: true },
  },
  {
    gist: 'revision',
    label: 'Nuova versione',
    card: 'mark',
    says: '{writer} ha inviato la versione {version}',
    compose: { fields: [{ key: 'version', label: 'Versione' }], body: NOTE, bodyOptional: true },
  },
  {
    gist: 'approve',
    label: 'Approva',
    card: 'mark',
    says: '{writer} ha approvato la versione {version}',
    compose: { fields: [{ key: 'version', label: 'Versione', current: 'version' }], body: NOTE, bodyOptional: true },
    // a goal waits for each reviewer's approval of the version a card names
    awaited: ['submit', 'revision'].map((on) => ({
      on,
      key: 'version',
      value: { payload: 'version' },
      by: { members: 'reviewers' },
      phrase: '{who} approva la versione {version}',
    })),
  },
  {
    gist: 'approve_revoke',
    label: 'Ritira approvazione',
    card: 'mark',
    says: "{writer} ha ritirato un'approvazione",
    compose: { refer: { key: 'target', gists: ['approve'] }, body: NOTE, bodyOptional: true },
  },
  { gist: 'request_changes', label: 'Chiedi modifiche', card: 'mark', says: '{writer} ha chiesto modifiche', compose: { body: NOTE, bodyOptional: true } },
  { gist: 'comment', label: 'Commento', card: 'note', compose: { body: 'text', atoms: { mention: 'mentions' } } },
  { gist: 'set_goal', label: 'Traguardo', card: 'goal', compose: {} },
  {
    gist: 'set_goal_revoke',
    label: 'Annulla traguardo',
    card: 'mark',
    says: '{writer} ha annullato il traguardo',
    compose: { refer: { key: 'target', gists: ['set_goal'] }, body: NOTE, bodyOptional: true },
  },
  { gist: 'publish', label: 'Pubblica', card: 'mark', says: "{writer} ha pubblicato l'articolo", compose: { body: NOTE, bodyOptional: true } },
  {
    gist: 'deadline',
    label: 'Scadenza',
    card: 'mark',
    says: '{writer} ha fissato la scadenza al {date}',
    compose: { fields: [{ key: 'date', label: 'Data', initial: '2026-10-31T17:00:00+01:00' }] },
  },
  { gist: 'deadline_passed', label: 'Scadenza passata', card: 'mark', says: 'La scadenza è passata', compose: {} },
  { gist: 'leave_team', label: 'Esci dalla redazione', card: 'mark', says: '{writer} ha lasciato la redazione', compose: { body: NOTE, bodyOptional: true } },
  { gist: 'goal_warning', label: 'Avviso', card: 'mark' },
  { gist: 'joined', label: 'Ingresso', card: 'record' },
  { gist: 'left', label: 'Uscita', card: 'record' },
  { gist: 'value_set', label: 'Valore', card: 'record' },
];

const scenarios = new Map(readScenarios(scenariosText).map((s) => [s.id, s]));
const steps = (id: string) => scenarios.get(id)!.steps;

export const editorial = defineDomain({
  id: 'editorial',
  label: 'Revisione editoriale',
  file: schemaText,
  words: {
    title: 'Banco della revisione editoriale · consequitur',
    ledger: "Le righe dell'articolo",
    panel: "Stato dell'articolo",
    tab: 'Articolo',
    subject: "L'articolo",
    none: 'Nessun articolo',
    nameKey: 'title',
    statusKey: 'status',
    opening: "L'articolo non ha una sola «Proposta articolo»: {found}",
    nothing: 'Nessuna riga da scrivere adesso.',
    refusals: {
      'unknown-gist': 'Questo tipo di riga non esiste.',
      'writer-not-allowed': 'Chi scrive non può scrivere questa riga.',
      'not-now': 'Questa riga non si può scrivere adesso.',
      'invalid-payload': 'Manca qualcosa di necessario, o qualcosa non va.',
      'unknown-line': "La riga indicata non è nell'articolo.",
      'not-revocable': 'Questa riga non può annullare quella indicata.',
      unreconcilable: "Un articolo comincia con «Proposta articolo», una volta sola.",
      law: "Questa riga lascerebbe l'articolo in uno stato non ammesso.",
      unconfirmed: 'Questa riga ha delle conseguenze: confermale per inviarla.',
    },
  },
  people: [
    { id: 'aconti', name: 'Anna Conti' },
    { id: 'bgalli', name: 'Bruno Galli' },
    { id: 'cneri', name: 'Carla Neri' },
    { id: 'drusso', name: 'Davide Russo' },
  ],
  writers: [
    { writer: 'user::aconti', label: 'Anna Conti · autrice' },
    { writer: 'user::bgalli', label: 'Bruno Galli · revisore' },
    { writer: 'user::cneri', label: 'Carla Neri · revisore' },
    { writer: 'user::drusso', label: 'Davide Russo · direttore' },
    { writer: 'system::clock', label: 'Orologio' },
  ],
  systemName: 'Orologio',
  ui,
  values: {
    title: { label: 'Titolo' },
    status: { label: 'Stato', words: { draft: 'bozza', in_review: 'in revisione', changes_requested: 'modifiche richieste', published: 'pubblicato' } },
    version: { label: 'Versione' },
    approvals: { label: 'Approvazioni', kind: 'list' },
    deadline: { label: 'Scadenza' },
    late: { label: 'In ritardo', words: { true: 'sì' } },
  },
  sets: {
    team: {
      label: 'Redazione',
      joined: '{member} entra nella redazione',
      left: '{member} lascia la redazione',
      should: '{member} dovrebbe far parte della redazione',
      shouldNot: '{member} non dovrebbe farne parte',
    },
    reviewers: {
      label: 'Revisori',
      joined: '{member} è revisore',
      left: '{member} non è più revisore',
      should: '{member} dovrebbe essere revisore',
      shouldNot: '{member} non dovrebbe esserlo',
    },
    editors: {
      label: 'Direttori',
      joined: '{member} è direttore',
      left: '{member} non è più direttore',
      should: '{member} dovrebbe essere direttore',
      shouldNot: '{member} non dovrebbe esserlo',
    },
  },
  laws: {
    'keeps-set': {
      reviewers: 'La revisione resterebbe senza revisori.',
      editors: "L'articolo resterebbe senza direttore.",
    },
    settles: { '': "L'articolo resterebbe in disaccordo con le sue righe." },
  },
  guards: {
    member: 'chi scrive è nella redazione',
    reviewer: 'chi scrive è revisore',
    editor: 'chi scrive è direttore',
    reviewing: "chi scrive è revisore e l'articolo è in revisione",
  },
  goals: {
    most: 1,
    empty: "Nessun traguardo: l'articolo si pubblica a mano",
    outcomes: [{ then: 'publish', label: "pubblica l'articolo", sentence: "→ pubblica l'articolo" }],
  },
  examples: [
    { id: 'published', label: 'Esempio: pubblicato', steps: steps('published') },
    { id: 'late', label: 'Esempio: scadenza passata', steps: steps('late') },
    { id: 'left-alone', label: 'Esempio: un revisore se ne va', steps: steps('left-alone') },
  ],
});
