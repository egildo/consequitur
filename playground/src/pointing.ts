// The band of the page: one `band` from consequitur-render over the ledger's column, and the two
// ways the page uses it: pointing from an element to the card of a line (a hover), and dragging
// from a reference slot's handle to a line.

import { band as makeBand, type Band } from 'consequitur-render';
import type { LineId } from 'consequitur';
import type { Linking } from './state.ts';

let band: Band | undefined;
let dragging = false;

/** Puts the band over `layer`, which must be positioned. */
export function mountBand(layer: HTMLElement): void {
  band = makeBand(layer);
}

/** Whether a drag holds the band. */
export const isDragging = (): boolean => dragging;

/** Draws the band from one element to another, or clears it. */
export const point = (from: HTMLElement | null, to: HTMLElement | null): void => band?.point(from, to);

/** Draws the band again where its ends are now. */
export const redraw = (): void => band?.redraw();

/**
 * A drag from a reference slot's handle: it lights the candidates (`link` tells the page which, and
 * which one the pointer is on), and ends on release: over a candidate `pick` is called with its id,
 * anywhere else, or on Esc, nothing is picked.
 */
export async function dragLink(handle: HTMLElement, event: PointerEvent, candidates: LineId[], link: (linking: Linking | null) => void, pick: (id: LineId) => void): Promise<void> {
  if (!band || dragging || event.button !== 0) return;
  dragging = true;
  document.body.classList.add('is-linking');
  link({ candidates, target: null });
  let picked: LineId | null = null;
  try {
    picked = await band.drag(handle, event, { candidates, onTarget: (target) => link({ candidates, target }) });
  } finally {
    dragging = false;
    document.body.classList.remove('is-linking');
    link(null);
  }
  if (picked !== null) pick(picked);
}
