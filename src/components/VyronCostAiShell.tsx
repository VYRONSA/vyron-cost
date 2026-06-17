"use client";

import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Home,
  LayoutDashboard,
  LogOut,
  Rocket,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import ModuleUpgradeNotice from "@/components/admin/ModuleUpgradeNotice";
import Link from "next/link";
import { isModuleIncluded, type PackageModuleKey } from "@/lib/vyron-package-modules";
import { isNavItemActive, vyronNavSections } from "@/lib/vyron-navigation";
import WorkspaceAccessDenied from "@/components/WorkspaceAccessDenied";
import {
  canAccessPath,
  getRequiredPermissionForPath,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";
import { readWorkspaceSession, writeWorkspaceSession, type WorkspaceSession } from "@/lib/vyron-workspace-session";
import { isClientWorkspaceMode, isPlatformAdminImpersonating, readActiveClient, signOutClientWorkspace, type ActiveClient } from "@/lib/vyron-developer-client";
import { syncActiveClientCookie } from "@/lib/vyron-workspace-context";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import { VYRON_MAX_WIDTH, VYRON_PAGE_PADDING } from "@/components/vyron-ui/constants";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

const SIDEBAR_WIDTH = "330px";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

const dashboardNavItem: NavItem = { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard };

/** Maps vyron-navigation section ids to package module keys (unchanged gating rules). */
const NAV_SECTION_PACKAGE_MAP: Record<string, PackageModuleKey> = {
  suppliers: "suppliers",
  costing: "costing",
  procurement: "procurement",
  inventory: "inventory",
  manufacturing: "manufacturing",
  customers: "customers",
  accounting: "accounting",
  reports: "reports",
  executive: "intelligence",
  admin: "dashboard",
};

/** Per-route package keys for V1 modules inside mixed sections (e.g. OPERATIONS). */
const NAV_ITEM_PACKAGE_MAP: Record<string, PackageModuleKey> = {
  "/dashboard": "dashboard",
  "/suppliers": "suppliers",
  "/supplier-intelligence": "suppliers",
  "/supplier-inflation": "suppliers",
  "/document-intelligence": "suppliers",
  "/document-intelligence/supplier-learning": "suppliers",
  "/document-intelligence/price-history/supplier": "suppliers",
  "/document-intelligence/settings": "suppliers",
  "/email-invoice-inbox": "suppliers",
  "/ingredients": "costing",
  "/products": "costing",
  "/recipes": "costing",
  "/purchase-orders": "procurement",
  "/purchase-orders/list": "procurement",
  "/purchase-orders/approvals": "procurement",
  "/purchase-orders/back-orders": "procurement",
  "/purchase-orders/settings": "procurement",
  "/goods-receipts": "procurement",
  "/inventory": "inventory",
  "/inventory/stock": "inventory",
  "/inventory/ledger": "inventory",
  "/inventory/counts": "inventory",
  "/inventory/alerts": "inventory",
  "/inventory-intelligence": "inventory",
  "/manufacturing": "manufacturing",
  "/manufacturing/runs": "manufacturing",
  "/manufacturing/history": "manufacturing",
  "/manufacturing/finished-goods": "manufacturing",
  "/customers": "customers",
  "/customer-invoices": "customers",
  "/integrations/xero": "accounting",
  "/reports": "reports",
  "/executive-boardroom": "intelligence",
  "/cost-intelligence": "intelligence",
  "/business-health": "intelligence",
  "/early-warning": "intelligence",
  "/predictive-risk": "intelligence",
  "/root-cause": "intelligence",
  "/decisions": "intelligence",
  "/actions": "intelligence",
  "/autonomous-command-centre": "intelligence",
  "/ask-vyron": "intelligence",
  "/execution-centre": "intelligence",
  "/ai-cost-intelligence": "intelligence",
  "/admin/company-setup": "dashboard",
  "/admin/users": "dashboard",
  "/admin/imports": "dashboard",
  "/deployment-readiness": "dashboard",
};

function navSectionsFromConfig(): NavSection[] {
  return vyronNavSections.map((section) => ({
    id: section.id,
    title: section.section,
    items: section.items.map((item) => ({
      label: item.label,
      href: item.href,
      icon: item.icon,
    })),
  }));
}

function resolveNavItemPackageModule(href: string, sectionId: string): PackageModuleKey | null {
  if (NAV_ITEM_PACKAGE_MAP[href]) return NAV_ITEM_PACKAGE_MAP[href];

  const prefixes = Object.entries(NAV_ITEM_PACKAGE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, moduleKey] of prefixes) {
    if (href === prefix || href.startsWith(`${prefix}/`)) return moduleKey;
  }

  return NAV_SECTION_PACKAGE_MAP[sectionId] || null;
}

