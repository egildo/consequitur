// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { keyed } from '../src/index.ts';

interface Item {
  id: string;
  label: string;
}

describe('keyed', () => {
  let root: HTMLElement;
  let built: string[];
  let list: ReturnType<typeof keyed<Item>>;
  const item = (id: string, label = id): Item => ({ id, label });
  const ids = () => [...root.children].map((c) => (c as HTMLElement).dataset.id);

  beforeEach(() => {
    root = document.createElement('div');
    document.body.replaceChildren(root);
    built = [];
    list = keyed<Item>(root, {
      id: (i) => i.id,
      key: (i) => i.label,
      build: (i) => {
        built.push(i.id);
        const node = document.createElement('div');
        node.dataset.id = i.id;
        node.textContent = i.label;
        return node;
      },
    });
  });

  it('builds each node once, in the order of the items', () => {
    list.update([item('a'), item('b'), item('c')]);
    expect(ids()).toEqual(['a', 'b', 'c']);
    list.update([item('a'), item('b'), item('c')]);
    expect(built).toEqual(['a', 'b', 'c']);
  });

  it('never touches a node whose key is unchanged: the same node, its classes and focus stay', () => {
    list.update([item('a'), item('b')]);
    const b = list.node('b')!;
    b.tabIndex = 0;
    b.focus();
    b.classList.add('is-selected');
    list.update([item('a'), item('b'), item('c')]);
    expect(list.node('b')).toBe(b);
    expect(b.classList.contains('is-selected')).toBe(true);
    expect(document.activeElement).toBe(b);
  });

  it('does not move the nodes that are in their place when one arrives', () => {
    list.update([item('a'), item('c')]);
    const moves: string[] = [];
    new MutationObserver((records) => records.forEach((r) => moves.push(...[...r.addedNodes, ...r.removedNodes].map((n) => (n as HTMLElement).dataset.id!)))).observe(root, { childList: true });
    list.update([item('a'), item('b'), item('c')]);
    return Promise.resolve().then(() => {
      expect(ids()).toEqual(['a', 'b', 'c']);
      expect(moves).toEqual(['b']);
    });
  });

  it('builds a node again only when its key changes, at its place', () => {
    list.update([item('a'), item('b'), item('c')]);
    const old = list.node('b')!;
    old.classList.add('is-lit');
    list.update([item('a'), item('b', 'B'), item('c')]);
    expect(built).toEqual(['a', 'b', 'c', 'b']);
    expect(list.node('b')).not.toBe(old);
    expect(old.isConnected).toBe(false);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(list.node('b')!.textContent).toBe('B');
    expect(list.node('b')!.classList.contains('is-lit')).toBe(false);
  });

  it('removes an item that is gone and forgets its node', () => {
    list.update([item('a'), item('b'), item('c')]);
    const b = list.node('b')!;
    list.update([item('a'), item('c')]);
    expect(ids()).toEqual(['a', 'c']);
    expect(b.isConnected).toBe(false);
    expect(list.node('b')).toBeUndefined();
    list.update([item('a'), item('b'), item('c')]);
    expect(built.filter((id) => id === 'b')).toHaveLength(2);
  });

  it('follows a new order of the same nodes without building any', () => {
    list.update([item('a'), item('b'), item('c')]);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => list.node(id)!);
    list.update([item('c'), item('a'), item('b')]);
    expect(ids()).toEqual(['c', 'a', 'b']);
    list.update([item('b'), item('c'), item('a')]);
    expect(ids()).toEqual(['b', 'c', 'a']);
    expect([list.node('a'), list.node('b'), list.node('c')]).toEqual([a, b, c]);
    expect(built).toEqual(['a', 'b', 'c']);
  });

  it('inserts at the start and empties to nothing', () => {
    list.update([item('b')]);
    list.update([item('a'), item('b')]);
    expect(ids()).toEqual(['a', 'b']);
    list.update([]);
    expect(root.children).toHaveLength(0);
  });

  it('clear forgets every node, so the next update builds them all', () => {
    list.update([item('a'), item('b')]);
    list.clear();
    expect(root.children).toHaveLength(0);
    expect(list.node('a')).toBeUndefined();
    list.update([item('a'), item('b')]);
    expect(built).toEqual(['a', 'b', 'a', 'b']);
  });
});
