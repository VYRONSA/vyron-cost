"use client";

import {
  ArrowLeft,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Factory,
  FileText,
  Home,
  LayoutDashboard,
  Mail,
  Package,
  PackageCheck,
  Search,
  Target,
  Users,
  GraduationCap,
  Rocket,
  Settings,
  ReceiptText,
  Link2,
  RefreshCcw,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import ActiveWorkspaceGuard from "@/components/ActiveWorkspaceGuard";

const SIDEBAR_WIDTH = "292px";

const sections = [
  {
    title: "Demo",
    items: [
      { label: "Command Centre", href: "/dashboard", icon: LayoutDashboard },
      { label: "Recovery Intelligence", href: "/financial-leakage", icon: Target },
    ],
  },
  {
    title: "Costing",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Users },
      { label: "Ingredients", href: "/ingredients", icon: PackageCheck },
      { label: "Recipes & BOM", href: "/recipes", icon: Boxes },
      { label: "Products", href: "/products", icon: Package },
    ],
  },
  {
    title: "Manufacturing",
    items: [
      { label: "Manufacturing Dashboard", href: "/manufacturing", icon: Factory },
      { label: "Manufacturing History", href: "/manufacturing/history", icon: ClipboardList },
      { label: "Production Runs", href: "/manufacturing/runs", icon: ClipboardList },
      { label: "Finished Goods", href: "/manufacturing/finished-goods", icon: Package },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Inventory Intelligence", href: "/inventory-intelligence", icon: Package },
      { label: "Product Intelligence", href: "/reports/product-intelligence", icon: Target },
    ],
  },
  {
    title: "Customers",
    items: [
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Customer Invoices", href: "/customer-invoices", icon: ReceiptText },
      { label: "Customer Statements", href: "/customer-statements", icon: FileText },
      { label: "Customer Intelligence", href: "/customer-intelligence", icon: Target },
    ],
  },
  {
    title: "Accounting",
    items: [
      { label: "Xero Integration", href: "/integrations/xero", icon: Link2 },
      { label: "Xero Setup", href: "/integrations/xero/setup", icon: Settings },
      { label: "Sync Centre", href: "/integrations/xero/sync-centre", icon: RefreshCcw },
    ],
  },
  {
    title: "Procurement",
    items: [
      { label: "PO Dashboard", href: "/purchase-orders", icon: ClipboardList },
      { label: "PO List", href: "/purchase-orders/list", icon: ClipboardList },
      { label: "PO Approvals", href: "/purchase-orders/approvals", icon: ClipboardList },
      { label: "Back Orders", href: "/purchase-orders/back-orders", icon: Package },
      { label: "PO Settings", href: "/purchase-orders/settings", icon: Settings },
      { label: "Goods Receipts", href: "/goods-receipts", icon: Package },
      { label: "Document Intelligence", href: "/document-intelligence", icon: FileText },
      { label: "Supplier Learning", href: "/document-intelligence/supplier-learning", icon: GraduationCap },
      { label: "Price History", href: "/document-intelligence/price-history/supplier", icon: Search },
      { label: "DI Settings", href: "/document-intelligence/settings", icon: Settings },
      { label: "Email Inbox", href: "/email-invoice-inbox", icon: Mail },
      { label: "Procurement Intelligence", href: "/invoice-forensics", icon: Target },
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "Stock Counts", href: "/inventory/counts", icon: ClipboardList },
      { label: "Reports", href: "/reports", icon: FileText },
      { label: "Stock Ledger", href: "/inventory/ledger", icon: Boxes },
    ],
  },
  {
    title: "System",
    items: [{ label: "Training", href: "/training", icon: GraduationCap }],
  },
];

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 via-purple-700 to-fuchsia-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.45)]">
        <div className="absolute inset-0 rounded-3xl bg-white/10" />
        <div className="relative flex gap-0.5">
          <span className="block h-8 w-3 rotate-[-24deg] rounded-full bg-white/95" />
          <span className="block h-8 w-3 rotate-[24deg] rounded-full bg-slate-950/65" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-black tracking-[0.32em] text-white">VYRON</div>
        <div className="-mt-1 text-sm font-black tracking-[0.46em] text-fuchsia-300">COST</div>
      </div>
    </Link>
  );
}

