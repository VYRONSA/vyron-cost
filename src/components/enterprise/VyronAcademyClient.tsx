"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VYRON_ACADEMY_GUIDES, type AcademyGuide } from "@/lib/vyron-academy-content";

export default function VyronAcademyClient({ guides }: { guides: AcademyGuide[] }) {
  const [filter, setFilter] = useState("");
  const categories = useMemo(() => [...new Set(guides.map((g) => g.category))], [guides]);

  const filtered = guides.filter((g) =>
    [g.title, g.summary, g.category].join(" ").toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <section className="grid gap-8">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search guides…"
        className="max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
      />
      {categories.map((cat) => {
        const items = filtered.filter((g) => g.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <h2 className="text-xl font-black text-slate-900">{cat}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {items.map((g) => (
                <article key={g.id} className="rounded-[2rem] bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-black">{g.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{g.summary}</p>
                  <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm font-bold text-slate-700">
                    {g.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {g.href ? (
                    <Link href={g.href} className="mt-4 inline-block text-sm font-black text-violet-700 hover:underline">
                      Open module →
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
