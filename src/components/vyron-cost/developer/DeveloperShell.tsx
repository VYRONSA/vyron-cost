"use client";

import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Home,
  Rocket,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

const SIDEBAR_WIDTH = "292px";

const sections = [
  {
    title: "Platform Control",
    items: [
      { label: "Developer Centre", href: "/developer", icon: Rocket },
      { label: "Client Directory", href: "/developer/clients", icon: Users },
      { label: "Client Setup", href: "/developer/setup", icon: Settings },
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
      <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 via-purple-700 to-fuchsia-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.45)]">
        <div className="absolute inset-0 rounded-3xl bg-white/10" />
        <Building2 className="relative" size={28} />
      </div>
      <div>
        <div className="text-2xl font-black tracking-[0.32em] text-white">VYRON</div>
        <div className="-mt-1 text-sm font-black tracking-[0.46em] text-fuchsia-300">DEV</div>
      </div>
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
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fbf5ff_0%,#f8fbff_38%,#ffffff_100%)] text-slate-950 xl:grid xl:grid-cols-[292px_minmax(0,1fr)]"
      style={{ ["--vyron-sidebar-width" as string]: SIDEBAR_WIDTH }}
    >
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[292px] shrink-0 bg-[#09031f] px-4 py-5 text-white shadow-[18px_0_50px_rgba(76,29,149,0.16)] xl:relative xl:z-30 xl:block xl:h-screen xl:overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.24),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.22),transparent_45%)]" />
        <div className="relative flex h-full flex-col">
          <div className="px-2 py-2">
            <Logo />
          </div>
          <nav className="mt-7 flex-1 overflow-y-auto pr-2">
            {sections.map((section) => (
              <div key={section.title} className="mb-6">
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [section.title]: !s[section.title] }))}
                  className="mb-2 flex w-full items-center justify-between rounded-2xl px-3 py-2"
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-300/85">
                    {section.title}
                  </span>
                  {open[section.title] ? (
                    <ChevronDown size={17} className="text-white/50" />
                  ) : (
                    <ChevronRight size={17} className="text-white/50" />
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
                            "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition",
                            active
                              ? "bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/25"
                              : "text-white/75 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <item.icon size={19} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-violet-100/70 bg-white/90 px-4 py-4 backdrop-blur-xl md:px-8">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm"
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20"
            >
              <Home size={17} />
              <span className="hidden sm:inline">Back to VYRON COST App</span>
            </Link>
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
