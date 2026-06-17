"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export type VyronCostPageShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function VyronCostPageShell({
  title,
  subtitle,
  backHref = "/dashboard",
  children,
  actions,
}: VyronCostPageShellProps) {
  return (
    <main className={`min-h-screen ${M.page}`}>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(124,58,237,0.05),transparent_42%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(244,63,94,0.04),transparent_38%)]" />
      </div>

      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-7 lg:px-8">
        <div className={`flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center ${M.moduleHeaderNavy}`}>
          <div className={`relative p-5 md:p-6 ${M.dashboardHeroInner}`}>
            <Link href={backHref} className={`mb-4 inline-flex items-center ${M.secondaryBtn} px-4 py-2 text-sm`}>
              ← Back
            </Link>
            <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>{title}</h1>
            {subtitle ? <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>

        {children}
      </section>
    </main>
  );
}
