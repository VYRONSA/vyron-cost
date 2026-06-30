import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import type { WastageDraft } from "@/types/production";

type ProductionDraftContextValue = {
  runId: string | null;
  producedQty: number;
  isPaused: boolean;
  wastage: WastageDraft[];
  initDraft: (runId: string, producedQty: number) => void;
  setProducedQty: (qty: number) => void;
  incrementGoodUnits: (amount: number) => void;
  pauseRun: () => void;
  resumeRun: () => void;
  addWastage: (entry: Omit<WastageDraft, "id">) => void;
  removeWastage: (id: string) => void;
  clearDraft: () => void;
};

const ProductionDraftContext = createContext<ProductionDraftContextValue | null>(null);

export function ProductionDraftProvider({ children }: { children: ReactNode }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [producedQty, setProducedQtyState] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [wastage, setWastage] = useState<WastageDraft[]>([]);

  const value = useMemo<ProductionDraftContextValue>(
    () => ({
      runId,
      producedQty,
      isPaused,
      wastage,
      initDraft: (nextRunId, startingQty) => {
        setRunId(nextRunId);
        setProducedQtyState(startingQty);
        setIsPaused(false);
        setWastage([]);
      },
      setProducedQty: (qty) => setProducedQtyState(Math.max(0, qty)),
      incrementGoodUnits: (amount) => setProducedQtyState((current) => Math.max(0, current + amount)),
      pauseRun: () => setIsPaused(true),
      resumeRun: () => setIsPaused(false),
      addWastage: (entry) => {
        setWastage((current) => [
          ...current,
          { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
        ]);
      },
      removeWastage: (id) => setWastage((current) => current.filter((entry) => entry.id !== id)),
      clearDraft: () => {
        setRunId(null);
        setProducedQtyState(0);
        setIsPaused(false);
        setWastage([]);
      },
    }),
    [runId, producedQty, isPaused, wastage]
  );

  return <ProductionDraftContext.Provider value={value}>{children}</ProductionDraftContext.Provider>;
}

export function useProductionDraft() {
  const context = useContext(ProductionDraftContext);
  if (!context) throw new Error("useProductionDraft must be used within ProductionDraftProvider");
  return context;
}
