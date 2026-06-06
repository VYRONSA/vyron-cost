"use client";

import { useCallback, useState } from "react";

export function useConfirmDelete(message = "Are you sure you want to delete this?") {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);

  const requestDelete = useCallback((action: () => Promise<void> | void) => {
    setPendingAction(() => action);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => {
    if (confirming) return;
    setOpen(false);
    setPendingAction(null);
  }, [confirming]);

  const confirm = useCallback(async () => {
    if (!pendingAction) return;
    setConfirming(true);
    try {
      await pendingAction();
      setOpen(false);
      setPendingAction(null);
    } finally {
      setConfirming(false);
    }
  }, [pendingAction]);

  return {
    open,
    confirming,
    message,
    requestDelete,
    cancel,
    confirm,
  };
}
