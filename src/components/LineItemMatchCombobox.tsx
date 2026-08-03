"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Package, Plus, Search } from "lucide-react";
import type { MatchOption } from "@/lib/vyron-document-review-client";
import type { ReviewDraftLine } from "@/lib/vyron-document-review-client";
import {
  entityTypeLabel,
  entityTypePillClass,
  matchQualityClass,
  matchQualityLabel,
  rankMatchOptions,
  type MatchQuality,
  type RankedMatchRow,
} from "@/lib/vyron-line-match-search";

const DROPDOWN_MAX_LIST_HEIGHT = 280;
const DROPDOWN_MIN_WIDTH = 320;
const SEARCH_HEADER_HEIGHT = 52;
const FOOTER_HEIGHT = 118;

type LineItemMatchComboboxProps = {
  line: ReviewDraftLine;
  matchOptions: MatchOption[];
  disabled?: boolean;
  selectedQuality?: MatchQuality | null;
  onSelect: (option: MatchOption, quality: MatchQuality) => void;
  onClear: () => void;
  onCreateIngredient: () => void;
  onCreatePackaging: () => void;
  onEditIngredient?: () => void;
};

function MatchRow({
  row,
  active,
  rowRef,
  onPick,
}: {
  row: RankedMatchRow;
  active: boolean;
  rowRef?: (el: HTMLButtonElement | null) => void;
  onPick: () => void;
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onPick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-violet-50 ${active ? "bg-violet-50" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate font-bold text-slate-900">{row.option.name}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${matchQualityClass(row.quality)}`}>
        {matchQualityLabel(row.quality)}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${entityTypePillClass(row.option.entityType)}`}>
        {entityTypeLabel(row.option.entityType)}
      </span>
    </button>
  );
}

export default function LineItemMatchCombobox({
  line,
  matchOptions,
  disabled = false,
  selectedQuality,
  onSelect,
  onClear,
  onCreateIngredient,
  onCreatePackaging,
  onEditIngredient,
}: LineItemMatchComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    listMaxHeight: number;
  } | null>(null);

  const entityFilter = line.ignored ? null : line.matchedEntityType;

  const effectiveMatchOptions = useMemo(() => {
    if (!line.matchedEntityId || !line.matchedEntityType || !line.matchedEntityName?.trim()) {
      return matchOptions;
    }
    const key = `${line.matchedEntityType}:${line.matchedEntityId}`;
    if (matchOptions.some((option) => `${option.entityType}:${option.id}` === key)) {
      return matchOptions;
    }
    return [
      ...matchOptions,
      {
        id: line.matchedEntityId,
        name: line.matchedEntityName,
        entityType: line.matchedEntityType,
        currentPrice: Number(line.unitPrice ?? 0),
      },
    ];
  }, [line, matchOptions]);

  const ranked = useMemo(
    () => rankMatchOptions(line, effectiveMatchOptions, query, entityFilter || undefined),
    [line, effectiveMatchOptions, query, entityFilter]
  );

  const smartRows = ranked.filter((row) => row.section === "smart");
  const otherRows = ranked.filter((row) => row.section === "other");
  const flatRows = [...smartRows, ...otherRows];
  const noMatches = flatRows.length === 0;

  const updateDropdownPosition = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(rect.width, DROPDOWN_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
    const available = openUpward ? spaceAbove : spaceBelow;
    const chrome = SEARCH_HEADER_HEIGHT + FOOTER_HEIGHT + 8;
    const listMaxHeight = Math.min(DROPDOWN_MAX_LIST_HEIGHT, Math.max(140, available - chrome));
    const panelHeight = listMaxHeight + chrome;
    const top = openUpward ? Math.max(8, rect.top - panelHeight - 4) : rect.bottom + 4;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);

    setDropdownRect({ top, left, width, listMaxHeight });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    const onScrollOrResize = () => updateDropdownPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateDropdownPosition, query, noMatches]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
    rowRefs.current = [];
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const row = rowRefs.current[highlightIndex];
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  function openDropdown() {
    if (disabled || line.ignored) return;
    setQuery("");
    setHighlightIndex(0);
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function pick(row: RankedMatchRow) {
    onSelect(row.option, row.quality);
    closeDropdown();
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flatRows.length === 0) return;
      setHighlightIndex((index) => Math.min(flatRows.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flatRows.length === 0) return;
      setHighlightIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (flatRows[highlightIndex]) {
        pick(flatRows[highlightIndex]);
      }
    }
  }

  function handleListWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.stopPropagation();
    const el = event.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const delta = event.deltaY;
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
    if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
      event.preventDefault();
    }
  }

  const dropdownPanel =
    open && !line.ignored && dropdownRect && mounted ? (
      <div
        ref={dropdownRef}
        className="fixed flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        style={{
          top: dropdownRect.top,
          /* Keep the list readable when the trigger cell is narrow, without
             letting it run off the right edge of the window. */
          left: Math.max(8, Math.min(dropdownRect.left, window.innerWidth - Math.max(dropdownRect.width, 340) - 8)),
          width: Math.max(dropdownRect.width, 340),
          zIndex: 10000,
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 bg-white p-2">
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-2 py-1.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200">
            <Search size={14} className="shrink-0 text-violet-600" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              placeholder="Search name, SKU, description, packaging…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-500"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Search matched items"
            />
          </div>
        </div>

        <div
          ref={listRef}
          role="listbox"
          className="min-h-0 overflow-y-auto overscroll-contain"
          style={{ maxHeight: dropdownRect.listMaxHeight }}
          onWheel={handleListWheel}
        >
          {smartRows.length > 0 ? (
            <div>
              <div className="bg-slate-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                Suggested matches
              </div>
              {smartRows.map((row, index) => (
                <MatchRow
                  key={`${row.option.entityType}:${row.option.id}`}
                  row={row}
                  active={highlightIndex === index}
                  rowRef={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  onPick={() => pick(row)}
                />
              ))}
            </div>
          ) : null}

          {otherRows.length > 0 ? (
            <div>
              <div className="bg-slate-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                All items
              </div>
              {otherRows.map((row, index) => {
                const flatIndex = smartRows.length + index;
                return (
                  <MatchRow
                    key={`${row.option.entityType}:${row.option.id}`}
                    row={row}
                    active={highlightIndex === flatIndex}
                    rowRef={(el) => {
                      rowRefs.current[flatIndex] = el;
                    }}
                    onPick={() => pick(row)}
                  />
                );
              })}
            </div>
          ) : null}

          {noMatches ? (
            <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">
              No matches for &ldquo;{query.trim() || "…"}&rdquo;
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50 p-2">
          <button
            type="button"
            onClick={() => {
              closeDropdown();
              onCreateIngredient();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-black text-violet-700 hover:bg-violet-100"
          >
            <Plus size={13} />
            Create New Ingredient
          </button>
          <button
            type="button"
            onClick={() => {
              closeDropdown();
              onCreatePackaging();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-black text-[var(--vyron-warning-fg)] hover:bg-[var(--vyron-warning-bg)]"
          >
            <Package size={13} />
            Create New Packaging
          </button>
          {line.matchedEntityId &&
          (line.matchedEntityType === "ingredient" || line.matchedEntityType === "packaging") &&
          onEditIngredient ? (
            <button
              type="button"
              onClick={() => {
                closeDropdown();
                onEditIngredient();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-black text-slate-700 hover:bg-white"
            >
              Edit Ingredient
            </button>
          ) : null}
          {line.matchedEntityId ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                closeDropdown();
              }}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 hover:bg-white"
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    /*
      The trigger no longer carries a 260px floor.

      MEASURED at 1366x768: inside the review grid this column is 172px wide, so
      a min-w-[260px] trigger pushed the table past its pane and put a horizontal
      scrollbar under all sixteen rows — the clerk had to scroll sideways to
      reach the mapping on every line. The trigger only ever needed to be as wide
      as its cell; the list is portaled to the body and sizes itself (see
      dropdownRect below), so it stays readable at any trigger width.
    */
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled || line.ignored}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        className={`flex w-full items-center gap-1 rounded-lg border bg-white px-1.5 py-0.5 text-left ${
          disabled || line.ignored
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
            : open
              ? "border-violet-400 ring-2 ring-violet-100"
              : "border-slate-200 hover:border-violet-300"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`min-w-0 flex-1 truncate text-xs font-bold ${line.matchedEntityName ? "text-slate-900" : "text-slate-400"}`}>
          {line.ignored ? "Ignored" : line.matchedEntityName || "Select matched item…"}
        </span>
        {line.matchedEntityType && !line.ignored ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${entityTypePillClass(line.matchedEntityType)}`}>
            {entityTypeLabel(line.matchedEntityType)}
          </span>
        ) : null}
        {selectedQuality && !line.ignored ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${matchQualityClass(selectedQuality)}`}>
            {matchQualityLabel(selectedQuality)}
          </span>
        ) : null}
        <ChevronDown size={14} className={`shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted && dropdownPanel ? createPortal(dropdownPanel, document.body) : null}
    </div>
  );
}
