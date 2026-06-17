import Link from "next/link";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import { isHandcraftedDataReady } from "@/lib/handcrafted-tenant";

const M = VYRON_MASTER;

export default function LoginPage() {
  const ready = isHandcraftedDataReady();

  return (
    <main className={M.page}>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,0.06),transparent_40%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_90%,rgba(244,63,94,0.04),transparent_38%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <ClientBrandLockup variant="light" size="lg" />

        <div className={`mt-12 p-8 ${M.lightCard}`}>
          <h1 className={`text-2xl ${M.heading}`}>Executive access</h1>
          <p className={`mt-3 text-sm ${M.muted}`}>
            {ready ? "Handcrafted Food Products command centre." : "Activate demo environment."}
          </p>

          <div className="mt-5 rounded-2xl border border-[#7C3AED]/15 bg-gradient-to-r from-[#E11D48]/5 to-[#7C3AED]/8 p-4 text-xs font-bold text-[#334155]">
            <div className={`font-black uppercase tracking-[0.14em] ${M.sectionLabel}`}>Demo credentials</div>
            <div className="mt-2">Email: finance@handcraftedfood.co.za</div>
            <div>Password: demo</div>
            <div>Supervisor override PIN: vyron-supervisor</div>
          </div>

          <form className="mt-8 space-y-4" action="/api/demo-access" method="GET">
            <input type="hidden" name="redirect" value="/dashboard" />
            <div>
              <label className={M.label}>Email</label>
              <input
                type="email"
                defaultValue="finance@handcraftedfood.co.za"
                className={`mt-2 ${M.input}`}
              />
            </div>
            <div>
              <label className={M.label}>Password</label>
              <input type="password" defaultValue="demo" className={`mt-2 ${M.input}`} />
            </div>
            <button
              type="submit"
              className={`w-full py-4 text-sm uppercase tracking-[0.12em] ${M.primaryBtn}`}
            >
              Enter Command Centre
            </button>
          </form>

          <Link
            href="/landing"
            className={`mt-6 block text-center text-[10px] font-black uppercase tracking-[0.14em] hover:text-[#0F172A] ${M.muted}`}
          >
            ← Platform overview
          </Link>
        </div>
      </div>
    </main>
  );
}
