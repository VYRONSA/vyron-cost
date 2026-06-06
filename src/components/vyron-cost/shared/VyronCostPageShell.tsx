"use client";

import Link from "next/link";
import { ReactNode } from "react";

export type VyronCostPageShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function VyronCostPageShell({
  title,
  subtitle,
  backHref = "/dashboard",
  children,
  actions,
}: VyronCostPageShellProps) {
  return (
    <main className="min-h-screen bg-[#f7f3ff] text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-12%] top-[-16%] h-[420px] w-[420px] rounded-full bg-purple-300/30 blur-3xl" />
        <div className="absolute right-[-10%] top-[10%] h-[360px] w-[360px] rounded-full bg-fuchsia-200/40 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[35%] h-[440px] w-[440px] rounded-full bg-indigo-200/35 blur-3xl" />
      </div>

      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-7 lg:px-8">
        <div className="flex flex-col justify-between gap-4 rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_80px_rgba(76,29,149,0.12)] backdrop-blur-xl md:flex-row md:items-center">
          <div>
            <Link
              href={backHref}
              className="mb-4 inline-flex items-center rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-purple-800 shadow-sm transition hover:border-purple-300 hover:bg-purple-50"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{title}</h1>
            {subtitle ? <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>

        {children}
      </section>
    </main>
  );
}
