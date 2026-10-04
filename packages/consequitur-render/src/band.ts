// The elastic band: a curve drawn over the scroll area from one end to another. A drag from a
// slot draws it to the pointer and ends on a line; hovering draws it from one element to
// another. The band is only a drawing, never the target of a pointer (`pointer-events: none`),
// and it sets classes and `data-mode`, never colours: the application's CSS paints it.

export interface Band {
  /** Whether a drag holds the band, from its start to its end. */
  readonly dragging: boolean;
  /** Starts a drag from `from`; resolves with the line id dropped on, or null. */
  drag(
    from: HTMLElement,
    event: PointerEvent,
    spec: {
      candidates: string[];
      /** The line an element stands for; default: the `data-line-id` of its closest ancestor. */
      lineOf?(element: Element): string | null;
      /** The candidate under the pointer, or null. */
      onTarget(id: string | null): void;
    },
  ): Promise<string | null>;
  /** Draws the line from one element to another (hover), or clears it. A drag owns the band: a hover leaves it alone. */
  point(from: HTMLElement | null, to: HTMLElement | null): void;
  /** Draws again where the ends are now: the layer scrolled or an element moved. */
  redraw(): void;
  /** Removes the drawing and the window listener. */
  dispose(): void;
}

type Point = { x: number; y: number };
type Anchor = Element | Point;
type Mode = 'drag' | 'hover';

const SVG = 'http://www.w3.org/2000/svg';

function svgOf<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

const centre = (anchor: Anchor): Point => {
  if (!(anchor instanceof Element)) return anchor;
  const r = anchor.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** A line's node is met at the edge that faces the other end; any other element at its centre. */
function pointOf(anchor: Anchor, toward: Anchor): Point {
  if (!(anchor instanceof Element) || !anchor.matches('[data-line-id]')) return centre(anchor);
  const r = anchor.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: centre(toward).y < r.top + r.height / 2 ? r.top : r.bottom };
}

const lineOfDefault = (element: Element): string | null => element.closest<HTMLElement>('[data-line-id]')?.dataset.lineId ?? null;

/**
 * The layer is an element over the scroll area. The band appends one `<svg>` to it that covers
 * it (so the layer must be positioned), with a path and two dots; `data-mode` on it is `drag` or
 * `hover`, and it is `hidden` when idle. Listeners are on `window`, in the capture phase, so the
 * drag follows the pointer wherever it goes and needs no pointer capture, which a synthetic
 * event cannot take.
 */
export function band(layer: HTMLElement): Band {
  const svg = svgOf('svg', { class: 'band', 'aria-hidden': 'true', hidden: '' });
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const path = svgOf('path', { class: 'band-path' });
  const start = svgOf('circle', { class: 'band-dot band-start', r: '4.5' });
  const end = svgOf('circle', { class: 'band-dot band-end', r: '4.5' });
  svg.append(path, start, end);
  layer.append(svg);

  let from: Anchor | undefined;
  let to: Anchor | undefined;
  let mode: Mode | undefined;
  let dragging = false;

  function draw(): void {
    if (!from || !to) return;
    // an end that left the page (its node was built again) ends the band
    if ((from instanceof Element && !from.isConnected) || (to instanceof Element && !to.isConnected)) return clear();
    const origin = svg.getBoundingClientRect();
    const a = pointOf(from, to);
    const b = pointOf(to, from);
    const ax = a.x - origin.left;
    const ay = a.y - origin.top;
    const bx = b.x - origin.left;
    const by = b.y - origin.top;
    const middle = (ay + by) / 2;
    path.setAttribute('d', `M ${ax} ${ay} C ${ax} ${middle}, ${bx} ${middle}, ${bx} ${by}`);
    start.setAttribute('cx', String(ax));
    start.setAttribute('cy', String(ay));
    end.setAttribute('cx', String(bx));
    end.setAttribute('cy', String(by));
  }

  function clear(): void {
    from = to = mode = undefined;
    svg.toggleAttribute('hidden', true);
    svg.removeAttribute('data-mode');
  }

  function show(a: Anchor, b: Anchor, as: Mode): void {
    from = a;
    to = b;
    mode = as;
    svg.removeAttribute('hidden');
    svg.setAttribute('data-mode', as);
    draw();
  }

  window.addEventListener('resize', draw);

  return {
    get dragging() {
      return dragging;
    },

    drag(handle, event, spec) {
      if (mode === 'drag' || event.button !== 0) return Promise.resolve(null);
      event.preventDefault();
      const lineOf = spec.lineOf ?? lineOfDefault;
      const lineUnder = (e: PointerEvent): string | null => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const id = element ? lineOf(element) : null;
        return id !== null && spec.candidates.includes(id) ? id : null;
      };

      let over: string | null = null;
      dragging = true;
      show(handle, { x: event.clientX, y: event.clientY }, 'drag');

      return new Promise((resolve) => {
        const finish = (picked: string | null): void => {
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', up, true);
          window.removeEventListener('pointercancel', cancel, true);
          window.removeEventListener('keydown', escape, true);
          dragging = false;
          clear();
          if (over !== null) spec.onTarget(null);
          resolve(picked);
        };
        const move = (e: PointerEvent): void => {
          to = { x: e.clientX, y: e.clientY };
          draw();
          const now = lineUnder(e);
          if (now === over) return;
          over = now;
          spec.onTarget(over);
        };
        const up = (e: PointerEvent): void => finish(lineUnder(e));
        const cancel = (): void => finish(null);
        const escape = (e: KeyboardEvent): void => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', cancel, true);
        window.addEventListener('keydown', escape, true);
      });
    },

    point(a, b) {
      if (mode === 'drag') return;
      if (a === null || b === null) return clear();
      show(a, b, 'hover');
    },

    redraw: draw,

    dispose() {
      window.removeEventListener('resize', draw);
      svg.remove();
    },
  };
}
