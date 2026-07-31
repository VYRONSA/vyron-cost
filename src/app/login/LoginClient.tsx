"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import ClientBrandLockup from "@/components/ClientBrandLockup";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

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
    <main className="vyron-public-page min-h-screen text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <ClientBrandLockup variant="light" size="lg" />

        <div className={`mt-12 p-8 ${M.lightCard}`}>
          <h1 className={`text-2xl ${M.heading}`}>Client access</h1>
          <p className={`mt-3 text-sm font-semibold leading-6 ${M.muted}`}>
            Sign in to your VYRON COST workspace with the email and password provided by your administrator.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className={M.label}>Email</label>
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.co.za"
                className={`mt-2 ${M.input}`}
              />
            </div>
            <div>
              <label className={M.label}>Password</label>
              <input
                name="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className={`mt-2 ${M.input}`}
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
              className={`w-full py-4 text-sm uppercase tracking-[0.12em] disabled:opacity-60 ${M.primaryBtn}`}
            >
              {loading ? "Signing in…" : "Enter Workspace"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-end text-xs font-black text-[#1D6BFF]">
            <Link href="/landing">Platform overview</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
