"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The gate around the admin section.
 *
 * This used to decide from the browser: the active-client cookie for "is there
 * a workspace" and the session cookie's role for "is this an admin". Since
 * authority moved to the database, neither is trustworthy — and an owner whose
 * active-client cookie was missing was shown "Admin access required" and could
 * never reach user management at all.
 *
 * The server is asked instead. It resolves the membership and answers from that
 * row. This remains a gate on what is worth rendering, not the enforcement:
 * every admin route independently requires the same permission.
 */
export default function AdminAccessGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/admin/access", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSignedIn(Boolean(data?.signedIn));
        setAllowed(Boolean(data?.admin));
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (allowed === null) return null;

  if (!allowed) {
    return (
      <div className="rounded-[2rem] border border-violet-100 bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-black text-slate-950">
          {signedIn ? "Admin access required" : "Sign in to continue"}
        </h1>
        <p className="mt-3 text-sm font-semibold text-slate-600">
          {signedIn
            ? "Company setup, user management and imports are available to OWNER, ADMIN and SUPERVISOR roles only."
            : "Your session has ended. Sign in again to manage company setup and users."}
        </p>
        <Link
          href={signedIn ? "/dashboard" : "/login"}
          className="mt-6 inline-block rounded-xl vyron-grad-surface px-5 py-2.5 text-sm font-semibold text-white"
        >
          {signedIn ? "Back to Dashboard" : "Go to sign in"}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
