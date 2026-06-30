import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import type { DeliveryDraft, DeliveryState } from "@/types/store-orders";

type DeliveryDraftContextValue = {
  orderId: string | null;
  draft: DeliveryDraft;
  initDraft: (orderId: string) => void;
  setState: (state: DeliveryState) => void;
  setNotes: (notes: string) => void;
  /** Architecture placeholders — camera/signature integration in a future sprint. */
  markSignaturePlaceholder: () => void;
  markPhotoPlaceholder: () => void;
  clearDraft: () => void;
};

const defaultDraft: DeliveryDraft = {
  state: "Delivered",
  notes: "",
  signatureCaptured: false,
  photoCaptured: false,
};

const DeliveryDraftContext = createContext<DeliveryDraftContextValue | null>(null);

export function DeliveryDraftProvider({ children }: { children: ReactNode }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeliveryDraft>(defaultDraft);

  const value = useMemo<DeliveryDraftContextValue>(
    () => ({
      orderId,
      draft,
      initDraft: (nextOrderId) => {
        setOrderId(nextOrderId);
        setDraft(defaultDraft);
      },
      setState: (state) => setDraft((current) => ({ ...current, state })),
      setNotes: (notes) => setDraft((current) => ({ ...current, notes })),
      markSignaturePlaceholder: () =>
        setDraft((current) => ({ ...current, signatureCaptured: true })),
      markPhotoPlaceholder: () => setDraft((current) => ({ ...current, photoCaptured: true })),
      clearDraft: () => {
        setOrderId(null);
        setDraft(defaultDraft);
      },
    }),
    [orderId, draft]
  );

  return <DeliveryDraftContext.Provider value={value}>{children}</DeliveryDraftContext.Provider>;
}

export function useDeliveryDraft() {
  const context = useContext(DeliveryDraftContext);
  if (!context) throw new Error("useDeliveryDraft must be used within DeliveryDraftProvider");
  return context;
}
