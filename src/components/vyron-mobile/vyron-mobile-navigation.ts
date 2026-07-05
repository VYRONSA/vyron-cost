import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Building2,
  Boxes,
  Brain,
  ClipboardList,
  Factory,
  FileText,
  Home,
  LayoutGrid,
  MoreHorizontal,
  PackageSearch,
  Plus,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";

export type MobileLauncherTile = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export type MobileQuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  detail: string;
};

export type MobileNavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  kind?: "link" | "button";
};

export type MobileRecentRecord = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  status: "draft" | "pending" | "approved" | "completed" | "archived" | "cancelled" | "received";
  meta: Array<{ label: string; value: string }>;
  href: string;
};

export const mobileLauncherTiles: MobileLauncherTile[] = [
  { label: "Sales Orders", href: "/customer-sales-orders", icon: ShoppingCart, description: "Capture and track customer demand" },
  { label: "Procurement", href: "/procurement", icon: Truck, description: "Manage requisitions and purchase flow" },
  { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList, description: "Control supplier purchase commitments" },
  { label: "Manufacturing", href: "/manufacturing", icon: Factory, description: "Monitor production performance" },
  { label: "Inventory", href: "/inventory", icon: Boxes, description: "Track stock movements and counts" },
  { label: "Finished Goods", href: "/products", icon: PackageSearch, description: "View margin and product readiness" },
  { label: "Customers", href: "/customers", icon: Users, description: "Manage customer profiles" },
  { label: "Suppliers", href: "/suppliers", icon: Building2, description: "Review vendor pricing and risk" },
  { label: "Invoices", href: "/customer-invoices", icon: ReceiptText, description: "Issue and track customer invoices" },
  { label: "Reports", href: "/reports", icon: FileText, description: "Open operational and finance reports" },
  { label: "Intelligence", href: "/cost-intelligence", icon: Brain, description: "AI insights across cost and risk" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Workspace and platform preferences" },
];

export const mobileQuickCreateActions: MobileQuickAction[] = [
  { label: "Sales Order", href: "/customer-sales-orders?create=1", icon: ShoppingCart, detail: "Capture a new customer order" },
  { label: "Requisition", href: "/procurement", icon: Truck, detail: "Create a new procurement requisition" },
  { label: "Purchase Order", href: "/purchase-orders/new", icon: ClipboardList, detail: "Draft a supplier PO" },
  { label: "Manufacturing Batch", href: "/manufacturing/new", icon: Factory, detail: "Start a production run" },
  { label: "Goods Receipt", href: "/goods-receipts/new", icon: Truck, detail: "Record stock received" },
  { label: "Supplier Invoice", href: "/document-intelligence", icon: ReceiptText, detail: "Process supplier invoices" },
  { label: "Invoice", href: "/customer-invoices/new", icon: ReceiptText, detail: "Create a customer invoice" },
  { label: "Customer", href: "/customers", icon: Users, detail: "Add or update customer profile" },
  { label: "Supplier", href: "/suppliers", icon: Building2, detail: "Create supplier record" },
  { label: "Finished Good", href: "/products", icon: PackageSearch, detail: "Create or launch finished good workflow" },
  { label: "Raw Material", href: "/ingredients", icon: Boxes, detail: "Open ingredient and raw material register" },
  { label: "Manufacturing Job", href: "/manufacturing/runs/new", icon: Factory, detail: "Schedule a production job" },
  { label: "BOM / Recipe", href: "/recipes/new", icon: LayoutGrid, detail: "Build a costing recipe" },
];

export const mobileMoreLinks: MobileLauncherTile[] = [
  { label: "Audit & Risk", href: "/audit-risk", icon: Activity, description: "Monitor key control and compliance events" },
  { label: "Alerts", href: "/alerts", icon: Bell, description: "Review active risk and margin alerts" },
  { label: "Procurement Risk", href: "/procurement-risk", icon: Truck, description: "Focus on supplier and PO exposure" },
  { label: "Inventory Alerts", href: "/inventory/alerts", icon: Boxes, description: "Resolve low stock and variance alerts" },
  { label: "Reports", href: "/reports", icon: FileText, description: "Open executive and operational reporting" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Manage workspace configuration" },
];

export const mobileHomeKpis = [
  {
    id: "business-health",
    label: "Business Health",
    value: "94 / 100",
    note: "Stable margin and operations confidence",
    icon: Brain,
    tone: "approved" as const,
  },
  {
    id: "inventory-value",
    label: "Inventory Value",
    value: "R2.4M",
    note: "Current stock valuation across locations",
    icon: Boxes,
    tone: "received" as const,
  },
  {
    id: "purchasing-today",
    label: "Purchasing Today",
    value: "R186k",
    note: "Open and approved procurement spend",
    icon: Truck,
    tone: "pending" as const,
  },
  {
    id: "savings",
    label: "Savings",
    value: "R42k",
    note: "Realized this month from procurement actions",
    icon: ReceiptText,
    tone: "completed" as const,
  },
  {
    id: "production",
    label: "Production",
    value: "12 Runs",
    note: "In progress and ready for completion",
    icon: Factory,
    tone: "draft" as const,
  },
  {
    id: "cash-position",
    label: "Cash Position",
    value: "R1.1M",
    note: "Projected available liquidity",
    icon: FileText,
    tone: "approved" as const,
  },
];

export const mobileRecentSearches = [
  "Pending purchase orders",
  "Inventory alerts",
  "Top supplier risk",
];

export const mobileRecentRecords: MobileRecentRecord[] = [
  {
    id: "po-1049",
    title: "PO-1049",
    subtitle: "Raw Materials - North Depot",
    icon: ClipboardList,
    status: "pending",
    meta: [
      { label: "Amount", value: "R 88,240" },
      { label: "Due", value: "Mon 11:30" },
    ],
    href: "/purchase-orders/1049",
  },
  {
    id: "fg-batch-77",
    title: "Batch FG-77",
    subtitle: "Chocolate Spread 450g",
    icon: Factory,
    status: "received",
    meta: [
      { label: "Yield", value: "2,148 units" },
      { label: "Variance", value: "+1.2%" },
    ],
    href: "/manufacturing/FG-77",
  },
  {
    id: "so-3281",
    title: "SO-3281",
    subtitle: "Cape Metro Grocery Group",
    icon: ShoppingCart,
    status: "approved",
    meta: [
      { label: "Value", value: "R 124,000" },
      { label: "Ship", value: "Tomorrow" },
    ],
    href: "/customer-sales-orders/3281",
  },
];

export const mobileBottomNavItems: MobileNavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, kind: "link" },
  { label: "Activity", href: "/audit-risk", icon: Activity, kind: "link" },
  { label: "Create", icon: Plus, kind: "button" },
  { label: "Notifications", href: "/alerts", icon: Bell, kind: "link" },
  { label: "More", icon: MoreHorizontal, kind: "button" },
];
