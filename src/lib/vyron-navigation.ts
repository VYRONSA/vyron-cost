
import type { LucideIcon } from "lucide-react";
import { BookOpen, Boxes, BrainCircuit, Building2, ClipboardList, Factory, FileSearch, Globe, History, Landmark, LayoutDashboard, PackageSearch, Radar, Settings, Sparkles, TrendingUp, Upload, Wallet, ChefHat, GraduationCap } from "lucide-react";

export type VyronNavItem = { label: string; href: string; icon: LucideIcon };
export type VyronNavSection = { id: string; section: string; items: VyronNavItem[] };

export const vyronNavSections: VyronNavSection[] = [
  {
    id: "autonomous",
    section: "AUTONOMOUS BI",
    items: [
      { label: "VYRON Command Centre", icon: Radar, href: "/vyron-command-centre" },
      { label: "Business Health", icon: TrendingUp, href: "/vyron-command-centre/business-health" },
      { label: "Early Warning", icon: Sparkles, href: "/vyron-command-centre/early-warning" },
      { label: "Decision Engine", icon: BrainCircuit, href: "/vyron-command-centre/decisions" },
      { label: "Ask VYRON", icon: BrainCircuit, href: "/vyron-command-centre/copilot" },
      { label: "Strategic Intelligence", icon: ClipboardList, href: "/vyron-command-centre/strategic" }
    ]
  },
  {
    id: "executive",
    section: "EXECUTIVE",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Executive Dashboard", icon: TrendingUp, href: "/executive-dashboard" },
      { label: "AI CFO Command Centre", icon: Sparkles, href: "/ai-cfo-command-centre" },
      { label: "Boardroom Insights", icon: ClipboardList, href: "/boardroom-insights" },
      { label: "Finance Intelligence", icon: Wallet, href: "/finance-intelligence" },
      { label: "Executive Reporting", icon: FileSearch, href: "/executive-reporting" },
      { label: "Board Pack Centre", icon: ClipboardList, href: "/board-pack-centre" },
      { label: "AI Procurement Manager", icon: BrainCircuit, href: "/ai-procurement-manager" },
      { label: "Recovery Intelligence", icon: Wallet, href: "/financial-leakage" },
      { label: "Accounting Exports", icon: Upload, href: "/accounting-export-centre" },
      { label: "Budgeting", icon: Wallet, href: "/budgeting" },
      { label: "Compliance Centre", icon: FileSearch, href: "/compliance-centre" },
      { label: "Risk Centre", icon: TrendingUp, href: "/risk-centre" }
    ]
  },
  {
    id: "vyron-finance",
    section: "VYRON FINANCE",
    items: [
      { label: "Finance Intelligence Hub", icon: Landmark, href: "/vyron-finance" },
      { label: "Management Accounts", icon: ClipboardList, href: "/vyron-finance/management-accounts" },
      { label: "Financial Statements", icon: FileSearch, href: "/vyron-finance/statements" },
      { label: "AI Financial Review", icon: Sparkles, href: "/vyron-finance/financial-review" },
      { label: "Audit Intelligence", icon: FileSearch, href: "/vyron-finance/audit-intelligence" },
      { label: "Finance Imports", icon: Upload, href: "/vyron-finance/imports" },
      { label: "Trial Balance AI", icon: TrendingUp, href: "/vyron-finance/trial-balance" },
      { label: "Cash Flow Intelligence", icon: Wallet, href: "/vyron-finance/cash-flow" },
      { label: "Executive Financial", icon: LayoutDashboard, href: "/vyron-finance/executive" },
      { label: "Board Reporting", icon: ClipboardList, href: "/vyron-finance/board-reporting" },
      { label: "AI CFO Assistant", icon: BrainCircuit, href: "/vyron-finance/cfo-assistant" }
    ]
  },
  {
    id: "enterprise-platform",
    section: "ENTERPRISE PLATFORM",
    items: [
      { label: "Platform Hub", icon: Globe, href: "/enterprise-platform" },
      { label: "Group Reporting", icon: TrendingUp, href: "/enterprise-platform/group-reporting" },
      { label: "Group Command Centre", icon: LayoutDashboard, href: "/enterprise-platform/command-centre" },
      { label: "Enterprise Search", icon: FileSearch, href: "/enterprise-platform/search" },
      { label: "Enterprise AI", icon: BrainCircuit, href: "/enterprise-platform/ai-assistant" },
      { label: "Benchmarking", icon: TrendingUp, href: "/enterprise-platform/benchmarking" },
      { label: "Multi-Company", icon: Building2, href: "/enterprise-platform/multi-company" }
    ]
  },
  {
    id: "enterprise",
    section: "ENTERPRISE",
    items: [
      { label: "Roles & Permissions", icon: Settings, href: "/enterprise/roles" },
      { label: "Approval Matrix", icon: ClipboardList, href: "/enterprise/approval-matrix" },
      { label: "Forecasting", icon: TrendingUp, href: "/enterprise/forecasting" },
      { label: "Contracts", icon: Building2, href: "/contracts" },
      { label: "Fraud Detection", icon: FileSearch, href: "/enterprise/fraud-detection" },
      { label: "Auditor Workspace", icon: FileSearch, href: "/enterprise/auditor" },
      { label: "Scenario Modelling", icon: TrendingUp, href: "/scenario-modelling" },
      { label: "VYRON Academy", icon: GraduationCap, href: "/vyron-academy" }
    ]
  },
  {
    id: "costing",
    section: "COSTING",
    items: [
      { label: "Products", icon: PackageSearch, href: "/products" },
      { label: "Recipes & BOM", icon: ChefHat, href: "/recipes" },
      { label: "Ingredients", icon: Boxes, href: "/ingredients" }
    ]
  },
  {
    id: "suppliers",
    section: "SUPPLIERS",
    items: [
      { label: "Suppliers", icon: Building2, href: "/suppliers" },
      { label: "Supplier Intelligence", icon: TrendingUp, href: "/supplier-intelligence" }
    ]
  },
  {
    id: "operations",
    section: "OPERATIONS",
    items: [
      { label: "PO Dashboard", icon: ClipboardList, href: "/purchase-orders" },
      { label: "PO List", icon: ClipboardList, href: "/purchase-orders/list" },
      { label: "Goods Receipts", icon: Upload, href: "/goods-receipts" },
      { label: "PO Settings", icon: Settings, href: "/purchase-orders/settings" },
      { label: "Inventory", icon: PackageSearch, href: "/inventory" },
      { label: "Production Dashboard", icon: Factory, href: "/manufacturing" },
      { label: "Production Runs", icon: ClipboardList, href: "/manufacturing/runs" },
      { label: "Finished Goods", icon: PackageSearch, href: "/manufacturing/finished-goods" },
      { label: "Stock Master", icon: Boxes, href: "/inventory/stock" },
      { label: "Stock Ledger", icon: ClipboardList, href: "/inventory/ledger" },
      { label: "Document Intelligence", icon: FileSearch, href: "/document-intelligence" },
      { label: "Supplier Learning", icon: GraduationCap, href: "/document-intelligence/supplier-learning" },
      { label: "Price History", icon: History, href: "/document-intelligence/price-history/supplier" },
      { label: "DI Supervisor Settings", icon: Settings, href: "/document-intelligence/settings" },
      { label: "Email Invoice Inbox", icon: Upload, href: "/email-invoice-inbox" }
    ]
  },
  {
    id: "system",
    section: "SYSTEM",
    items: [
      { label: "Bulk Imports", icon: Upload, href: "/imports" },
      { label: "Training", icon: BookOpen, href: "/training" },
      { label: "Settings", icon: Settings, href: "/settings" }
    ]
  }
];

export function isNavItemActive(pathname: string, href: string) {
  const base = href.split("#")[0];
  if (base === "/dashboard") return pathname === "/dashboard";
  return pathname === base || pathname.startsWith(`${base}/`);
}
