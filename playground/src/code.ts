// JSON as code: pretty-printed, one line to a row, with light colouring written by
// hand. The line numbers are drawn by the stylesheet (a counter), so a selection
// copies the text and nothing else.

import { h } from './dom.ts';

/** A string (a key when a colon follows), a keyword, or a number. */
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?/g;

/** One line of JSON as text and coloured spans. */
function lineOf(text: string): HTMLElement {
  const parts: Array<Node | string> = [];
  let from = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [token, quoted, colon] = match;
    parts.push(text.slice(from, match.index));
    if (quoted !== undefined) {
      parts.push(h('span', { class: colon ? 'tok-key' : 'tok-str' }, quoted), colon ?? '');
    } else {
      parts.push(h('span', { class: /^[tfn]/.test(token) ? 'tok-word' : 'tok-num' }, token));
    }
    from = match.index + token.length;
  }
  parts.push(text.slice(from), '\n');
  return h('span', { class: 'code-line' }, ...parts);
}

/** A value as pretty JSON code, or text that is already pretty JSON. */
export function codeView(value: unknown, label: string): HTMLElement {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return h('pre', { class: 'code', tabindex: '0', 'aria-label': label }, h('code', null, ...text.split('\n').map(lineOf)));
}
