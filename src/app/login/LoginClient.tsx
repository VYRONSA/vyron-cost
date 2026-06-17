"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import { writeActiveClient } from "@/lib/vyron-developer-client";
import { writeWorkspaceSession } from "@/lib/vyron-workspace-session";

export default function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/workspace/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      writeActiveClient(data.client);
      writeWorkspaceSession(data.session);
      router.push(data.redirect || "/dashboard");
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fbf5ff_0%,#f8fbff_42%,#ffffff_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <ClientBrandLockup variant="light" size="lg" />

        <div className="mt-12 rounded-[2rem] border border-violet-100 bg-white p-8 shadow-[0_24px_80px_rgba(76,29,149,0.10)]">
          <h1 className="text-2xl font-black">Client access</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            Sign in to your VYRON COST workspace with the email and password provided by your administrator.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Email</label>
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.co.za"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Password</label>
              <input
                name="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-500"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-violet-500/20 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Enter Workspace"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs font-black text-violet-700">
            <Link href="/developer">Developer access</Link>
            <Link href="/landing">Platform overview</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
