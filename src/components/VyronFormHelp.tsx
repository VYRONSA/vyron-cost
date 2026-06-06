"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";

export type HelpItem = {
  title: string;
  body: string;
  example?: string;
};

export function FieldHelp({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle size={15} className="ml-1 text-slate-400" />
      <span className="pointer-events-none absolute left-0 top-6 z-30 hidden w-64 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold leading-5 text-white shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

export function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-sm font-black text-violet-700">{number}</div>
      <div>
        <h3 className="text-lg font-black text-slate-950">{title}</h3>
        <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

export function CollapsibleHelp({ title = "Need help with this page?", items }: { title?: string; items: HelpItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/60 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-black text-violet-800">
          <HelpCircle size={17} /> {title}
        </span>
        <span className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="text-sm font-black text-slate-950">{item.title}</div>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{item.body}</p>
              {item.example ? <p className="mt-2 text-xs font-medium leading-5 text-slate-400"><span className="font-black text-slate-500">Example:</span> {item.example}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SimpleField({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-black text-slate-900">
      <span className="inline-flex items-center">
        {label}{required ? <span className="ml-1 text-red-500">*</span> : null}{help ? <FieldHelp text={help} /> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
