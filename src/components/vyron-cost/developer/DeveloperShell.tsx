"use client";

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Home,
  LogOut,
  Rocket,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import { VyronLogoLockup } from "@/components/vyron-ui/VyronLogo";

const M = VYRON_MASTER;
const SIDEBAR_WIDTH = "292px";

async function exitDeveloper() {
  try {
    await fetch("/api/platform-auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Continue redirect even if server logout fails.
  }
  window.location.href = "/landing";
}

const sections = [
  {
    title: "Platform Control",
    items: [
      { label: "Developer Centre", href: "/developer", icon: Rocket },
      { label: "Client Directory", href: "/developer/clients", icon: Users },
      { label: "Client Setup", href: "/developer/setup", icon: Settings },
      { label: "Deployment Readiness", href: "/deployment-readiness", icon: Shield },
      { label: "Back to VYRON COST App", href: "/dashboard", icon: Home },
    ],
  },
];

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function Logo() {
  return (
    <Link href="/developer" className="flex items-center gap-3">
      <VyronLogoLockup variant="onLight" size={56} suffix="DEV" />
    </Link>
  );
}

export default function DeveloperShell({
  children,
  hidePageHeader = true,
}: {
  children: ReactNode;
  hidePageHeader?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({
    "Platform Control": true,
  });

  return (
    <div
      className={`min-h-screen ${M.page} xl:grid xl:grid-cols-[292px_minmax(0,1fr)]`}
      style={{ ["--vyron-sidebar-width" as string]: SIDEBAR_WIDTH }}
    >
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen w-[292px] shrink-0 flex-col overflow-hidden border-r border-[#E2E8F0] bg-white px-4 py-5 shadow-[4px_0_24px_rgba(15,23,42,0.04)] xl:relative xl:z-30 xl:block">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(29,107,255,0.04),transparent_42%)]" />
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="shrink-0 px-2 py-2">
            <Logo />
          </div>
          <nav className="mt-7 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-8 pr-2">
            {sections.map((section) => (
              <div key={section.title} className="mb-6">
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [section.title]: !s[section.title] }))}
                  className="mb-2 flex w-full items-center justify-between rounded-2xl px-3 py-2"
                >
                  <span className={M.navSectionLabel}>{section.title}</span>
                  {open[section.title] ? (
                    <ChevronDown size={17} className="text-[#94A3B8]" />
                  ) : (
                    <ChevronRight size={17} className="text-[#94A3B8]" />
                  )}
                </button>

                {open[section.title] && (
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active =
                        item.href === "/developer"
                          ? pathname === "/developer"
                          : pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition",
                            active ? M.navActiveDashboard : M.navInactive
                          )}
                        >
                          <item.icon size={19} className={active ? "text-white" : "text-[#1D6BFF]"} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="relative mt-auto shrink-0 border-t border-[#E2E8F0] px-1 pt-4">
            <button
              type="button"
              onClick={() => void exitDeveloper()}
              className={`w-full ${M.secondaryBtn} justify-center px-3 py-2 text-xs`}
            >
              <LogOut size={15} />
              Exit Developer
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className={M.shellTopbar}>
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4 md:px-8">
            <button type="button" onClick={() => router.back()} className={`${M.shellTopbarBtn} gap-2`}>
              <ArrowLeft size={18} />
              Back
            </button>
            <Link href="/dashboard" className={`${M.primaryBtn} h-10 px-5 text-sm`}>
              <Home size={17} />
              <span className="hidden sm:inline">Back to VYRON COST App</span>
            </Link>
            <button
              type="button"
              onClick={() => void exitDeveloper()}
              className={`${M.shellTopbarBtn} gap-2`}
            >
              <LogOut size={17} />
              <span className="hidden sm:inline">Exit Developer</span>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-7 md:px-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {!hidePageHeader ? null : null}
            <div className="flex min-w-0 flex-col gap-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