function isNavItemPackageIncluded(packageName: string, href: string, sectionId: string): boolean {
  const moduleKey = resolveNavItemPackageModule(href, sectionId);
  if (!moduleKey) return true;
  return isModuleIncluded(packageName, moduleKey);
}

function blockedModuleKeyForHref(href: string, sectionId: string): PackageModuleKey | null {
  return resolveNavItemPackageModule(href, sectionId);
}

function filterNavItems(items: NavItem[], session: WorkspaceSession | null) {
  if (!session) return items;
  return items.filter((item) => canAccessPath(item.href, session));
}

function filterNavSections(sections: NavSection[], session: WorkspaceSession | null) {
  if (!session) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: filterNavItems(section.items, session),
    }))
    .filter((section) => section.items.length > 0);
}

const developerSections: NavSection[] = [
  {
    id: "platform-control",
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

const activeNavClass = M.navActive;
const dashboardActiveClass = M.navActiveDashboard;
const inactiveNavClass = M.navInactive;

function isActivePath(pathname: string, href: string) {
  if (href === "/developer") return pathname === "/developer";
  return isNavItemActive(pathname, href);
}

function Logo({ developer }: { developer: boolean }) {
  return (
    <Link href={developer ? "/developer" : "/dashboard"} className="flex items-center gap-3">
      <div className={`relative flex h-14 w-14 items-center justify-center rounded-3xl ${M.iconEmphasis}`}>
        {developer ? <Building2 size={30} className="relative text-white" /> : (
          <div className="relative flex gap-0.5">
            <span className="block h-8 w-3 rotate-[-24deg] rounded-full bg-white/95" />
            <span className="block h-8 w-3 rotate-[24deg] rounded-full bg-[#07111F]/80" />
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-black tracking-[0.32em] text-[#0F172A]">VYRON</div>
        <div className="-mt-1 text-sm font-black tracking-[0.46em] text-[#7C3AED]">{developer ? "DEV" : "COST"}</div>
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
  const isDeveloperArea = pathname.startsWith("/developer");
  const [clientWorkspaceMode, setClientWorkspaceMode] = useState(false);
  const [activeClient, setActiveClient] = useState<ActiveClient | null>(null);
  const [workspaceSession, setWorkspaceSession] = useState<WorkspaceSession | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [serverWorkspaceReady, setServerWorkspaceReady] = useState(false);

  const hasWorkspaceContext = Boolean(activeClient) || serverWorkspaceReady;
  const exitWorkspaceLabel = activeClient?.impersonating || isPlatformAdminImpersonating()
    ? "Exit Client Workspace"
    : "Logout";

  const sections = useMemo(() => {
    if (isDeveloperArea) return developerSections;

    let visible = navSectionsFromConfig().filter((section) => {
      if (section.id === "developer" && clientWorkspaceMode) return false;
      return true;
    });

    if (activeClient?.packageName) {
      visible = visible
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            isNavItemPackageIncluded(activeClient.packageName, item.href, section.id)
          ),
        }))
        .filter((section) => section.items.length > 0);
    }

    if (clientWorkspaceMode && workspaceSession) {
      visible = filterNavSections(visible, workspaceSession);
    }

    return visible;
  }, [isDeveloperArea, activeClient, clientWorkspaceMode, workspaceSession]);

  const showDashboardNav = useMemo(() => {
    if (isDeveloperArea) return false;
    if (!clientWorkspaceMode || !workspaceSession) return true;
    return sessionHasPermission(workspaceSession, "dashboard.view");
  }, [isDeveloperArea, clientWorkspaceMode, workspaceSession]);

  const accessDenied = useMemo(() => {
    if (isDeveloperArea || !clientWorkspaceMode || pathname === "/login") return null;
    if (!workspaceSession) {
      return { pathname, permission: "workspace.session" };
    }
    const required = getRequiredPermissionForPath(pathname);
    if (required && !sessionHasPermission(workspaceSession, required)) {
      return { pathname, permission: required };
    }
    return null;
  }, [isDeveloperArea, clientWorkspaceMode, pathname, workspaceSession]);

  const blockedModule = useMemo(() => {
    if (!activeClient?.packageName || isDeveloperArea || pathname.startsWith("/admin")) return null;
    for (const section of navSectionsFromConfig()) {
      for (const item of section.items) {
        const moduleKey = blockedModuleKeyForHref(item.href, section.id);
        if (!moduleKey) continue;
        if (isActivePath(pathname, item.href)) {
          if (!isNavItemPackageIncluded(activeClient.packageName, item.href, section.id)) {
            return moduleKey;
          }
        }
      }
    }
    return null;
  }, [pathname, activeClient, isDeveloperArea]);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function refreshClientMode() {
      const client = readActiveClient();
      if (client) {
        syncActiveClientCookie(client);
        const session = readWorkspaceSession();
        if (session) writeWorkspaceSession(session);
      }
      setActiveClient(client);
      setClientWorkspaceMode(isClientWorkspaceMode());
      const session = readWorkspaceSession();
      setWorkspaceSession(session);
      setSessionEmail(session?.email || client?.ownerEmail || null);
    }
    refreshClientMode();
    window.addEventListener("vyron-active-client-changed", refreshClientMode);
    window.addEventListener("storage", refreshClientMode);
    return () => {
      window.removeEventListener("vyron-active-client-changed", refreshClientMode);
      window.removeEventListener("storage", refreshClientMode);
    };
  }, []);

  useEffect(() => {
    if (isDeveloperArea) return;

    fetch("/api/workspace/status", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.ok) return;
        setServerWorkspaceReady(Boolean(data.hasActiveClientCookie));
      })
      .catch(() => {
        // ignore status probe failure
      });
  }, [isDeveloperArea, pathname]);

  useEffect(() => {
    if (isDeveloperArea) return;

    for (const section of sections) {
      const hasActiveChild = section.items.some((item) => isActivePath(pathname, item.href));
      if (hasActiveChild) {
        setOpen({ [section.title]: true });
        return;
      }
    }
  }, [pathname, sections, isDeveloperArea]);

  function toggleSection(title: string) {
    setOpen((current) => {
      const isCurrentlyOpen = current[title] === true;

      if (isCurrentlyOpen) {
        return {};
      }

      return { [title]: true };
    });
  }

  return (
    <div className={M.shellRoot} style={{ ["--vyron-sidebar-width" as string]: SIDEBAR_WIDTH }}>
      <style jsx global>{`
        nav.vyron-sidebar-nav::-webkit-scrollbar { width: 6px; }
        nav.vyron-sidebar-nav::-webkit-scrollbar-track { background: transparent; }
        nav.vyron-sidebar-nav::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(124,58,237,0.45), rgba(225,29,72,0.35));
          border-radius: 999px;
        }
        nav.vyron-sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(124,58,237,0.65), rgba(225,29,72,0.5));
        }
      `}</style>
      <aside className={M.shellSidebar}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.04),transparent_42%)]" />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2 py-2">
            <Logo developer={isDeveloperArea} />
          </div>

          <nav className="vyron-sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-3">
            {!isDeveloperArea && showDashboardNav ? (
              <div className="mb-7">
                <Link
                  href={dashboardNavItem.href}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-bold transition",
                    isActivePath(pathname, dashboardNavItem.href) ? dashboardActiveClass : inactiveNavClass
                  )}
                >
                  <dashboardNavItem.icon
                    size={20}
                    className={isActivePath(pathname, dashboardNavItem.href) ? "text-white" : "text-[#7C3AED]"}
                  />
                  <span className="min-w-0 flex-1 truncate">{dashboardNavItem.label}</span>
                </Link>
              </div>
            ) : null}

            {sections.map((section) => (
              <div key={section.id} className="mb-7">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="mb-2.5 flex w-full min-w-0 items-center justify-between rounded-xl px-3 py-2"
                >
                  <span className={`min-w-0 flex-1 truncate text-left ${M.navSectionLabel}`}>{section.title}</span>
                  {open[section.title] === true ? (
                    <ChevronDown size={16} className="shrink-0 text-[#94A3B8]" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-[#94A3B8]" />
                  )}
                </button>

                {open[section.title] === true ? (
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active = isActivePath(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold transition",
                            active ? activeNavClass : inactiveNavClass
                          )}
                        >
                          <item.icon size={20} className={active ? "text-[#7C3AED]" : "text-[#64748B]"} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          {clientWorkspaceMode && !isDeveloperArea && activeClient ? (
            <div className="relative mt-auto shrink-0 border-t border-[#E2E8F0] px-1 pt-4">
              <div className={M.shellClientCard}>
                <div className="truncate text-sm font-bold text-[#0F172A]">{activeClient.companyName}</div>
                <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">
                  {activeClient.packageName || "Professional"} Package
                </div>
                <button
                  type="button"
                  onClick={() => void signOutClientWorkspace()}
                  className={`mt-3 w-full ${M.secondaryBtn} justify-center px-3 py-2 text-xs`}
                >
                  <LogOut size={15} />
                  {exitWorkspaceLabel}
                </button>
              </div>
            </div>
          ) : hasWorkspaceContext && !isDeveloperArea ? (
            <div className="relative mt-auto shrink-0 border-t border-[#E2E8F0] px-1 pt-4">
              <button
                type="button"
                onClick={() => void signOutClientWorkspace()}
                className={`w-full ${M.secondaryBtn} justify-center px-3 py-2 text-xs`}
              >
                <LogOut size={15} />
                {exitWorkspaceLabel}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="vyron-cost-shell-main relative z-0 ml-[330px] min-w-0 h-screen overflow-y-auto overflow-x-hidden">
        <header className={M.shellTopbar}>
          <div className={`mx-auto flex h-14 w-full ${VYRON_MAX_WIDTH} items-center gap-3 ${VYRON_PAGE_PADDING} md:gap-4`}>
            <button type="button" onClick={() => router.back()} className={M.shellTopbarBtn}>
              ← Back
            </button>

            {!isDeveloperArea ? (
              <div className={M.shellSearch}>
                <Search size={17} className="shrink-0 text-[#64748B]" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#0F172A] outline-none placeholder:text-[#64748B]"
                  placeholder="Search anything..."
                />
                <span className="shrink-0 rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-xs font-semibold text-[#64748B]">
                  ⌘K
                </span>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {hasWorkspaceContext && !isDeveloperArea ? (
              <div className="flex shrink-0 items-center gap-2.5 md:gap-3">
                {activeClient ? (
                  <div className={M.shellWorkspaceBadge}>
                    <div className="min-w-0 text-right">
                      <div className="truncate text-sm font-bold text-[#0F172A]">{activeClient.companyName}</div>
                      <div className="truncate text-[11px] font-medium text-[#64748B]">
                        {activeClient.packageName || "Professional"} Package
                        {sessionEmail ? ` · ${sessionEmail}` : activeClient.ownerEmail ? ` · ${activeClient.ownerEmail}` : ""}
                      </div>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void signOutClientWorkspace()}
                  className={`${M.shellTopbarBtn} gap-2`}
                >
                  <LogOut size={17} />
                  <span className="hidden sm:inline">{exitWorkspaceLabel}</span>
                </button>
              </div>
            ) : (
              <Link href="/dashboard" className={`${M.primaryBtn} h-10 shrink-0 px-4 text-sm`}>
                <Home size={17} />
                <span className="hidden sm:inline">{isDeveloperArea ? "Back to VYRON COST App" : "Command Centre"}</span>
              </Link>
            )}
          </div>
        </header>

        <main className={`min-w-0 w-full max-w-full flex-1 overflow-x-hidden ${fullWidthMain ? "px-0 py-0" : "py-5"}`}>
          <div className={`mx-auto min-w-0 w-full max-w-full ${fullWidthMain ? "" : `${VYRON_MAX_WIDTH} ${VYRON_PAGE_PADDING}`}`}>
            {!hidePageHeader ? (
              <section className={M.shellPageHeader}>
                <h1 className={`relative break-words text-3xl text-balance md:text-4xl ${M.heading}`}>{title}</h1>
                {subtitle && (
                  <p className={`relative mt-2 max-w-4xl break-words text-sm font-semibold uppercase tracking-[0.1em] ${M.muted}`}>
                    {subtitle}
                  </p>
                )}
              </section>
            ) : null}
            <div className={`flex min-w-0 w-full max-w-full flex-col ${fullWidthMain ? "" : "gap-4"}`}>
              {accessDenied ? (
                <WorkspaceAccessDenied pathname={accessDenied.pathname} permission={accessDenied.permission} />
              ) : blockedModule && activeClient ? (
                <ModuleUpgradeNotice packageName={activeClient.packageName} moduleKey={blockedModule} />
              ) : (
                children
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
