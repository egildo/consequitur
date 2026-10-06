// The two domains of the page, as data: each reads its case, names only gists its case has, has words
// for every line its examples write, and plays its examples to the end through the engine and the
// shared resolver, the way the page and the engine's tests do.

import { emptyState, nodes, playScenario, post, type EventLine, type LineDraft, type Refusal, type ThreadState } from 'consequitur';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineDomain, useDomain, type Domain } from '../src/domain.ts';
import { DOMAINS } from '../src/domains/index.ts';
import { conditionSentence, lineLabel, nodeSentence, outcomeSentence, recordSentence, sayOf, uiOf, unread, warningSentence, writerName } from '../src/ui-schema.ts';

const NOW = '2026-10-04T10:00:00.000Z';

/** Plays an example on an empty thread of the domain, as the page does, and gives back the thread and what was refused. */
async function played(domain: Domain, id: string) {
  const example = domain.examples.find((e) => e.id === id)!;
  let state: ThreadState = emptyState(domain.schema);
  const out = await playScenario(example.steps, {
    lines: () => state.lines,
    async send(draft: LineDraft, confirmed: boolean): Promise<Refusal | undefined> {
      const result = await post(state, draft, domain.schema, NOW, { confirmed, policy: domain.policy });
      if (result.refusal) return result.refusal;
      domain.documents?.learn(result.state.lines);
      state = result.state;
      return undefined;
    },
  });
  return { state, out };
}

describe('the domains', () => {
  it('are the SIBAR activity and the editorial review, each with an id and words of its own', () => {
    expect(DOMAINS.map((d) => d.label)).toEqual(['Attività (SIBAR)', 'Revisione editoriale']);
    expect(new Set(DOMAINS.map((d) => d.id)).size).toBe(DOMAINS.length);
    expect(new Set(DOMAINS.map((d) => d.words.title)).size).toBe(DOMAINS.length);
  });

  it('read a case\'s policy against its schema, and refuse one with a problem', () => {
    const sibar = DOMAINS.find((d) => d.id === 'sibar')!;
    expect(sibar.policy).toEqual([{ leave: { kind: 'set', key: 'assignees' }, while: { values: { status: 'closed' } } }]);
    expect(DOMAINS.find((d) => d.id === 'editorial')!.policy).toBeUndefined();
    // a mistyped word would have left quits answered on a closed activity
    const typo = '[{ "leave": { "kind": "set", "key": "assignees" }, "whlie": { "values": { "status": "closed" } } }]';
    expect(() => defineDomain({ ...sibar, policyFile: typo })).toThrow(/policy of the case "sibar"/);
  });

  for (const domain of DOMAINS) {
    describe(domain.label, () => {
      // the page's words are read from the domain in use: the one under test
      beforeEach(() => useDomain(domain));
      const gists = domain.schema.gists.map((g) => g.gist);

      it('has a UI entry for every gist of its case, and no other', () => {
        expect(domain.ui.map((ui) => ui.gist).sort()).toEqual([...gists].sort());
      });

      it('names only gists its case has, in what a line refers to, awaits and does', () => {
        for (const ui of domain.ui) {
          for (const gist of ui.compose?.refer?.gists ?? []) expect(gists, `${ui.gist} refers to`).toContain(gist);
          for (const awaited of ui.awaited ?? []) expect(gists, `${ui.gist} awaits on`).toContain(awaited.on);
          if (ui.compose?.pick) expect(ui.card).not.toBe('record');
        }
        for (const outcome of domain.goals?.outcomes ?? []) {
          expect(gists, 'a goal does').toContain(outcome.then);
          expect(domain.schema.gists.find((g) => g.gist === outcome.then)?.writers, `${outcome.then} is written by goals`).toContain('goal');
        }
        for (const command of domain.commands ?? []) if (command.inBar) expect(gists).toContain(command.inBar.after);
      });

      it('knows the gist of its goals and of the one that revokes them, when it has goals', () => {
        expect(domain.goalGist).toBe('set_goal');
        expect(domain.goalRevoke).toBe('set_goal_revoke');
        expect(domain.goalLines).toEqual(new Set(['set_goal', 'set_goal_revoke', 'goal_warning']));
        expect(domain.goals).toBeDefined();
      });

      it('has words for every guard of its case, and says every gist\'s `when` with no {placeholder} left', () => {
        expect(Object.keys(domain.guards).sort()).toEqual(Object.keys(domain.schema.guards).sort());
        for (const gist of domain.schema.gists) {
          if (gist.when === undefined) continue;
          const words = conditionSentence(gist.when, []);
          expect(words, gist.gist).not.toMatch(/[{}]/);
          expect(words, gist.gist).not.toBe('');
        }
        expect(() => defineDomain({ ...domain, guards: { ...domain.guards, nobody: 'nessuno' } })).toThrow(/guards/);
      });

      it('has the people its examples write as, and a name for the system', () => {
        for (const { writer } of domain.writers) {
          const [kin, id] = writer.split('::');
          if (kin === 'user') expect(domain.people.map((p) => p.id), writer).toContain(id);
        }
        expect(writerName(domain.schema.authority)).toBe(domain.systemName);
        expect(domain.writers[0].writer.startsWith('user::')).toBe(true);
      });

      for (const example of domain.examples) {
        it(`plays the example «${example.label}» to the end, with words for every line`, async () => {
          const { state, out } = await played(domain, example.id);
          expect(out.failed, out.failed?.why).toBeUndefined();
          expect(state.lines.length).toBeGreaterThan(example.steps.length);
          // a sentence the page says of a line never leaves a {placeholder} behind, nor names no one
          const words: string[] = [];
          for (const line of state.lines) {
            const ui = uiOf(line.gist);
            expect(ui, `${line.gist} has a UI entry`).toBeDefined();
            words.push(lineLabel(line), writerName(line.writer));
            if (ui?.card === 'mark') words.push(sayOf(ui, line));
            if (ui?.card === 'record') words.push(recordSentence(line, state.lines));
            if (line.gist === domain.schema.records.warning) words.push(warningSentence(line, state.lines));
            if (ui?.card === 'goal') {
              const trace = unread(line.payload.when);
              expect(trace.condition, `${line.gist} holds a condition the page reads`).not.toEqual({ all: [] });
              words.push(...nodes(trace).map(({ node }) => nodeSentence(node.condition, state.lines)), outcomeSentence(String(line.payload.then), line.payload.with as EventLine['payload']));
            }
          }
          expect(words.filter((w) => /[{}]/.test(w) || w === '')).toEqual([]);
        });
      }
    });
  }

  it('end the editorial review\'s last example on the refusal the law gives', async () => {
    const editorial = DOMAINS[1];
    useDomain(editorial);
    const { out } = await played(editorial, 'left-alone');
    expect(out.refused).toHaveLength(1);
    expect(out.refused[0].refusal.code).toBe('law');
    for (const example of ['published', 'late']) expect((await played(editorial, example)).out.refused).toEqual([]);
  });

  it('have the editorial review run with no policy and no document', () => {
    expect(DOMAINS[1].policy).toBeUndefined();
    expect(DOMAINS[1].documents).toBeUndefined();
    expect(DOMAINS[0].policy).toHaveLength(1);
  });
});
