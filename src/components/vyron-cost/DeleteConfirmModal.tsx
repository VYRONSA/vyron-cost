"use client";

import { useState } from "react";

type DeleteConfirmModalProps = {
  itemName: string;
  itemType: string;
  onConfirm: () => void;
};

export default function DeleteConfirmModal({ itemName, itemType, onConfirm }: DeleteConfirmModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        Delete
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <div className="mb-4 h-12 w-12 rounded-2xl bg-rose-100 text-center text-2xl leading-[48px] text-rose-700">!</div>
            <h2 className="text-xl font-black text-slate-950">Confirm delete</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You are about to delete this {itemType}: <span className="font-bold text-slate-900">{itemName}</span>. This action should only be used when you are sure the record is no longer needed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  setOpen(false);
                }}
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-rose-500/20 hover:bg-rose-700"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
