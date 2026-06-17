import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Building2,
  ChefHat,
  CheckSquare,
  ClipboardList,
  Factory,
  FileSearch,
  FileText,
  Gavel,
  History,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Package,
  Play,
  PackageSearch,
  ReceiptText,
  Settings,
  Target,
  TrendingUp,
  Upload,
  Users,
  Brain,
  Shield,
  BarChart3,
  Search,
  Building,
  BookOpen,
} from "lucide-react";

export type VyronNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type VyronNavSection = {
  id: string;
  section: string;
  items: VyronNavItem[];
};

export const vyronNavSections: VyronNavSection[] = [
  {
    id: "suppliers",
    section: "SUPPLIERS",
    items: [
      { label: "Suppliers", icon: Building2, href: "/suppliers" },
      { label: "Supplier Intelligence", icon: TrendingUp, href: "/supplier-intelligence" },
      { label: "Supplier Inflation", icon: TrendingUp, href: "/supplier-inflation" },
      { label: "Supplier Invoice Import / Document Intelligence", icon: FileSearch, href: "/document-intelligence" },
      { label: "Email Invoice Inbox", icon: Upload, href: "/email-invoice-inbox" },
    ],
  },

  {
    id: "costing",
    section: "COSTING",
    items: [
      { label: "Ingredients", icon: Boxes, href: "/ingredients" },
      { label: "Products", icon: PackageSearch, href: "/products" },
      { label: "Recipes & BOM", icon: ChefHat, href: "/recipes" },
    ],
  },

  {
    id: "procurement",
    section: "PROCUREMENT",
    items: [
      { label: "Purchase Orders", icon: ClipboardList, href: "/purchase-orders" },
      { label: "PO List", icon: ClipboardList, href: "/purchase-orders/list" },
      { label: "Approvals", icon: ClipboardList, href: "/purchase-orders/approvals" },
      { label: "Back Orders", icon: Package, href: "/purchase-orders/back-orders" },
      { label: "Goods Receipts", icon: Upload, href: "/goods-receipts" },
      { label: "PO Settings", icon: Settings, href: "/purchase-orders/settings" },
    ],
  },

  {
    id: "inventory",
    section: "INVENTORY",
    items: [
      { label: "Inventory", icon: PackageSearch, href: "/inventory" },
      { label: "Stock Master", icon: Boxes, href: "/inventory/stock" },
      { label: "Inventory Ledger", icon: ClipboardList, href: "/inventory/ledger" },
      { label: "Inventory Counts", icon: ClipboardList, href: "/inventory/counts" },
      { label: "Inventory Intelligence", icon: Target, href: "/inventory-intelligence" },
    ],
  },

  {
    id: "manufacturing",
    section: "MANUFACTURING",
    items: [
      { label: "Manufacturing Dashboard", icon: Factory, href: "/manufacturing" },
      { label: "Production Runs", icon: ClipboardList, href: "/manufacturing/runs" },
      { label: "Manufacturing History", icon: History, href: "/manufacturing/history" },
      { label: "Finished Goods", icon: PackageSearch, href: "/manufacturing/finished-goods" },
    ],
  },

  {
    id: "customers",
    section: "CUSTOMERS",
    items: [
      { label: "Customers", icon: Users, href: "/customers" },
      { label: "Customer Invoices", icon: ReceiptText, href: "/customer-invoices" },
    ],
  },

  {
    id: "accounting",
    section: "ACCOUNTING",
    items: [
      { label: "Xero Integration", icon: Link2, href: "/integrations/xero" },
    ],
  },

  {
    id: "reports",
    section: "REPORTS",
    items: [
      { label: "Reports", icon: FileText, href: "/reports" },
    ],
  },

  {
    id: "executive",
    section: "EXECUTIVE",
    items: [
      { label: "Executive Boardroom", icon: LayoutDashboard, href: "/executive-boardroom" },
      { label: "AI Cost Intelligence", icon: Target, href: "/cost-intelligence" },
      { label: "Business Health Centre", icon: BarChart3, href: "/business-health" },
      { label: "Early Warning Centre", icon: Shield, href: "/early-warning" },
      { label: "Predictive Risk Centre", icon: TrendingUp, href: "/predictive-risk" },
      { label: "Root Cause Centre", icon: Search, href: "/root-cause" },
      { label: "Decisions Centre", icon: Gavel, href: "/decisions" },
      { label: "Actions Centre", icon: CheckSquare, href: "/actions" },
      { label: "Execution Centre", icon: Play, href: "/execution-centre" },
      { label: "Autonomous Command Centre", icon: Brain, href: "/autonomous-command-centre" },
      { label: "Ask VYRON", icon: MessageSquare, href: "/ask-vyron" },
      { label: "Strategic Intelligence", icon: Target, href: "/vyron-command-centre/strategic" },
    ],
  },

  {
    id: "enterprise",
    section: "ENTERPRISE",
    items: [
      { label: "Group Reporting", icon: Building, href: "/enterprise-platform/group-reporting" },
      { label: "Group Command Centre", icon: LayoutDashboard, href: "/enterprise-platform/command-centre" },
      { label: "Enterprise Search", icon: Search, href: "/enterprise-platform/search" },
      { label: "Enterprise AI", icon: Brain, href: "/enterprise-platform/ai-assistant" },
      { label: "Multi-Company", icon: Building, href: "/enterprise-platform/multi-company" },
    ],
  },

  {
    id: "system",
    section: "SYSTEM",
    items: [
      { label: "Bulk Imports", icon: Upload, href: "/imports" },
      { label: "Training", icon: BookOpen, href: "/training" },
      { label: "Settings", icon: Settings, href: "/settings" },
    ],
  },

  {
    id: "admin",
    section: "ADMIN",
    items: [
      { label: "Company Setup", icon: Settings, href: "/admin/company-setup" },
      { label: "User Setup", icon: Users, href: "/admin/users" },
      { label: "Import Centre", icon: Upload, href: "/admin/imports" },
      { label: "Deployment Readiness", icon: Shield, href: "/deployment-readiness" },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string) {
  const base = href.split("#")[0];

  if (base === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === base || pathname.startsWith(`${base}/`);
}