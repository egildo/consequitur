// Nodes kept by line id. A node is built once and kept with a key of what the reading adds to
// it; it is built again only when that key changes. A new item is inserted at its place and an
// item gone is removed, and a node whose id and key are unchanged is never touched, so focus,
// scroll and hover stay where they are. What changes often and costs nothing to redraw
// (selected, lit) is a class the application sets on `node(id)`, outside the key; a node built
// again starts without it, so the application sets those classes after every `update`.

export interface Keyed<T> {
  /** Brings the root up to the items, in their order. */
  update(items: T[]): void;
  node(id: string): HTMLElement | undefined;
  clear(): void;
}

export function keyed<T>(
  root: HTMLElement,
  spec: {
    id(item: T): string;
    /** What the node shows beyond what never changes; a change rebuilds the node. */
    key(item: T): string;
    build(item: T): HTMLElement;
  },
): Keyed<T> {
  const cache = new Map<string, { key: string; node: HTMLElement }>();

  return {
    update(items) {
      const nodes: HTMLElement[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const id = spec.id(item);
        const key = spec.key(item);
        seen.add(id);
        let entry = cache.get(id);
        if (!entry || entry.key !== key) {
          entry?.node.remove();
          entry = { key, node: spec.build(item) };
          cache.set(id, entry);
        }
        nodes.push(entry.node);
      }
      for (const [id, entry] of cache) {
        if (seen.has(id)) continue;
        entry.node.remove();
        cache.delete(id);
      }
      // a node in its place is left alone; one that arrived, moved or was built again goes before the next that stays
      let cursor = root.firstChild;
      for (const node of nodes) {
        if (node === cursor) cursor = cursor.nextSibling;
        else root.insertBefore(node, cursor);
      }
    },

    node: (id) => cache.get(id)?.node,

    clear() {
      cache.clear();
      root.replaceChildren();
    },
  };
}
