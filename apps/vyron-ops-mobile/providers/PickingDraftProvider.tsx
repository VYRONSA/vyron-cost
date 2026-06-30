import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import type { PickLineDraft, ShortPickReason } from "@/types/store-orders";
import { buildPickDraftFromLines } from "@/features/picking/validation";

type PickingDraftContextValue = {
  orderId: string | null;
  draft: PickLineDraft[];
  initDraft: (
    orderId: string,
    lines: Array<{
      id: string;
      product_name_snapshot: string;
      quantity: number;
      unit: string;
    }>
  ) => void;
  updateLine: (lineId: string, patch: Partial<PickLineDraft>) => void;
  pickFullLine: (lineId: string) => void;
  shortPickLine: (lineId: string, qty: number, reason: ShortPickReason, note?: string) => void;
  skipLine: (lineId: string) => void;
  pickAllFull: () => void;
  clearDraft: () => void;
};

const PickingDraftContext = createContext<PickingDraftContextValue | null>(null);

export function PickingDraftProvider({ children }: { children: ReactNode }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PickLineDraft[]>([]);

  const value = useMemo<PickingDraftContextValue>(
    () => ({
      orderId,
      draft,
      initDraft: (nextOrderId, lines) => {
        setOrderId(nextOrderId);
        setDraft(buildPickDraftFromLines(lines));
      },
      updateLine: (lineId, patch) => {
        setDraft((current) => current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
      },
      pickFullLine: (lineId) => {
        setDraft((current) =>
          current.map((line) =>
            line.lineId === lineId
              ? {
                  ...line,
                  skipped: false,
                  pickedQty: line.requiredQty,
                  shortPickReason: null,
                  shortPickNote: null,
                }
              : line
          )
        );
      },
      shortPickLine: (lineId, qty, reason, note) => {
        setDraft((current) =>
          current.map((line) =>
            line.lineId === lineId
              ? {
                  ...line,
                  skipped: false,
                  pickedQty: qty,
                  shortPickReason: reason,
                  shortPickNote: note || null,
                }
              : line
          )
        );
      },
      skipLine: (lineId) => {
        setDraft((current) =>
          current.map((line) =>
            line.lineId === lineId
              ? { ...line, skipped: true, pickedQty: 0, shortPickReason: null, shortPickNote: null }
              : line
          )
        );
      },
      pickAllFull: () => {
        setDraft((current) =>
          current.map((line) => ({
            ...line,
            skipped: false,
            pickedQty: line.requiredQty,
            shortPickReason: null,
            shortPickNote: null,
          }))
        );
      },
      clearDraft: () => {
        setOrderId(null);
        setDraft([]);
      },
    }),
    [orderId, draft]
  );

  return <PickingDraftContext.Provider value={value}>{children}</PickingDraftContext.Provider>;
}

export function usePickingDraft() {
  const context = useContext(PickingDraftContext);
  if (!context) throw new Error("usePickingDraft must be used within PickingDraftProvider");
  return context;
}
