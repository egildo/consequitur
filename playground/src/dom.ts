// The two smallest drawing helpers of the page, shared by every module that builds DOM.

type Child = Node | string | null | undefined | false;

/** A DOM element in one expression. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) element.setAttribute(name, value);
  for (const child of children) if (child) element.append(child);
  return element;
}

/** A user or a document as a pill that points nowhere. */
export const chip = (label: string, kind: 'user' | 'document', title?: string): HTMLElement =>
  h('span', { class: `chip chip-${kind}`, ...(title ? { title } : {}) }, label);
