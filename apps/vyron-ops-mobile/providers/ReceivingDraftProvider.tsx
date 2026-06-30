import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import type { ReceiveLineDraft } from "@/types/receiving";
import { buildReceiveDraftFromLines } from "@/features/receiving/validation";

type ReceivingDraftContextValue = {
  poId: string | null;
  draft: ReceiveLineDraft[];
  initDraft: (
    poId: string,
    lines: Array<{
      id: string;
      ingredient_name: string;
      quantity: number;
      received_qty: number;
      outstanding_qty: number;
      unit: string;
      unit_cost: number;
    }>
  ) => void;
  updateLine: (lineId: string, patch: Partial<ReceiveLineDraft>) => void;
  receiveFullLine: (lineId: string) => void;
  receivePartialLine: (lineId: string, qty: number) => void;
  skipLine: (lineId: string) => void;
  receiveAllFull: () => void;
  clearDraft: () => void;
};

const ReceivingDraftContext = createContext<ReceivingDraftContextValue | null>(null);

export function ReceivingDraftProvider({ children }: { children: ReactNode }) {
  const [poId, setPoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiveLineDraft[]>([]);

  const value = useMemo<ReceivingDraftContextValue>(
    () => ({
      poId,
      draft,
      initDraft: (nextPoId, lines) => {
        setPoId(nextPoId);
        setDraft(buildReceiveDraftFromLines(lines));
      },
      updateLine: (lineId, patch) => {
        setDraft((current) => current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
      },
      receiveFullLine: (lineId) => {
        setDraft((current) =>
          current.map((line) =>
            line.lineId === lineId
              ? { ...line, skipped: false, receiveQty: line.outstandingQty }
              : line
          )
        );
      },
      receivePartialLine: (lineId, qty) => {
        setDraft((current) =>
          current.map((line) =>
            line.lineId === lineId ? { ...line, skipped: false, receiveQty: qty } : line
          )
        );
      },
      skipLine: (lineId) => {
        setDraft((current) =>
          current.map((line) =>
            line.lineId === lineId ? { ...line, skipped: true, receiveQty: 0 } : line
          )
        );
      },
      receiveAllFull: () => {
        setDraft((current) =>
          current.map((line) => ({ ...line, skipped: false, receiveQty: line.outstandingQty }))
        );
      },
      clearDraft: () => {
        setPoId(null);
        setDraft([]);
      },
    }),
    [poId, draft]
  );

  return <ReceivingDraftContext.Provider value={value}>{children}</ReceivingDraftContext.Provider>;
}

export function useReceivingDraft() {
  const context = useContext(ReceivingDraftContext);
  if (!context) throw new Error("useReceivingDraft must be used within ReceivingDraftProvider");
  return context;
}
