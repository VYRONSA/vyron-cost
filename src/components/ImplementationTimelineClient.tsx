"use client";

const weeks = [
  ["Week 1", "Setup suppliers, ingredients, first BOMs and products."],
  ["Week 2", "Import invoice data, purchase orders and supplier price history."],
  ["Week 3", "Activate recovery approvals, pricing decisions and reporting."],
  ["Week 4", "Board pack, executive review and commercial rollout."],
];

export default function ImplementationTimelineClient() {
  return (
    <section className="grid gap-5">
      {weeks.map(([week, detail], index) => (
        <div key={week} className="grid gap-4 rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:grid-cols-[90px_1fr]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-2xl font-black text-emerald-700">{index + 1}</div>
          <div>
            <h2 className="text-2xl font-black text-[#07110d]">{week}</h2>
            <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
