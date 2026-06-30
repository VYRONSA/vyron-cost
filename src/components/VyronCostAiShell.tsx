"use client";

import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Home,
  LayoutDashboard,
  Lock,
  LogOut,
  Rocket,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import ModuleUpgradeNotice from "@/components/admin/ModuleUpgradeNotice";
import Link from "next/link";
import {
  canAccessRoute,
  getFeatureForRoute,
  getFeatureTooltip,
  isPremiumLocked,
  type FeatureKey,
} from "@/lib/vyron-package-manager";
import { isNavItemActive, vyronNavSections } from "@/lib/vyron-navigation";
import WorkspaceAccessDenied from "@/components/WorkspaceAccessDenied";
import {
  canAccessPath,
  getRequiredPermissionForPath,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";
import { readWorkspaceSession, writeWorkspaceSession, type WorkspaceSession } from "@/lib/vyron-workspace-session";
import { isClientWorkspaceMode, readActiveClient, signOutClientWorkspace, writeActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

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

function isNavItemPackageIncluded(packageName: string, href: string, sectionId: string): boolean {
  return canAccessRoute(packageName, href, sectionId);
}

function blockedFeatureForPath(pathname: string): FeatureKey | null {
  for (const section of navSectionsFromConfig()) {
    for (const item of section.items) {
      if (!isActivePath(pathname, item.href)) continue;
      return getFeatureForRoute(item.href, section.id);
    }
  }
  const direct = getFeatureForRoute(pathname);
  return direct;
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
  const [serverWorkspaceReady, setServerWorkspaceReady] = useState(false);
  const [serverHasWorkspace, setServerHasWorkspace] = useState(false);
  const [activeClient, setActiveClient] = useState<ActiveClient | null>(null);
  const [workspaceSession, setWorkspaceSession] = useState<WorkspaceSession | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const restoreAttemptedRef = useRef(false);

  const effectiveClient = serverWorkspaceReady
    ? serverHasWorkspace
      ? activeClient
      : null
    : activeClient;
  const effectiveWorkspaceMode = Boolean(effectiveClient);

  const sections = useMemo(() => {
    if (isDeveloperArea) return developerSections;

    let visible = navSectionsFromConfig().filter((section) => {
      if (section.id === "developer" && effectiveWorkspaceMode) return false;
      return true;
    });

    if (effectiveWorkspaceMode && workspaceSession) {
      visible = filterNavSections(visible, workspaceSession);
    }

    return visible;
  }, [isDeveloperArea, effectiveClient, effectiveWorkspaceMode, workspaceSession]);

  const showDashboardNav = useMemo(() => {
    if (isDeveloperArea) return false;
    if (!effectiveWorkspaceMode || !workspaceSession) return true;
    return sessionHasPermission(workspaceSession, "dashboard.view");
  }, [isDeveloperArea, effectiveWorkspaceMode, workspaceSession]);

  const accessDenied = useMemo(() => {
    if (isDeveloperArea || !effectiveWorkspaceMode || pathname === "/login") return null;
    if (!workspaceSession) {
      return { pathname, permission: "workspace.session" };
    }
    const required = getRequiredPermissionForPath(pathname);
    if (required && !sessionHasPermission(workspaceSession, required)) {
      return { pathname, permission: required };
    }
    return null;
  }, [isDeveloperArea, effectiveWorkspaceMode, pathname, workspaceSession]);

  const blockedFeature = useMemo(() => {
    if (!effectiveClient?.packageName || isDeveloperArea || pathname.startsWith("/admin")) return null;
    const feature = blockedFeatureForPath(pathname);
    if (!feature) return null;
    if (isPremiumLocked(effectiveClient.packageName, feature)) return feature;
    return null;
  }, [pathname, effectiveClient, isDeveloperArea]);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function refreshClientMode() {
      const client = readActiveClient();
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
        if (!data?.ok) {
          setServerWorkspaceReady(true);
          setServerHasWorkspace(false);
          return;
        }

        const hasServerWorkspace = Boolean(data.hasWorkspaceCookie ?? data.hasActiveClientCookie);
        setServerHasWorkspace(hasServerWorkspace);
        setServerWorkspaceReady(true);

        if (hasServerWorkspace && data.activeClientSummary) {
          writeActiveClient(data.activeClientSummary);
          if (data.hasSessionCookie && data.sessionRole) {
            const summary = data.activeClientSummary;
            const hydratedSession: WorkspaceSession = {
              userId: summary.ownerUserId || `workspace-${summary.id}`,
              email: data.sessionEmail || summary.ownerEmail || summary.companyName,
              firstName: summary.companyName.split(" ")[0] || "Workspace",
              surname: "Owner",
              role: data.sessionRole,
              permissions: {},
            };
            writeWorkspaceSession(hydratedSession);
          }
          if (data.impersonating && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("vyron_developer_impersonation", "1");
          }
          window.dispatchEvent(new Event("vyron-active-client-changed"));
          return;
        }

        if (!hasServerWorkspace) {
          if (!restoreAttemptedRef.current) {
            restoreAttemptedRef.current = true;
            fetch("/api/workspace/restore-session", {
              method: "POST",
              credentials: "include",
              headers: { Accept: "application/json" },
            })
              .then((restoreResponse) => restoreResponse.json())
              .then((restored) => {
                if (restored?.ok) {
                  window.location.reload();
                }
              })
              .catch(() => {
                // ignore restore failure
              });
          }

          setActiveClient(null);
          setClientWorkspaceMode(false);
          setWorkspaceSession(null);
          setSessionEmail(null);
        }
      })
      .catch(() => {
        setServerWorkspaceReady(true);
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
                      const feature = getFeatureForRoute(item.href, section.id);
                      const locked = feature && effectiveClient?.packageName
                        ? isPremiumLocked(effectiveClient.packageName, feature)
                        : false;

                      if (locked) {
                        return (
                          <div
                            key={item.href}
                            title={feature ? getFeatureTooltip(feature) : undefined}
                            className="flex min-w-0 cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold text-[#94A3B8]/80 opacity-60"
                          >
                            <item.icon size={20} className="shrink-0 text-[#94A3B8]" />
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <Lock size={14} className="shrink-0 text-[#94A3B8]" />
                            <span className="shrink-0 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#64748B]">
                              Premium
                            </span>
                          </div>
                        );
                      }

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

          {!isDeveloperArea ? (
            <div className="relative mt-auto shrink-0 border-t border-[#E2E8F0] px-1 pt-4">
              {effectiveWorkspaceMode && effectiveClient ? (
                <div className={`mb-3 ${M.shellClientCard}`}>
                  <div className="truncate text-sm font-bold text-[#0F172A]">{effectiveClient.companyName}</div>
                  <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">
                    {effectiveClient.packageName || "Professional"} Package
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void signOutClientWorkspace()}
                className={`w-full ${M.secondaryBtn} justify-center px-3 py-2 text-xs`}
              >
                <LogOut size={15} />
                Logout / Exit Workspace
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

            {!isDeveloperArea ? (
              <div className="flex shrink-0 items-center gap-2.5 md:gap-3">
                {effectiveClient ? (
                  <div className={`hidden lg:block ${M.shellWorkspaceBadge}`}>
                    <div className="min-w-0 text-right">
                      <div className="truncate text-sm font-bold text-[#0F172A]">{effectiveClient.companyName}</div>
                      <div className="truncate text-[11px] font-medium text-[#64748B]">
                        {effectiveClient.packageName || "Professional"} Package
                        {sessionEmail ? ` · ${sessionEmail}` : effectiveClient.ownerEmail ? ` · ${effectiveClient.ownerEmail}` : ""}
                      </div>
                    </div>
                  </div>
                ) : null}
                <Link href="/dashboard" className={`${M.primaryBtn} h-10 shrink-0 px-4 text-sm`}>
                  <Home size={17} />
                  <span className="hidden sm:inline">Command Centre</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void signOutClientWorkspace()}
                  className={`${M.shellTopbarBtn} gap-2`}
                >
                  <LogOut size={17} />
                  <span className="hidden sm:inline">Logout / Exit Workspace</span>
                </button>
              </div>
            ) : (
              <Link href="/dashboard" className={`${M.primaryBtn} h-10 shrink-0 px-4 text-sm`}>
                <Home size={17} />
                <span className="hidden sm:inline">Back to VYRON COST App</span>
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
              ) : blockedFeature && effectiveClient ? (
                <ModuleUpgradeNotice packageName={effectiveClient.packageName} feature={blockedFeature} />
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
