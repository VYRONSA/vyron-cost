"use client";

import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/order-engine/lifecycle";
import type { IntakeStatus, IssueSeverity } from "@/lib/order-engine/types";

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function qty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-ZA", { maximumFractionDigits: 4 });
}

export function when(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_TONE: Record<IntakeStatus, string> = {
  RECEIVED: "bg-slate-100 text-slate-700",
  EXCEPTION: "bg-rose-100 text-rose-800",
  AWAITING_APPROVAL: "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
  ON_HOLD: "bg-amber-100 text-amber-800",
  APPROVED: "bg-sky-100 text-sky-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-slate-200 text-slate-600",
};

export function IntakeStatusPill({ status }: { status: IntakeStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${STATUS_TONE[status] || "bg-slate-100 text-slate-700"}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "blue" | "green" | "amber" | "rose" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
  };
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-black ${tones[tone]}`}>{children}</span>;
}

export function SeverityPill({ severity }: { severity: IssueSeverity }) {
  if (severity === "error") return <Pill tone="rose">Blocking</Pill>;
  if (severity === "warning") return <Pill tone="amber">Warning</Pill>;
  return <Pill tone="blue">Info</Pill>;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="w-full max-w-full min-w-0 rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-xs font-black uppercase tracking-[0.13em] text-slate-500">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function KpiCard({ label, value, active, onClick }: { label: string; value: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-full w-full min-w-0 rounded-2xl bg-white p-4 text-left shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition ${active ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-slate-200"}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-2xl font-black text-slate-900">{value}</div>
    </button>
  );
}

export function PrimaryButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-2xl vyron-grad-surface px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, tone = "slate" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "slate" | "rose" | "amber" }) {
  const tones = {
    slate: "border-slate-200 text-slate-700 hover:bg-slate-50",
    rose: "border-rose-200 text-rose-700 hover:bg-rose-50",
    amber: "border-amber-200 text-amber-800 hover:bg-amber-50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    info: "border-slate-200 bg-slate-50 text-slate-700",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${tones[tone]}`}>{children}</div>;
}

/** Shown when the API answers 503 NOT_ENABLED — the migration is not applied to this database. */
export function NotEnabledNotice() {
  return (
    <Notice tone="warning">
      The Order Inbox is not yet enabled for this workspace&apos;s database. It becomes available once the Order Engine database change has been
      reviewed and applied.
    </Notice>
  );
}
