"use client";

export default function ConfirmDeleteDialog({
  open,
  onConfirm,
  onCancel,
  message = "Are you sure you want to delete this?",
  confirming = false,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  message?: string;
  confirming?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_24px_70px_rgba(76,29,149,0.18)]"
      >
        <h3 className="text-lg font-black text-slate-950">Confirm delete</h3>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
          >
            {confirming ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
