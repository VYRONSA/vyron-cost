"use client";

import {
  ArrowLeft,
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  PremiumMobileBottomSheet,
  PremiumMobileButton,
  PremiumMobileCard,
  PremiumMobileExecutiveHeader,
  PremiumMobileModuleTile,
  PremiumMobileStickyActionBar,
  PremiumMobileStatusBadge,
} from "@/components/vyron-mobile/design-system";
import { MOBILE_TOKENS, MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system";
import VyronMobileProcurementWorkspace from "@/components/vyron-mobile/experience/VyronMobileProcurementWorkspace";
import VyronMobilePurchaseOrdersWorkspace from "@/components/vyron-mobile/experience/VyronMobilePurchaseOrdersWorkspace";
import VyronMobileFinishedGoodsWorkspace from "@/components/vyron-mobile/experience/VyronMobileFinishedGoodsWorkspace";
import VyronMobileRecordExperience from "@/components/vyron-mobile/experience/VyronMobileRecordExperience";
import {
  mobileBottomNavItems,
  mobileMoreLinks,
  mobileQuickCreateActions,
} from "@/components/vyron-mobile/vyron-mobile-navigation";
import {
  isPlatformAdminImpersonating,
  readActiveClient,
  signOutClientWorkspace,
  type ActiveClient,
} from "@/lib/vyron-developer-client";
import { isNavItemActive } from "@/lib/vyron-navigation";

type SheetKind = "workspace" | "create" | "more" | null;

type StickyAction = {
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
};

function MobileNavButton({
  href,
  label,
  active,
  icon: Icon,
  onClick,
  accent = false,
}: {
  href?: string;
  label: string;
  active?: boolean;
  icon: React.ElementType;
  onClick?: () => void;
  accent?: boolean;
}) {
  const className = accent
    ? "-mt-8 flex h-16 w-16 items-center justify-center rounded-[1.8rem] border border-[#D8B24A]/70 bg-[#C79A2B] text-white shadow-[0_18px_40px_rgba(199,154,43,0.4)]"
    : `flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-2xl transition ${
        active ? "text-[#07111F]" : "text-slate-400"
      }`;

  const content = (
    <>
      <Icon size={accent ? 24 : 20} strokeWidth={accent ? 2.2 : 2} />
      {!accent ? <span className="text-[10px] font-black uppercase tracking-[0.16em]">{label}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {content}
    </button>
  );
}

function WorkspaceSwitcherButton({ client, onOpen }: { client: ActiveClient | null; onOpen: () => void }) {
  const workspaceName = client?.tradingName || client?.companyName || "VYRON COST";
  const workspaceMeta = client?.packageName || "Workspace";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${MOBILE_TYPOGRAPHY.family} flex min-w-0 w-full items-center gap-3 rounded-[1.4rem] border border-white/70 bg-white/85 px-3 py-3 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#07111F] text-white shadow-[0_10px_24px_rgba(7,17,31,0.2)]">
        <Building2 size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black tracking-[-0.02em] text-slate-950">{workspaceName}</div>
        <div className="truncate text-[11px] font-semibold text-slate-500">{workspaceMeta}</div>
      </div>
      <ChevronDown size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}

function WorkspaceSheet({
  open,
  onClose,
  workspaceName,
  activeClient,
}: {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  activeClient: ActiveClient | null;
}) {
  return (
    <PremiumMobileBottomSheet title="Workspace" open={open} onClose={onClose}>
      <div className="space-y-3">
        <PremiumMobileCard tone="muted" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Current workspace</div>
          <div className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">{workspaceName}</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">{activeClient?.packageName || "Professional"}</div>
          {activeClient?.ownerEmail ? <div className="mt-1 text-sm font-semibold text-slate-500">{activeClient.ownerEmail}</div> : null}
          <div className="mt-3">
            <PremiumMobileStatusBadge label="approved" tone="approved" />
          </div>
        </PremiumMobileCard>

        <div className="grid gap-2 sm:grid-cols-2">
          <PremiumMobileButton href="/dashboard" fullWidth>
            Command Centre
          </PremiumMobileButton>
          <PremiumMobileButton href="/developer/clients" variant="secondary" fullWidth>
            Switch Workspace
          </PremiumMobileButton>
        </div>

        {isPlatformAdminImpersonating() ? (
            <PremiumMobileButton
            variant="danger"
            fullWidth
            onClick={() => {
              void signOutClientWorkspace();
            }}
          >
            <LogOut size={16} />
            Exit Workspace
          </PremiumMobileButton>
        ) : null}
      </div>
    </PremiumMobileBottomSheet>
  );
}

function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PremiumMobileBottomSheet title="Executive Command" open={open} onClose={onClose}>
      <div className="grid gap-3">
        {mobileQuickCreateActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-4 rounded-[1.4rem] border border-slate-100 bg-slate-50 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#07111F] text-white">
                <Icon size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-950">{action.label}</div>
                <div className="text-xs font-semibold text-slate-500">{action.detail}</div>
              </div>
              <div className="rounded-full border border-[#E4CF98] bg-[#FFF8E9] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#AA7B16]">
                Run
              </div>
            </Link>
          );
        })}
      </div>
    </PremiumMobileBottomSheet>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PremiumMobileBottomSheet title="More" open={open} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        {mobileMoreLinks.map((item) => (
          <PremiumMobileModuleTile
            key={item.href}
            href={item.href}
            title={item.label}
            description={item.description}
            icon={item.icon}
            eyebrow="Open"
          />
        ))}
      </div>
    </PremiumMobileBottomSheet>
  );
}

function MobileScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <section className="px-4 pb-1 pt-1 sm:px-5">
      <PremiumMobileCard tone="default" className="p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Module</div>
            <div className="truncate text-lg font-black tracking-[-0.03em] text-slate-950">{title}</div>
          </div>
          <PremiumMobileButton href="/ask-vyron" variant="secondary" size="compact">
            Search
          </PremiumMobileButton>
        </div>
      </PremiumMobileCard>
    </section>
  );
}

export default function VyronMobileShell({
  title,
  subtitle,
  mode = "mobile",
  children,
  stickyActions = [],
}: {
  title: string;
  subtitle?: string;
  mode?: "mobile" | "tablet";
  children: React.ReactNode;
  stickyActions?: StickyAction[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeClient, setActiveClient] = useState<ActiveClient | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);

  useEffect(() => {
    function refresh() {
      setActiveClient(readActiveClient());
    }

    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("vyron-active-client-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("vyron-active-client-changed", refresh);
    };
  }, []);

  useEffect(() => {
    setSheet(null);
  }, [pathname]);

  const activeBottomNav = useMemo(
    () =>
      mobileBottomNavItems.map((item) => ({
        ...item,
        active: item.href ? isNavItemActive(pathname, item.href) : false,
      })),
    [pathname]
  );

  const workspaceName = activeClient?.tradingName || activeClient?.companyName || "VYRON COST";
  const workspaceSubtitle = activeClient?.packageName || "Touch-first workspace";

  const purchaseOrderDetailMatch = pathname.match(/^\/purchase-orders\/([^/]+)$/);
  const finishedGoodDetailMatch = pathname.match(/^\/products\/([^/]+)$/);
  const customerDetailMatch = pathname.match(/^\/customers\/([^/]+)$/);
  const supplierDetailMatch = pathname.match(/^\/suppliers\/([^/]+)$/);
  const inventoryDetailMatch = pathname.match(/^\/inventory\/(stock|counts)\/([^/]+)$/);
  const invoiceDetailMatch = pathname.match(/^\/customer-invoices\/([^/]+)$/);
  const salesOrderDetailMatch = pathname.match(/^\/customer-sales-orders\/([^/]+)$/);

  const defaultRecordActions = useMemo(() => {
    if (purchaseOrderDetailMatch?.[1]) {
      const id = purchaseOrderDetailMatch[1];
      return [
        { id: "po-edit", label: "Edit", variant: "primary" as const, href: `/purchase-orders/${id}/edit` },
        { id: "po-approve", label: "Approve", variant: "secondary" as const, href: `/purchase-orders/${id}` },
        { id: "po-save", label: "Save", variant: "success" as const, href: `/purchase-orders/${id}` },
        { id: "po-print", label: "Print", variant: "ghost" as const, onClick: () => window.print() },
        { id: "po-email", label: "Email", variant: "ghost" as const, href: `mailto:?subject=Purchase Order ${id}` },
        { id: "po-delete", label: "Delete", variant: "danger" as const, href: `/purchase-orders/${id}/edit` },
        { id: "po-archive", label: "Archive", variant: "secondary" as const, href: `/purchase-orders/${id}` },
      ];
    }

    if (finishedGoodDetailMatch?.[1]) {
      const id = finishedGoodDetailMatch[1];
      return [
        { id: "fg-edit", label: "Edit", variant: "primary" as const, href: `/products/${id}/edit` },
        { id: "fg-approve", label: "Approve", variant: "secondary" as const, href: `/products/${id}` },
        { id: "fg-save", label: "Save", variant: "success" as const, href: `/products/${id}` },
        { id: "fg-print", label: "Print", variant: "ghost" as const, onClick: () => window.print() },
        { id: "fg-email", label: "Email", variant: "ghost" as const, href: `mailto:?subject=Finished Good ${id}` },
        { id: "fg-delete", label: "Delete", variant: "danger" as const, href: `/products/${id}/edit` },
        { id: "fg-archive", label: "Archive", variant: "secondary" as const, href: `/products/${id}` },
      ];
    }

    if (customerDetailMatch?.[1]) {
      const id = customerDetailMatch[1];
      return [
        { id: "customer-edit", label: "Edit", variant: "primary" as const, href: `/customers/${id}` },
        { id: "customer-email", label: "Email", variant: "ghost" as const, href: `mailto:?subject=Customer ${id}` },
        { id: "customer-print", label: "Print", variant: "ghost" as const, onClick: () => window.print() },
      ];
    }

    if (supplierDetailMatch?.[1]) {
      const id = supplierDetailMatch[1];
      return [
        { id: "supplier-edit", label: "Edit", variant: "primary" as const, href: `/suppliers/${id}/edit` },
        { id: "supplier-email", label: "Email", variant: "ghost" as const, href: `mailto:?subject=Supplier ${id}` },
        { id: "supplier-print", label: "Print", variant: "ghost" as const, onClick: () => window.print() },
      ];
    }

    if (invoiceDetailMatch?.[1]) {
      const id = invoiceDetailMatch[1];
      return [
        { id: "invoice-open", label: "Open", variant: "primary" as const, href: `/customer-invoices/${id}` },
        { id: "invoice-email", label: "Email", variant: "ghost" as const, href: `mailto:?subject=Invoice ${id}` },
        { id: "invoice-print", label: "Print", variant: "ghost" as const, onClick: () => window.print() },
      ];
    }

    return [];
  }, [customerDetailMatch, finishedGoodDetailMatch, invoiceDetailMatch, purchaseOrderDetailMatch, supplierDetailMatch]);

  const effectiveStickyActions = stickyActions.length ? stickyActions : defaultRecordActions;
  const showScreenHeader = pathname !== "/dashboard" && pathname !== "/";

  function handleBackNavigation() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }

  const mobileRouteExperience = useMemo(() => {
    if (pathname === "/procurement") return <VyronMobileProcurementWorkspace />;
    if (pathname === "/purchase-orders") return <VyronMobilePurchaseOrdersWorkspace />;
    if (pathname === "/products") return <VyronMobileFinishedGoodsWorkspace />;

    if (purchaseOrderDetailMatch?.[1]) {
      return (
        <VyronMobileRecordExperience
          title={`Purchase Order ${purchaseOrderDetailMatch[1]}`}
          subtitle="Record timeline, approvals and related detail"
          status="Pending"
          tone="pending"
          timeline={[
            { id: "created", label: "Created", detail: "Purchase order drafted and captured" },
            { id: "approval", label: "Approval", detail: "Awaiting or processing sign-off" },
            { id: "receiving", label: "Receiving", detail: "Goods receipt and variance control" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    if (finishedGoodDetailMatch?.[1]) {
      return (
        <VyronMobileRecordExperience
          title={`Finished Good ${finishedGoodDetailMatch[1]}`}
          subtitle="Cost, margin and production context"
          status="Active"
          tone="approved"
          timeline={[
            { id: "defined", label: "Defined", detail: "Product profile and costing baseline" },
            { id: "linked", label: "Linked", detail: "BOM and inventory dependencies attached" },
            { id: "live", label: "Live", detail: "In active margin and sales tracking" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    if (customerDetailMatch?.[1]) {
      return (
        <VyronMobileRecordExperience
          title={`Customer ${customerDetailMatch[1]}`}
          subtitle="Commercial profile, orders and invoice context"
          status="Active"
          tone="approved"
          timeline={[
            { id: "profile", label: "Profile", detail: "Customer account and trade terms" },
            { id: "orders", label: "Orders", detail: "Sales order activity and pipeline" },
            { id: "invoices", label: "Invoices", detail: "Invoice and collections state" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    if (supplierDetailMatch?.[1]) {
      return (
        <VyronMobileRecordExperience
          title={`Supplier ${supplierDetailMatch[1]}`}
          subtitle="Supply reliability, pricing and risk context"
          status="Active"
          tone="approved"
          timeline={[
            { id: "profile", label: "Profile", detail: "Supplier details and contact channels" },
            { id: "performance", label: "Performance", detail: "Lead-time, variance and scorecards" },
            { id: "risk", label: "Risk", detail: "Alerts and mitigation actions" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    if (inventoryDetailMatch?.[2]) {
      return (
        <VyronMobileRecordExperience
          title={`Inventory ${inventoryDetailMatch[2]}`}
          subtitle="Stock status, movement and related controls"
          status="Pending"
          tone="pending"
          timeline={[
            { id: "stock", label: "Stock", detail: "Current on-hand and valuation" },
            { id: "movement", label: "Movement", detail: "Recent transactions and adjustments" },
            { id: "controls", label: "Controls", detail: "Alerts and approval actions" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    if (invoiceDetailMatch?.[1]) {
      return (
        <VyronMobileRecordExperience
          title={`Invoice ${invoiceDetailMatch[1]}`}
          subtitle="Invoice detail, status and customer context"
          status="Pending"
          tone="pending"
          timeline={[
            { id: "drafted", label: "Drafted", detail: "Invoice prepared from sales context" },
            { id: "posted", label: "Posted", detail: "Financial and inventory posting" },
            { id: "settled", label: "Settled", detail: "Collections and reconciliation" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    if (salesOrderDetailMatch?.[1]) {
      return (
        <VyronMobileRecordExperience
          title={`Sales Order ${salesOrderDetailMatch[1]}`}
          subtitle="Demand signal, fulfillment and commercial status"
          status="Pending"
          tone="pending"
          timeline={[
            { id: "captured", label: "Captured", detail: "Order created and validated" },
            { id: "fulfillment", label: "Fulfillment", detail: "Picking, production and dispatch" },
            { id: "invoice", label: "Invoice", detail: "Invoice conversion and close" },
          ]}
        >
          {children}
        </VyronMobileRecordExperience>
      );
    }

    return children;
  }, [
    children,
    customerDetailMatch,
    finishedGoodDetailMatch,
    inventoryDetailMatch,
    invoiceDetailMatch,
    pathname,
    purchaseOrderDetailMatch,
    salesOrderDetailMatch,
    supplierDetailMatch,
  ]);

  return (
    <div className={`${MOBILE_TYPOGRAPHY.family} relative min-h-screen overflow-hidden ${MOBILE_TOKENS.surface.page} text-slate-950 ${mode === "tablet" ? "vyron-tablet-mode" : "vyron-phone-mode"}`}>
      <div className={`pointer-events-none absolute inset-0 ${MOBILE_TOKENS.surface.shellBackdrop}`} />

      <div className="relative z-10 flex min-h-screen flex-col">
        <PremiumMobileExecutiveHeader
          title={title}
          subtitle={subtitle}
          workspaceLabel={workspaceSubtitle}
          workspaceControl={<WorkspaceSwitcherButton client={activeClient} onOpen={() => setSheet("workspace")} />}
          notificationControl={
            <PremiumMobileButton variant="secondary" size="icon" href="/alerts">
              <Bell size={18} />
            </PremiumMobileButton>
          }
          profileControl={
            <PremiumMobileButton variant="secondary" size="icon" href="/settings">
              <UserRound size={18} />
            </PremiumMobileButton>
          }
        />

        {showScreenHeader ? <MobileScreenHeader title={title} onBack={handleBackNavigation} /> : null}

        <main className={`flex-1 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] ${mode === "tablet" ? "pt-4" : "pt-3"}`}>{mobileRouteExperience}</main>

        {effectiveStickyActions.length ? <PremiumMobileStickyActionBar actions={effectiveStickyActions} /> : null}

        <nav className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.8rem)] pt-3 shadow-[0_-20px_55px_rgba(15,23,42,0.12)] backdrop-blur-xl ${mode === "tablet" ? "vyron-tablet-bottomnav" : ""}`}>
          <div className={`mx-auto grid grid-cols-5 items-end ${mode === "tablet" ? "max-w-4xl gap-3" : "max-w-3xl gap-1.5"}`}>
            {activeBottomNav.map((item) => {
              const Icon = item.icon;

              if (item.kind === "button" && item.label === "Create") {
                return (
                  <MobileNavButton
                    key={item.label}
                    label={item.label}
                    icon={Plus}
                    accent
                    onClick={() => setSheet("create")}
                  />
                );
              }

              if (item.kind === "button" && item.label === "More") {
                return (
                  <MobileNavButton
                    key={item.label}
                    label={item.label}
                    icon={MoreHorizontal}
                    onClick={() => setSheet("more")}
                  />
                );
              }

              return (
                <MobileNavButton key={item.label} href={item.href} label={item.label} icon={Icon} active={item.active} />
              );
            })}
          </div>
        </nav>
      </div>

      <WorkspaceSheet
        open={sheet === "workspace"}
        onClose={() => setSheet(null)}
        workspaceName={workspaceName}
        activeClient={activeClient}
      />
      <CreateSheet open={sheet === "create"} onClose={() => setSheet(null)} />
      <MoreSheet open={sheet === "more"} onClose={() => setSheet(null)} />
    </div>
  );
}