export default function VyronCostAiShell({
  title,
  subtitle,
  children,
  hidePageHeader = false,
  fullWidthMain = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  hidePageHeader?: boolean;
  fullWidthMain?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({
    Demo: true,
    Costing: true,
    Manufacturing: true,
    Intelligence: true,
    Customers: true,
    Accounting: true,
    Procurement: true,
    System: true,
  });

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fbf5ff_0%,#f8fbff_38%,#ffffff_100%)] text-slate-950 xl:grid xl:grid-cols-[292px_minmax(0,1fr)]"
      style={{ ["--vyron-sidebar-width" as string]: SIDEBAR_WIDTH }}
    >
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[292px] shrink-0 bg-[#09031f] px-4 py-5 text-white shadow-[18px_0_50px_rgba(76,29,149,0.16)] xl:relative xl:z-30 xl:block xl:h-screen xl:overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.24),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.22),transparent_45%)]" />
        <style jsx>{`
          .vyron-sidebar-scroll::-webkit-scrollbar { width: 6px; }
          .vyron-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
          .vyron-sidebar-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, rgba(168,85,247,0.75), rgba(217,70,239,0.75));
            border-radius: 999px;
          }
          .vyron-sidebar-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, rgba(168,85,247,1), rgba(217,70,239,1));
          }
          .vyron-sidebar-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(168,85,247,0.75) transparent;
          }
        `}</style>

        <div className="relative flex h-full flex-col">
          <div className="px-2 py-2"><Logo /></div>
          <nav className="vyron-sidebar-scroll mt-7 flex-1 overflow-y-auto pr-2">
            {sections.map((section) => (
              <div key={section.title} className="mb-6">
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [section.title]: !s[section.title] }))}
                  className="mb-2 flex w-full items-center justify-between rounded-2xl px-3 py-2"
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-300/85">{section.title}</span>
                  {open[section.title] ? <ChevronDown size={17} className="text-white/50" /> : <ChevronRight size={17} className="text-white/50" />}
                </button>

                {open[section.title] && (
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
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

          <div className="mt-4 rounded-3xl bg-gradient-to-br from-violet-700/75 to-fuchsia-600/75 p-4 shadow-[0_18px_45px_rgba(168,85,247,0.22)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <Rocket className="text-fuchsia-100" size={26} />
              </div>
              <div>
                <div className="font-black">Demo Status</div>
                <div className="text-xs font-semibold text-fuchsia-100">Client-ready navigation</div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-300 to-fuchsia-200" />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-violet-100/70 bg-white/90 px-4 py-4 backdrop-blur-xl md:px-8">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
            <button type="button" onClick={() => router.back()} className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm">
              <ArrowLeft size={18} />
              Back
            </button>
            <div className="hidden min-w-0 max-w-xl flex-1 items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm md:flex">
              <Search size={18} className="shrink-0 text-violet-700" />
              <input className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" placeholder="Search anything..." />
              <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-400">⌘K</span>
            </div>
            <Link href="/dashboard" className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/20">
              <Home size={17} />
              <span className="hidden sm:inline">Command Centre</span>
            </Link>
          </div>
        </header>

        <main className={`min-w-0 flex-1 ${fullWidthMain ? "px-0 py-0" : "px-4 py-7 md:px-8"}`}>
          <div className={`mx-auto w-full ${fullWidthMain ? "" : "max-w-[1600px]"}`}>
            {!hidePageHeader ? (
              <section className="relative mb-7 overflow-hidden rounded-[2rem] border border-violet-100 bg-white p-7 shadow-[0_18px_60px_rgba(76,29,149,0.07)]">
                <div className="pointer-events-none absolute right-12 top-8 text-2xl text-fuchsia-500">✦</div>
                <div className="pointer-events-none absolute left-32 top-5 text-lg text-amber-400">✧</div>
                <h1 className="relative text-4xl font-black tracking-[-0.04em] text-slate-950 md:text-6xl">{title}</h1>
                {subtitle && <p className="relative mt-3 max-w-4xl text-base font-black uppercase tracking-[0.12em] text-violet-700">{subtitle}</p>}
              </section>
            ) : null}
            <ActiveWorkspaceGuard />
            <div className={`flex min-w-0 flex-col ${fullWidthMain ? "" : "gap-6"}`}>{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
