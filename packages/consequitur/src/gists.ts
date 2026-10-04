// The gist schemas an activity starts from. They are held as plain data, the way
// a JSON file would hold them, and pass through the reader like any schema that
// comes from outside; the typed form is only what the reader lets through.

import { readGists } from './schema.ts';

export const BASE_GIST_DATA: unknown = [
  {
    gist: 'create',
    writers: ['user'],
    rules: [
      { rule: 'metadata', key: 'name', from: 'name', required: true },
      { rule: 'metadata', key: 'status', value: 'open' },
      { rule: 'assign', from: 'assignTo', required: true },
    ],
  },
  {
    gist: 'memo',
    writers: ['user', 'goal'],
    rules: [{ rule: 'assign', from: 'assignTo' }],
    when: { metadata: { status: 'open' }, assignee: true },
  },
  {
    gist: 'memo_revoke',
    writers: ['user'],
    rules: [{ rule: 'revoke', from: 'target', gists: ['memo'] }],
    when: { metadata: { status: 'open' }, assignee: true },
  },
  // a note on the thread: it asks nothing of the activity
  { gist: 'comment', writers: ['user'], rules: [], when: { assignee: true } },
  {
    gist: 'got_it',
    writers: ['user'],
    rules: [{ rule: 'metadata', key: 'acknowledged', from: 'about', required: true }],
    when: { metadata: { status: 'open' }, assignee: true, checks: [{ gist: 'memo' }] },
  },
  // One gist for documents coming in and going out; the direction is a free key the
  // `where` of two of the bindings reads, and a line with another one is in `documents` only.
  {
    gist: 'doc_ref',
    writers: ['user'],
    rules: [
      { rule: 'metadata', key: 'documents', collect: 'document', required: true },
      { rule: 'metadata', key: 'documents_in', collect: 'document', where: { direction: 'inbound' } },
      { rule: 'metadata', key: 'documents_out', collect: 'document', where: { direction: 'outbound' } },
    ],
    when: { metadata: { status: 'open' }, assignee: true },
  },
  {
    gist: 'doc_ref_revoke',
    writers: ['user'],
    rules: [{ rule: 'revoke', from: 'target', gists: ['doc_ref'] }],
    when: { metadata: { status: 'open' }, assignee: true },
  },
  { gist: 'set_goal', writers: ['user'], rules: [{ rule: 'goal' }], when: { metadata: { status: 'open' }, assignee: true } },
  {
    gist: 'set_goal_revoke',
    writers: ['user'],
    rules: [{ rule: 'revoke', from: 'target', gists: ['set_goal'] }],
    when: { assignee: true },
  },
  {
    gist: 'stage',
    writers: ['user', 'goal'],
    rules: [{ rule: 'metadata', key: 'stage', from: 'stage', required: true }],
    when: { metadata: { status: 'open' }, assignee: true },
  },
  {
    gist: 'closed',
    writers: ['goal', 'user'],
    rules: [{ rule: 'metadata', key: 'status', value: 'closed' }],
    when: { metadata: { status: 'open' }, assignee: true },
  },
  {
    gist: 'closed_revoke',
    writers: ['user'],
    rules: [{ rule: 'revoke', from: 'target', gists: ['closed'] }],
    when: { assignee: true },
  },
  { gist: 'quit', writers: ['user'], rules: [{ rule: 'release' }], when: { assignee: true } },
  { gist: 'doc_signed', writers: ['system'], rules: [] },
  { gist: 'doc_created', writers: ['system'], rules: [] },
  { gist: 'assigned', writers: ['system'], rules: [] },
  { gist: 'unassigned', writers: ['system'], rules: [] },
  { gist: 'metadata_set', writers: ['system'], rules: [] },
  // the mechanic's warning: a goal has a check that no line in force could satisfy
  { gist: 'goal_warning', writers: ['goal'], rules: [] },
];

export const BASE_GISTS = readGists(BASE_GIST_DATA).gists;
