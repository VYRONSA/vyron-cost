"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchCustomers, visibleWindow, type SearchableCustomer } from "@/lib/vyron-customer-pricing-view";

export type PickerCustomer = SearchableCustomer & { id: string; active?: boolean | null; status?: string | null };

const ROW_HEIGHT = 56;
const PANEL_MAX_LIST_HEIGHT = 440;
const PANEL_CHROME = 36; // the count header
const PANEL_MIN_WIDTH = 420;

/**
 * Searchable customer picker for the whole customer list (hundreds or thousands).
 *
 * The results panel is rendered into document.body with fixed positioning (as LineItemMatchCombobox
 * does), so no page or card overflow can clip it; it opens below the field, or above when there is
 * more room there. Only the rows in view are rendered (virtualised), every customer stays reachable
 * by scrolling, and the search runs over the complete list.
 */
export default function CustomerPicker<T extends PickerCustomer>({
  customers,
  selectedName,
  describe,
  isActive,
  onSelect,
}: {
  customers: T[];
  selectedName: string | null;
  /** Right-hand context for a row, e.g. where the customer's prices come from. */
  describe: (customer: T) => string;
  isActive: (customer: T) => boolean;
  onSelect: (customer: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; listHeight: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchCustomers(customers, query), [customers, query]);

  const place = useCallback(() => {
    const anchor = inputRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, PANEL_MIN_WIDTH), window.innerWidth - 16);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const upward = below < 280 && above > below;
    const listHeight = Math.max(160, Math.min(PANEL_MAX_LIST_HEIGHT, (upward ? above : below) - PANEL_CHROME - 8));
    const top = upward ? Math.max(8, r.top - listHeight - PANEL_CHROME - 6) : r.bottom + 4;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setRect({ top, left, width, listHeight });
  }, []);

  function openPanel() {
    place();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
    setHighlight(0);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  function choose(customer: T) {
    close();
    inputRef.current?.blur();
    onSelect(customer);
  }

  // Follow the field while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const follow = () => place();
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open, place]);

  // Close on a click outside the field and the panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function moveHighlight(next: number) {
    const index = Math.max(0, Math.min(results.length - 1, next));
    setHighlight(index);
    const list = listRef.current;
    if (!list) return;
    const viewport = rect?.listHeight ?? PANEL_MAX_LIST_HEIGHT;
    if (index * ROW_HEIGHT < list.scrollTop) list.scrollTop = index * ROW_HEIGHT;
    else if ((index + 1) * ROW_HEIGHT > list.scrollTop + viewport) list.scrollTop = (index + 1) * ROW_HEIGHT - viewport;
  }

  const { start, end } = visibleWindow({ scrollTop, viewportHeight: rect?.listHeight ?? PANEL_MAX_LIST_HEIGHT, rowHeight: ROW_HEIGHT, total: results.length });
  const activeId = open && results[highlight] ? `customer-option-${results[highlight].id}` : undefined;

  const panel =
    open && rect ? (
      <div
        ref={panelRef}
        style={{ top: rect.top, left: rect.left, width: rect.width }}
        className="fixed z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 text-xs text-slate-500" style={{ height: PANEL_CHROME }}>
          <span>{query.trim() ? `${results.length} of ${customers.length} customers match` : `All ${customers.length} customers, A–Z`}</span>
          <span className="hidden sm:inline">↑ ↓ to move · Enter to open · Esc to close</span>
        </div>
        {results.length ? (
          <div
            ref={listRef}
            id="customer-picker-results"
            role="listbox"
            aria-label="Customers"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            style={{ height: Math.min(rect.listHeight, results.length * ROW_HEIGHT) }}
            className="relative overflow-y-auto overscroll-contain"
          >
            <div style={{ height: results.length * ROW_HEIGHT, position: "relative" }}>
              {results.slice(start, end).map((c, offset) => {
                const index = start + offset;
                const details = [c.trading_name && c.trading_name !== c.customer_name ? c.trading_name : null, c.customer_code, c.vat_number ? `VAT ${c.vat_number}` : null].filter(Boolean).join(" · ");
                return (
                  <div
                    key={c.id}
                    id={`customer-option-${c.id}`}
                    role="option"
                    aria-selected={index === highlight}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(c)}
                    style={{ position: "absolute", top: index * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
                    className={`flex cursor-pointer items-center justify-between gap-3 border-b border-slate-50 px-4 ${index === highlight ? "bg-slate-100" : "bg-white"}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {c.customer_name}
                        {!isActive(c) ? <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Inactive</span> : null}
                      </div>
                      {details ? <div className="truncate text-xs text-slate-500">{details}</div> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-500">{describe(c)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-slate-500">No customer matches “{query.trim()}”.</div>
        )}
      </div>
    ) : null;

  return (
    <>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setScrollTop(0);
          if (listRef.current) listRef.current.scrollTop = 0;
          if (!open) openPanel();
        }}
        onFocus={openPanel}
        onClick={() => (open ? null : openPanel())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) openPanel();
            else moveHighlight(highlight + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveHighlight(highlight - 1);
          } else if (e.key === "PageDown") {
            e.preventDefault();
            moveHighlight(highlight + Math.floor((rect?.listHeight ?? PANEL_MAX_LIST_HEIGHT) / ROW_HEIGHT));
          } else if (e.key === "PageUp") {
            e.preventDefault();
            moveHighlight(highlight - Math.floor((rect?.listHeight ?? PANEL_MAX_LIST_HEIGHT) / ROW_HEIGHT));
          } else if (e.key === "Enter" && open && results[highlight]) {
            e.preventDefault();
            choose(results[highlight]);
          } else if (e.key === "Escape") close();
        }}
        placeholder={selectedName ? `Change customer — currently ${selectedName}` : `Search or browse ${customers.length} customers — name, trading name, code or VAT number`}
        aria-label="Search customers"
        role="combobox"
        aria-expanded={open}
        aria-controls="customer-picker-results"
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
      />
      {open && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
