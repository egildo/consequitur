// The mocked pickers: in the real app a modal asks the directory for a person or
// a document and answers with an id; here a plain `<dialog>` answers from the
// fixed lists. Each one resolves with the answer, or null when it is dismissed.

import { h } from './dom.ts';
import { DOCUMENTS, PEOPLE } from './ui-schema.ts';

type Read<T> = (form: HTMLFormElement, submitter: HTMLElement | null) => T | null;

function ask<T>(title: string, fill: (form: HTMLFormElement) => void, read: Read<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const form = h('form', { method: 'dialog' }, h('p', { class: 'dialog-text' }, title));
    fill(form);
    const box = h('dialog', { class: 'dialog picker' }, form);
    // the answer is given by the submit, not by the dialog's closing, which a page that is not painted delays
    form.addEventListener('submit', (event) => resolve(read(form, (event as SubmitEvent).submitter)));
    // Esc closes the dialog without a submit, which answers null; a second answer changes nothing
    box.addEventListener('close', () => {
      box.remove();
      resolve(null);
    });
    document.body.append(box);
    box.showModal();
  });
}

const cancelButton = (): HTMLButtonElement => h('button', { type: 'submit', value: '', class: 'offer' }, 'Annulla');

/** A user id, or null. */
export function pickPerson(): Promise<string | null> {
  return ask<string>(
    'Scegli una persona',
    (form) => {
      form.append(
        h('div', { class: 'picker-list' }, ...PEOPLE.map(({ id, name }) => h('button', { type: 'submit', value: id, class: 'offer picker-option' }, name))),
        h('div', { class: 'dialog-actions' }, cancelButton()),
      );
    },
    (_form, submitter) => (submitter instanceof HTMLButtonElement && submitter.value !== '' ? submitter.value : null),
  );
}

export interface PickedDocument {
  code: string;
  direction?: 'inbound' | 'outbound';
}

/** A document code, and its direction when `withDirection`, or null. */
export function pickDocument(withDirection: boolean): Promise<PickedDocument | null> {
  const radio = (name: string, value: string, checked: boolean) => {
    const input = h('input', { type: 'radio', name, value });
    input.checked = checked;
    return input;
  };
  return ask<PickedDocument>(
    'Scegli un documento',
    (form) => {
      form.append(
        h(
          'div',
          { class: 'picker-list' },
          ...DOCUMENTS.map(({ code, subject }, index) =>
            h('label', { class: 'picker-doc' }, radio('doc', code, index === 0), h('span', { class: 'card-title' }, code), h('span', { class: 'doc-subject' }, subject)),
          ),
        ),
        ...(withDirection
          ? [
              h(
                'div',
                { class: 'picker-direction' },
                h('label', null, radio('direction', 'inbound', true), ' In entrata'),
                h('label', null, radio('direction', 'outbound', false), ' In uscita'),
              ),
            ]
          : []),
        // the confirming button comes first so that Enter answers with it; the row shows it last
        h('div', { class: 'dialog-actions is-reversed' }, h('button', { type: 'submit', value: 'ok', class: 'offer' }, 'Scegli'), cancelButton()),
      );
    },
    (form, submitter) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'ok') return null;
      const data = new FormData(form);
      const code = data.get('doc');
      if (typeof code !== 'string') return null;
      const direction = data.get('direction');
      return direction === 'inbound' || direction === 'outbound' ? { code, direction } : { code };
    },
  );
}

/** The subject of a new document, or null. */
export function askSubject(): Promise<string | null> {
  return ask<string>(
    'Oggetto del nuovo documento',
    (form) => {
      form.append(
        h('input', { type: 'text', name: 'subject', class: 'draft-input picker-subject', autocomplete: 'off' }),
        // the confirming button comes first so that Enter answers with it; the row shows it last
        h('div', { class: 'dialog-actions is-reversed' }, h('button', { type: 'submit', value: 'ok', class: 'offer' }, 'Crea'), cancelButton()),
      );
    },
    (form, submitter) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'ok') return null;
      const subject = String(new FormData(form).get('subject') ?? '').trim();
      return subject === '' ? null : subject;
    },
  );
}
