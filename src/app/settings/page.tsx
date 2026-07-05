import VyronCostShell from "@/components/VyronCostShell";
import { VYRON_SURFACE } from "@/components/vyron-ui";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <VyronCostShell hidePageHeader title="Settings" subtitle="Workspace, users, company and platform settings.">
      <section className="grid gap-5 md:grid-cols-2">
        <div className={`${VYRON_SURFACE.dark} p-6`}>
          <h2 className="text-xl font-black text-[#F8FAFC]">Workspace</h2>
          <p className="mt-2 text-sm text-[#CBD5E1]">Open the live workspace configuration areas.</p>
          <div className="mt-4 grid gap-3 text-sm text-[#CBD5E1]">
            <Link href="/companies" className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold transition hover:border-violet-300/40">
              Company Profile
            </Link>
            <Link href="/users" className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold transition hover:border-violet-300/40">
              Users & Roles
            </Link>
            <Link href="/imports" className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold transition hover:border-violet-300/40">
              Imports
            </Link>
          </div>
        </div>
        <div className={`${VYRON_SURFACE.dark} p-6`}>
          <h2 className="text-xl font-black text-[#F8FAFC]">Platform</h2>
          <p className="mt-2 text-sm text-[#CBD5E1]">Open connected platform configuration pages.</p>
          <div className="mt-4 grid gap-3 text-sm text-[#CBD5E1]">
            <Link href="/integrations/xero" className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold transition hover:border-violet-300/40">
              Integrations
            </Link>
            <Link href="/deployment-readiness" className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold transition hover:border-violet-300/40">
              Deployment Readiness
            </Link>
            <Link href="/developer" className="rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 font-bold transition hover:border-violet-300/40">
              Developer Centre
            </Link>
          </div>
        </div>
      </section>
    </VyronCostShell>
  );
}

