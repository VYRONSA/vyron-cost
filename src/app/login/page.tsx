import Link from "next/link";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import { isHandcraftedDataReady } from "@/lib/handcrafted-tenant";

export default function LoginPage() {
  const ready = isHandcraftedDataReady();

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#0F172A]">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <ClientBrandLockup variant="light" size="lg" />

        <div className="vyron-surface-card-elevated mt-12 p-8">
          <h1 className="text-2xl font-black">Executive access</h1>
          <p className="mt-3 text-sm text-[#64748B]">
            {ready ? "Handcrafted Food Products command centre." : "Activate demo environment."}
          </p>

          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs font-bold text-violet-900">
            <div className="font-black uppercase tracking-[0.14em]">Demo credentials</div>
            <div className="mt-2">Email: finance@handcraftedfood.co.za</div>
            <div>Password: demo</div>
            <div>Supervisor override PIN: vyron-supervisor</div>
          </div>

          <form className="mt-8 space-y-4" action="/api/demo-access" method="GET">
            <input type="hidden" name="redirect" value="/dashboard" />
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-[#64748B]">Email</label>
              <input
                type="email"
                defaultValue="finance@handcraftedfood.co.za"
                className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-[#64748B]">Password</label>
              <input
                type="password"
                defaultValue="demo"
                className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none focus:border-violet-500"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 py-4 text-sm font-black uppercase tracking-[0.12em] text-white"
            >
              Enter Command Centre
            </button>
          </form>

          <Link href="/landing" className="mt-6 block text-center text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B] hover:text-[#0F172A]">
            ← Platform overview
          </Link>
        </div>
      </div>
    </main>
  );
}
