"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

const INPUT =
  "mt-2 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-[#93AEB9]/80 focus:border-[#F4C44E]/70 focus:bg-white/[0.09] focus:ring-4 focus:ring-[#F4C44E]/15";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(queryError || "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/workspace/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }

      window.location.href = "/api/workspace/restore-session";
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <main className="volora-night volora-texture relative min-h-screen overflow-hidden text-[#E8EEF1]">
      {/* Atmosphere: gold light from the top right, green from the bottom left. */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(244,196,78,0.16),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(62,155,82,0.16),transparent_65%)]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section className="min-w-0">
          <ClientBrandLockup variant="dark" size="lg" />

          <p className="mt-12 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#F4C44E]">
            Real data. Smarter decisions. Higher margins.
          </p>
          <h1 className="volora-display mt-4 text-4xl font-bold leading-[1.08] tracking-[-0.02em] text-white sm:text-5xl">
            Turn every cost into a <span className="text-[#F4C44E]">more profitable</span> tomorrow.
          </h1>
          <p className="mt-6 max-w-lg text-[15px] leading-7 text-[#BCCDD5]">
            Procurement, inventory, production, recipes, labour and sales in one profitability workspace.
          </p>

          <ul className="mt-8 hidden max-w-lg gap-3 text-sm text-[#DDE7EB] sm:grid">
            {["Cost and margin intelligence", "Recipe, BOM and production costing", "Orders, approvals and inventory control"].map(
              (item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="shrink-0 text-[#55B968]" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>
        </section>

        <section className="min-w-0">
          <div className="volora-glass-dark rounded-[1.75rem] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-9">
            <h2 className="volora-display text-2xl font-bold text-white">Sign in</h2>
            <p className="mt-2 text-sm leading-6 text-[#BCCDD5]">
              Use the email and password provided by your administrator.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-email" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#BCCDD5]">
                  Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.co.za"
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#BCCDD5]">
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className={INPUT}
                />
              </div>

              {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 text-sm uppercase tracking-[0.14em] disabled:opacity-60 ${M.primaryBtn}`}
              >
                {loading ? "Signing in…" : "Enter Workspace"}
                {loading ? null : <ArrowRight size={17} aria-hidden />}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs">
              <span className="text-[#93AEB9]">A product of Vyronsoft (Pty) Ltd.</span>
              <Link href="/landing" className="font-semibold text-[#F4C44E] hover:text-[#F7C948]">
                Platform overview
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
