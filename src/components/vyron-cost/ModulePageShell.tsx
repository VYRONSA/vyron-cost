import type { ReactNode } from "react";

export default function ModulePageShell({ eyebrow, title, subtitle, actions, children }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_30%),linear-gradient(180deg,#ffffff,#f8f7ff)] px-6 py-6 text-slate-950 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 rounded-[32px] border border-white/80 bg-white/80 p-6 shadow-xl shadow-violet-200/30 backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-600">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">{subtitle}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {children}
      </div>
    </main>
  );
}
