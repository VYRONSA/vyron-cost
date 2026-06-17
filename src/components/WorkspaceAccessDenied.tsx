"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function WorkspaceAccessDenied({
  pathname,
  permission,
}: {
  pathname?: string;
  permission?: string | null;
}) {
  return (
    <section className="flex min-h-[420px] flex-col items-center justify-center rounded-[2rem] border border-red-100 bg-white p-10 text-center shadow-[0_18px_50px_rgba(239,68,68,0.08)]">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 text-red-600">
        <ShieldX size={40} />
      </div>
      <h2 className="text-3xl font-black tracking-tight text-slate-950">Access Denied</h2>
      <p className="mt-3 max-w-xl text-sm font-semibold text-slate-600">
        You do not have permission to access this area of VYRON COST.
        {permission ? ` Required: ${permission}.` : ""}
      </p>
      {pathname ? (
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{pathname}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700"
        >
          Switch Account
        </Link>
      </div>
    </section>
  );
}
