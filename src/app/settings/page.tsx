import VyronCostShell from "@/components/VyronCostShell";
import { VYRON_SURFACE } from "@/components/vyron-ui";

export default function SettingsPage() {
  return (
    <VyronCostShell hidePageHeader title="Settings" subtitle="Workspace, users, company and platform settings.">
      <section className="grid gap-5 md:grid-cols-2">
        <div className={`${VYRON_SURFACE.dark} p-6`}>
          <h2 className="text-xl font-black text-[#F8FAFC]">Workspace</h2>
          <p className="mt-2 text-sm text-[#CBD5E1]">Handcrafted Food Products demo tenant</p>
          <div className="mt-4 space-y-3 text-sm text-[#CBD5E1]">
            <div className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold">Currency: ZAR</div>
            <div className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold">Default target GP: 40%</div>
            <div className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold">Data source: Supabase first</div>
          </div>
        </div>
        <div className={`${VYRON_SURFACE.dark} p-6`}>
          <h2 className="text-xl font-black text-[#F8FAFC]">Platform</h2>
          <p className="mt-2 text-sm text-[#CBD5E1]">VYRON COST SaaS configuration</p>
          <div className="mt-4 space-y-3 text-sm text-[#CBD5E1]">
            <div className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold">Sidebar: Unified global navigation</div>
            <div className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold">AI assistant: Rule-based live data</div>
            <div className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold">Reports: Same shell on all pages</div>
          </div>
        </div>
      </section>
    </VyronCostShell>
  );
}

