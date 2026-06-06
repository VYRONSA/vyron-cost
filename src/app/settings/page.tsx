import VyronCostShell from "@/components/VyronCostShell";

export default function SettingsPage() {
  return (
    <VyronCostShell title="Settings" subtitle="Workspace, users, company and platform settings.">
      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-[#07110d]">Workspace</h2>
          <p className="mt-2 text-sm text-slate-500">Handcrafted Food Products demo tenant</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-4 py-3 font-bold">Currency: ZAR</div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 font-bold">Default target GP: 40%</div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 font-bold">Data source: Supabase first</div>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-[#07110d]">Platform</h2>
          <p className="mt-2 text-sm text-slate-500">VYRON COST SaaS configuration</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-4 py-3 font-bold">Sidebar: Unified global navigation</div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 font-bold">AI assistant: Rule-based live data</div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 font-bold">Reports: Same shell on all pages</div>
          </div>
        </div>
      </section>
    </VyronCostShell>
  );
}
