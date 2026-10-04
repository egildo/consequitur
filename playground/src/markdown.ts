// A text's markdown as DOM. The card and the composer's anteprima both draw
// through here, so they read alike: `@<user>` and `#<document>` of known people
// and documents become the pills the rest of the page uses.

import MarkdownIt from 'markdown-it';
import { chip } from './dom.ts';
import { DOCUMENTS, documentSubject, PEOPLE, userName } from './ui-schema.ts';

// no raw HTML: a text is a person's, and the card draws what the markdown says
const md = new MarkdownIt({ html: false, breaks: true, linkify: false });

/** A token of a known person (`@lbianchi`) or document (`#34132412`), not part of a longer word. A new regular expression each time: the documents grow. */
const tokens = (): RegExp =>
  new RegExp(`(?<!\\w)(?:@(${PEOPLE.map((p) => p.id).join('|')})|#(${DOCUMENTS.map((d) => d.code).join('|')}))(?!\\w)`, 'g');

/** The people a text mentions, in order and once each, and the first document it names. */
export function tokensOf(text: string): { users: string[]; document?: string } {
  const users: string[] = [];
  let document: string | undefined;
  for (const [, user, code] of text.matchAll(tokens())) {
    if (user !== undefined && !users.includes(user)) users.push(user);
    if (code !== undefined && document === undefined) document = code;
  }
  return { users, ...(document !== undefined ? { document } : {}) };
}

/** Replaces the tokens in the text nodes of `root`, except in code. */
function chipify(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const text of texts) {
    if (text.parentElement?.closest('code, pre')) continue;
    const parts: Array<Node | string> = [];
    let from = 0;
    for (const match of text.data.matchAll(tokens())) {
      const [token, user, code] = match;
      parts.push(text.data.slice(from, match.index));
      parts.push(user !== undefined ? chip(`@${userName(user)}`, 'user') : chip(token, 'document', documentSubject(code)));
      from = match.index + token.length;
    }
    if (parts.length === 0) continue;
    parts.push(text.data.slice(from));
    text.replaceWith(...parts);
  }
}

/** A text's markdown as DOM, with its tokens as pills. */
export function renderMarkdown(text: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = md.render(text);
  chipify(template.content);
  return template.content;
}
