"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * VYRON — Enterprise Scroll Container.
 *
 * THE SINGLE SCROLL CONTAINER FOR EVERY ENTERPRISE DATA GRID.
 *
 * WHY THIS EXISTS
 * ---------------
 * The application had ~110 hand-written `overflow-x-auto` wrappers, none of
 * which constrained height. A scroll container with no height grows to the full
 * height of its table, so its horizontal scrollbar is painted at the bottom of
 * the *table* rather than the bottom of the *viewport*. Measured against the
 * real shell chain, the legacy pattern put the scrollbar up to **6,343px below
 * the fold** — the user had to scroll the entire page down before horizontal
 * scrolling became possible, by which point the column headers were long gone.
 *
 * THREE MODES
 * -----------
 * `fill`   Pure CSS. Zero runtime cost. For grids inside a page that is already
 *          a full-height flex column: the layout algorithm computes the
 *          remaining space, so nothing needs measuring. **Use this whenever the
 *          page can be a full-height workspace.**
 *
 * `auto`   Measured. For grids in normal content-flow pages, where the page
 *          scrolls and the amount of chrome above the grid is not knowable at
 *          author time.
 *
 * `page`   Unconstrained vertically: the grid renders at its natural height and
 *          the SHELL scrolls, so there is no second vertical scrollbar to get
 *          trapped in. For transaction registers and invoice line tables, where
 *          the whole point is to see many rows at once and `auto` gives the grid
 *          only whatever the page chrome leaves over — on a register with a hero
 *          banner, KPI tiles and a filter bar that was as little as ~220px, or
 *          three visible rows. Horizontal overflow is still contained so a wide
 *          table cannot force the shell sideways.
 *
 *          The trade-off is deliberate: a sticky column header needs the grid to
 *          BE the vertical scrollport, which is precisely what this mode gives
 *          up. Use it where seeing more rows beats pinning the header, and keep
 *          `auto`/`fill` where the header matters more than row count.
 *
 * WHY `auto` CANNOT BE PURE CSS
 * -----------------------------
 * CSS has no function returning "the distance from this element's top edge to
 * the bottom of the viewport". `calc()` cannot reference layout positions, and
 * container queries report a container's *size*, not its *position*. The only
 * pure-CSS route is to make the whole ancestor chain full-height flex — which
 * is exactly `fill` mode, and which changes a content-flow page into a
 * non-scrolling one.
 *
 * A fixed offset was measured and rejected. Across three viewports and three
 * realistic page-chrome heights:
 *
 *   calc(100dvh - 12rem)  →  scrollbar up to 416px below the fold
 *   calc(100dvh - 18rem)  →  scrollbar up to 320px below the fold
 *   calc(100dvh - 30rem)  →  scrollbar up to 128px below the fold, ~194px wasted
 *   measured              →  0px below the fold, ~24px wasted
 *
 * No single offset is correct, because the chrome above a grid ranges from a
 * bare filter bar to a 420px KPI hero. An offset safe for the tallest page
 * wastes roughly a fifth of the viewport on the shortest one.
 *
 * RUNTIME COST
 * ------------
 * ONE ResizeObserver and ONE resize listener exist per document, not per grid,
 * regardless of how many grids are mounted. Each container contributes a single
 * Set entry and two getBoundingClientRect() reads per layout change. Reads are
 * batched in a single rAF so N grids cause one layout pass, not N.
 */

export const ENTERPRISE_GRID_CLASS = "vyron-enterprise-grid";

type Subscriber = () => void;

/**
 * Document-level measurement scheduler.
 *
 * Every `auto` container subscribes here instead of creating its own observer.
 * The observer and listener are created on the first subscription and torn down
 * when the last container unmounts, so a page with no grids pays nothing.
 */
const subscribers = new Set<Subscriber>();
let observer: ResizeObserver | null = null;
let frame = 0;

function flush() {
  frame = 0;
  for (const run of subscribers) run();
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(flush);
}

function subscribe(run: Subscriber): () => void {
  subscribers.add(run);

  if (!observer && typeof window !== "undefined") {
    observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("resize", schedule);
  }

  return () => {
    subscribers.delete(run);
    if (subscribers.size === 0 && observer) {
      observer.disconnect();
      observer = null;
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

type Props = {
  children: ReactNode;
  /** `fill` is pure CSS and free — prefer it where the page is full-height. */
  mode?: "auto" | "fill" | "page";
  /** Space left below the grid in `auto` mode, in px. */
  gutter?: number;
  /** Floor so the grid never collapses on short viewports, in px. */
  minHeight?: number;
  /** Extra classes for borders, radius, background — presentation only. */
  className?: string;
};

function findScroller(el: HTMLElement): HTMLElement {
  return (
    el.closest<HTMLElement>(".vyron-cost-shell-main") ||
    (document.scrollingElement as HTMLElement) ||
    document.documentElement
  );
}

export default function EnterpriseScrollContainer({
  children,
  mode = "auto",
  gutter = 24,
  minHeight = 220,
  className = "",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const scroller = findScroller(el);
    const elRect = el.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();

    // Offset from the top of the scroller's CONTENT, which is stable regardless
    // of scroll position. Using viewport-relative top would shrink the grid as
    // the user scrolls.
    const offsetWithinScroller = elRect.top - scrollerRect.top + scroller.scrollTop;
    const available = scroller.clientHeight - offsetWithinScroller - gutter;
    const next = Math.max(minHeight, Math.round(available));

    setMaxHeight((current) => (current === next ? current : next));
  }, [gutter, minHeight]);

  useLayoutEffect(() => {
    if (mode !== "auto") return;
    measure();
  }, [measure, mode]);

  useEffect(() => {
    if (mode !== "auto") return;
    return subscribe(measure);
  }, [measure, mode]);

  if (mode === "page") {
    /*
     * No height constraint at all, so the shell scroller stays the only vertical
     * scrollbar on the page. `overflow-x-auto` still contains a wide table, and
     * because the element's height is auto its vertical scrollport never has
     * anything to scroll — the computed `overflow-y: auto` that the spec forces
     * alongside `overflow-x: auto` stays inert.
     */
    return (
      <div ref={ref} className={`${ENTERPRISE_GRID_CLASS} w-full overflow-x-auto ${className}`}>
        {children}
      </div>
    );
  }

  if (mode === "fill") {
    // Pure CSS. No measurement, no observer, no listener.
    return (
      <div
        ref={ref}
        className={`${ENTERPRISE_GRID_CLASS} min-h-0 flex-1 basis-0 overflow-auto overscroll-contain ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      /*
       * The CSS max-height is the pre-hydration fallback only — measurement runs
       * in useLayoutEffect, before paint, so this value is never what the user
       * sees in a hydrated page. It is deliberately conservative: a value that
       * is too generous would flash an unconstrained grid in the server-rendered
       * HTML, which is the defect this component exists to remove.
       */
      className={`${ENTERPRISE_GRID_CLASS} max-h-[calc(100dvh-24rem)] overflow-auto overscroll-contain ${className}`}
      style={maxHeight != null ? { maxHeight: `${maxHeight}px` } : undefined}
    >
      {children}
    </div>
  );
}
