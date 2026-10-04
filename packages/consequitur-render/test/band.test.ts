// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { band, type Band } from '../src/index.ts';

const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
  new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, ...init });

describe('band', () => {
  let layer: HTMLElement;
  let slot: HTMLElement;
  let cards: Record<string, HTMLElement>;
  let b: Band;
  // what elementFromPoint answers: the card by x position, 100 wide each, nothing past them
  const under = (x: number): Element | null => (x < 100 ? cards.a : x < 200 ? cards.b : x < 300 ? cards.c.firstElementChild : null);
  const svg = () => layer.querySelector('svg')!;
  const targets: Array<string | null> = [];
  const spec = (candidates: string[]) => ({ candidates, onTarget: (id: string | null) => targets.push(id) });

  beforeEach(() => {
    document.body.innerHTML = `<div id="layer"><button id="slot"></button>
      <div data-line-id="a"></div><div data-line-id="b"></div><div data-line-id="c"><span></span></div></div>`;
    layer = document.getElementById('layer')!;
    slot = document.getElementById('slot')!;
    cards = Object.fromEntries([...layer.querySelectorAll<HTMLElement>('[data-line-id]')].map((c) => [c.dataset.lineId!, c]));
    document.elementFromPoint = (x: number) => under(x);
    targets.length = 0;
    b = band(layer);
  });
  afterEach(() => b.dispose());

  it('puts one hidden, pointer-transparent svg in the layer, with a path and two dots', () => {
    expect(layer.querySelectorAll('svg')).toHaveLength(1);
    expect(svg().hasAttribute('hidden')).toBe(true);
    expect(svg().hasAttribute('data-mode')).toBe(false);
    expect(svg().style.pointerEvents).toBe('none');
    expect(svg().querySelectorAll('path')).toHaveLength(1);
    expect(svg().querySelectorAll('circle')).toHaveLength(2);
  });

  describe('dragging', () => {
    it('is false at rest and during a hover, true from the start of a drag to its end', async () => {
      expect(b.dragging).toBe(false);
      b.point(slot, cards.b);
      expect(b.dragging).toBe(false);
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      expect(b.dragging).toBe(true);
      window.dispatchEvent(pointer('pointermove', 20, 10));
      expect(b.dragging).toBe(true);
      window.dispatchEvent(pointer('pointerup', 20, 10));
      expect(b.dragging).toBe(false);
      await done;
      expect(b.dragging).toBe(false);
    });

    it('is false again after Esc and after a pointercancel, and a refused drag never raises it', async () => {
      const first = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      expect(b.dragging).toBe(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(b.dragging).toBe(false);
      await first;
      const second = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      window.dispatchEvent(pointer('pointercancel', 10, 10));
      expect(b.dragging).toBe(false);
      await second;
      await b.drag(slot, pointer('pointerdown', 10, 10, { button: 2 }), spec(['a']));
      expect(b.dragging).toBe(false);
    });

    it('stays true while a drag is going and a second one is refused', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      expect(await b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']))).toBeNull();
      expect(b.dragging).toBe(true);
      window.dispatchEvent(pointer('pointerup', 20, 10));
      await done;
    });
  });

  describe('drag', () => {
    it('draws to the pointer on each move, in drag mode, and reports the candidate under it', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a', 'c']));
      expect(svg().getAttribute('data-mode')).toBe('drag');
      expect(svg().hasAttribute('hidden')).toBe(false);
      window.dispatchEvent(pointer('pointermove', 50, 40));
      expect(svg().querySelector('.band-end')!.getAttribute('cx')).toBe('50');
      expect(svg().querySelector('.band-end')!.getAttribute('cy')).toBe('40');
      expect(svg().querySelector('path')!.getAttribute('d')).toMatch(/^M .* C .* \d+$/);
      window.dispatchEvent(pointer('pointermove', 60, 40));
      window.dispatchEvent(pointer('pointermove', 150, 40));
      window.dispatchEvent(pointer('pointermove', 250, 40));
      window.dispatchEvent(pointer('pointermove', 350, 40));
      // `a` once, `b` is no candidate, `c` is found through its child, and past the cards none
      expect(targets).toEqual(['a', null, 'c', null]);
      window.dispatchEvent(pointer('pointerup', 350, 40));
      expect(await done).toBeNull();
    });

    it('resolves with the line dropped on, and clears the band', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a', 'b']));
      window.dispatchEvent(pointer('pointermove', 150, 10));
      window.dispatchEvent(pointer('pointerup', 150, 10));
      expect(await done).toBe('b');
      expect(svg().hasAttribute('hidden')).toBe(true);
      expect(svg().hasAttribute('data-mode')).toBe(false);
      expect(targets).toEqual(['b', null]);
    });

    it('drops on what is under the pointer at the pointerup even with no move before', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      window.dispatchEvent(pointer('pointerup', 20, 10));
      expect(await done).toBe('a');
    });

    it('resolves null over a line that is not a candidate', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      window.dispatchEvent(pointer('pointerup', 150, 10));
      expect(await done).toBeNull();
    });

    it('is cancelled by Esc, which nothing else sees, and stops listening', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      const seen = vi.fn();
      document.addEventListener('keydown', seen);
      window.dispatchEvent(pointer('pointermove', 20, 10));
      const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      window.dispatchEvent(other);
      expect(svg().getAttribute('data-mode')).toBe('drag');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(esc);
      expect(await done).toBeNull();
      expect(esc.defaultPrevented).toBe(true);
      expect(svg().hasAttribute('hidden')).toBe(true);
      // after the end a pointerup means nothing
      targets.length = 0;
      window.dispatchEvent(pointer('pointermove', 20, 10));
      expect(targets).toEqual([]);
      document.removeEventListener('keydown', seen);
    });

    it('is cancelled by a pointercancel', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      window.dispatchEvent(pointer('pointercancel', 10, 10));
      expect(await done).toBeNull();
    });

    it('reads a line with the `lineOf` it is given', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), { candidates: ['x'], lineOf: () => 'x', onTarget: (id) => targets.push(id) });
      window.dispatchEvent(pointer('pointerup', 150, 10));
      expect(await done).toBe('x');
    });

    it('refuses a second drag while one is going, and a button other than the first', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      expect(await b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']))).toBeNull();
      expect(svg().getAttribute('data-mode')).toBe('drag');
      window.dispatchEvent(pointer('pointerup', 20, 10));
      expect(await done).toBe('a');
      expect(await b.drag(slot, pointer('pointerdown', 10, 10, { button: 2 }), spec(['a']))).toBeNull();
      expect(svg().hasAttribute('hidden')).toBe(true);
    });

    it('ends when its start left the page', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      slot.remove();
      window.dispatchEvent(pointer('pointermove', 20, 10));
      expect(svg().hasAttribute('hidden')).toBe(true);
      window.dispatchEvent(pointer('pointerup', 20, 10));
      expect(await done).toBe('a');
    });
  });

  describe('point', () => {
    it('draws between two elements in hover mode and clears with null', () => {
      b.point(slot, cards.b);
      expect(svg().getAttribute('data-mode')).toBe('hover');
      expect(svg().hasAttribute('hidden')).toBe(false);
      expect(svg().querySelector('path')!.getAttribute('d')).toMatch(/^M /);
      b.point(null, null);
      expect(svg().hasAttribute('hidden')).toBe(true);
      expect(svg().hasAttribute('data-mode')).toBe(false);
      b.point(slot, cards.b);
      b.point(slot, null);
      expect(svg().hasAttribute('hidden')).toBe(true);
    });

    it('meets a line node at the edge that faces the other end', () => {
      const rects = new Map<Element, Partial<DOMRect>>([
        [slot, { left: 0, top: 100, width: 10, height: 10 }],
        [cards.a, { left: 0, top: 200, width: 100, height: 50, bottom: 250 }],
        [cards.b, { left: 0, top: 0, width: 100, height: 50, bottom: 50 }],
      ]);
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        return { left: 0, top: 0, width: 0, height: 0, bottom: 0, ...rects.get(this) } as DOMRect;
      };
      try {
        b.point(slot, cards.a);
        // the slot's centre, and the top edge of the card below it
        expect(svg().querySelector('.band-start')!.getAttribute('cx')).toBe('5');
        expect(svg().querySelector('.band-start')!.getAttribute('cy')).toBe('105');
        expect(svg().querySelector('.band-end')!.getAttribute('cy')).toBe('200');
        b.point(slot, cards.b);
        // the card above it is met at its bottom
        expect(svg().querySelector('.band-end')!.getAttribute('cy')).toBe('50');
      } finally {
        Element.prototype.getBoundingClientRect = original;
      }
    });

    it('is left alone by a hover while a drag holds the band, and free again after', async () => {
      const done = b.drag(slot, pointer('pointerdown', 10, 10), spec(['a']));
      b.point(slot, cards.b);
      b.point(null, null);
      expect(svg().getAttribute('data-mode')).toBe('drag');
      window.dispatchEvent(pointer('pointerup', 20, 10));
      await done;
      b.point(slot, cards.b);
      expect(svg().getAttribute('data-mode')).toBe('hover');
    });

    it('ends when an element left the page, on the next draw', () => {
      b.point(slot, cards.b);
      cards.b.remove();
      b.redraw();
      expect(svg().hasAttribute('hidden')).toBe(true);
    });
  });

  it('dispose removes the svg', () => {
    b.dispose();
    expect(layer.querySelector('svg')).toBeNull();
  });
});
