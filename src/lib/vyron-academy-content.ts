export type AcademyGuide = {
  id: string;
  category: string;
  title: string;
  summary: string;
  steps: string[];
  href?: string;
};

export const VYRON_ACADEMY_GUIDES: AcademyGuide[] = [
  {
    id: "setup",
    category: "Setup Guides",
    title: "Tenant & company setup",
    summary: "Configure company, branches, users and default tenant.",
    steps: ["Create company profile", "Add branches", "Assign enterprise roles", "Verify Supabase connection"],
    href: "/settings",
  },
  {
    id: "costing-products",
    category: "Costing Guides",
    title: "Product costing workflow",
    summary: "Link BOMs to products and maintain target GP.",
    steps: ["Import ingredients", "Build recipes", "Set selling prices", "Review GP vs target"],
    href: "/products",
  },
  {
    id: "procurement-po",
    category: "Procurement Guides",
    title: "Purchase order lifecycle",
    summary: "Create, approve, receive and match POs.",
    steps: ["Create PO from supplier", "Route through approval matrix", "Post GRN", "Link invoice in Document Intelligence"],
    href: "/purchase-orders",
  },
  {
    id: "inventory-stock",
    category: "Inventory Guides",
    title: "Stock master & counts",
    summary: "Maintain stock ledger and periodic counts.",
    steps: ["Review stock master", "Set reorder levels", "Run stock count", "Post variances with approval"],
    href: "/inventory",
  },
  {
    id: "mfg-runs",
    category: "Manufacturing Guides",
    title: "Production runs",
    summary: "Plan, execute and complete production with yield tracking.",
    steps: ["Validate BOM stock", "Start run", "Complete with actuals", "Review variances"],
    href: "/manufacturing/runs",
  },
  {
    id: "recovery",
    category: "Recovery Guides",
    title: "Recovery intelligence",
    summary: "Identify, verify and recover leakage.",
    steps: ["Review opportunities", "Attach evidence", "Track to recovered", "Report in board pack"],
    href: "/recovery-opportunities",
  },
  {
    id: "roles",
    category: "Setup Guides",
    title: "Roles & permissions",
    summary: "Map users to enterprise roles and module permissions.",
    steps: ["Review permission matrix", "Assign Owner/CFO/Operational roles", "Enable auditor read-only"],
    href: "/enterprise/roles",
  },
  {
    id: "budgets",
    category: "Costing Guides",
    title: "Budget vs actual",
    summary: "Monitor spend categories against budget.",
    steps: ["Review monthly budgets", "Compare actuals from live data", "Investigate variances"],
    href: "/budgeting",
  },
];
