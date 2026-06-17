import type { VyronPremiumFormulaLine, VyronPremiumQuote } from "@/components/vyron-premium/VyronPremiumSprint";

export type VyronVisualVariant =
  | "general"
  | "ingredients"
  | "suppliers"
  | "products"
  | "procurement"
  | "goods-receipt"
  | "inventory"
  | "manufacturing"
  | "customers"
  | "reports"
  | "executive"
  | "recovery"
  | "finance";

export const VYRON_DOMAIN_QUOTES: Record<VyronVisualVariant, VyronPremiumQuote[]> = {
  general: [
    { label: "Margin discipline", quote: "Revenue is vanity. Margin is sanity." },
    { label: "Measurement", quote: "What gets measured gets protected." },
    { label: "Wealth building", quote: "Great businesses are built on disciplined margins." },
  ],
  ingredients: [
    { label: "Ingredient risk", quote: "Margins disappear one ingredient at a time." },
    { label: "Cost creep", quote: "Small ingredient increases become large profit leaks." },
    { label: "Yield discipline", quote: "True cost is born where yield is measured honestly." },
  ],
  suppliers: [
    { label: "Procurement edge", quote: "Profit is often won before stock arrives." },
    { label: "Supplier discipline", quote: "Supplier discipline protects margin before production begins." },
    { label: "Price control", quote: "A supplier increase ignored today becomes a product loss tomorrow." },
  ],
  products: [
    { label: "True cost", quote: "A product is only profitable when every cost is known." },
    { label: "Pricing", quote: "Price without cost control is guessing." },
    { label: "Margin protection", quote: "Every selling price should defend the margin it promises." },
  ],
  procurement: [
    { label: "Commitment", quote: "Every purchase order is a future financial commitment." },
    { label: "Discipline", quote: "Procurement discipline prevents margin leakage." },
    { label: "Approval control", quote: "Controlled purchasing protects profit before money leaves the business." },
  ],
  "goods-receipt": [
    { label: "Receiving truth", quote: "What gets received incorrectly gets costed incorrectly." },
    { label: "Accuracy", quote: "Receiving accuracy protects inventory truth." },
    { label: "Audit confidence", quote: "A clean GRN is the bridge between procurement and stock." },
  ],
  inventory: [
    { label: "Working capital", quote: "Inventory is cash wearing a disguise." },
    { label: "Control", quote: "Stock without control becomes hidden financial risk." },
    { label: "Visibility", quote: "Inventory truth turns working capital into decision power." },
  ],
  manufacturing: [
    { label: "Batch economics", quote: "Every batch is a financial event." },
    { label: "Yield", quote: "Yield variance is margin leaking from production." },
    { label: "Production control", quote: "Manufacturing profit is protected one batch at a time." },
  ],
  customers: [
    { label: "Commercial", quote: "Revenue is vanity. Margin is sanity." },
    { label: "Discipline", quote: "What gets measured gets protected." },
    { label: "Pricing impact", quote: "Customer growth only matters when margin grows with it." },
  ],
  reports: [
    { label: "Action", quote: "Insight without action is just decoration." },
    { label: "Clarity", quote: "Reports should explain where money is made and lost." },
    { label: "Board ready", quote: "A good report turns complexity into a decision." },
  ],
  executive: [
    { label: "Decisions", quote: "Executives do not need more data. They need clearer decisions." },
    { label: "Visibility", quote: "Financial leakage becomes visible when operations are measured." },
    { label: "Command", quote: "The boardroom needs answers, not another spreadsheet." },
  ],
  recovery: [
    { label: "Leakage", quote: "Small cost leaks become large financial problems." },
    { label: "Recovery", quote: "What gets measured gets protected." },
    { label: "Action", quote: "Recovery only counts when it becomes cash, credit or control." },
  ],
  finance: [
    { label: "Margin", quote: "Revenue is vanity. Margin is sanity." },
    { label: "Control", quote: "Great businesses are built on disciplined margins." },
    { label: "Forecast", quote: "The best finance teams see risk before month-end." },
  ],
};

export const VYRON_DOMAIN_FORMULAS: Record<VyronVisualVariant, VyronPremiumFormulaLine[]> = {
  general: [{ label: "GP %", formula: "(Selling Price − Total Cost) ÷ Selling Price × 100" }],
  ingredients: [
    { label: "True Ingredient Cost", formula: "Purchase Cost ÷ Yield % × (1 + Wastage %)" },
    { label: "GP %", formula: "(Price − Cost) ÷ Price × 100" },
  ],
  suppliers: [{ label: "Supplier Exposure", formula: "Σ open PO value + invoice variance" }],
  products: [
    { label: "GP %", formula: "(Selling Price − Total Cost) ÷ Selling Price × 100" },
    { label: "True Cost", formula: "Ingredients + Packaging + Labour + Overhead + Wastage" },
  ],
  procurement: [
    { label: "PO Total", formula: "Σ (Qty × Unit Price) + VAT" },
    { label: "Outstanding", formula: "Ordered Qty − Received Qty" },
  ],
  "goods-receipt": [
    { label: "GRN Value", formula: "Received Qty × Unit Cost" },
    { label: "Variance", formula: "Received − Ordered" },
  ],
  inventory: [
    { label: "Stock Value", formula: "On-hand Qty × Weighted Avg Cost" },
    { label: "Turnover", formula: "COGS ÷ Average Inventory Value" },
  ],
  manufacturing: [
    { label: "Yield %", formula: "Actual Output ÷ Expected Output × 100" },
    { label: "Batch Cost", formula: "Ingredients + Packaging + Labour + Overhead" },
  ],
  customers: [
    { label: "Invoice GP %", formula: "(Sales − COGS) ÷ Sales × 100" },
    { label: "Avg Invoice", formula: "Total Sales ÷ Invoice Count" },
  ],
  reports: [{ label: "Margin Bridge", formula: "Price Effect + Volume Effect + Cost Effect" }],
  executive: [{ label: "Recovery ROI", formula: "Recovered Value ÷ Identified Leakage × 100" }],
  recovery: [{ label: "Leakage Exposure", formula: "Σ identified recovery opportunities" }],
  finance: [{ label: "EBITDA Margin", formula: "EBITDA ÷ Revenue × 100" }],
};

export const VYRON_VISUAL_LABELS: Record<VyronVisualVariant, { title: string; subtitle: string; flow: string[] }> = {
  general: { title: "Cost Control", subtitle: "Live margin & analytics", flow: ["Data", "Insight", "Action", "Profit"] },
  ingredients: { title: "Ingredient Costing", subtitle: "Cost movement & yield", flow: ["Ingredient", "Yield", "BOM", "Margin"] },
  suppliers: { title: "Supplier Performance", subtitle: "Risk & price movement", flow: ["Supplier", "PO", "GRN", "Invoice", "Profit"] },
  products: { title: "Product Costing", subtitle: "GP & margin control", flow: ["Cost", "Price", "GP", "Profit"] },
  procurement: { title: "Procurement Flow", subtitle: "PO exposure & approvals", flow: ["Supplier", "PO", "Approval", "GRN", "Invoice"] },
  "goods-receipt": { title: "Goods Receipt Control", subtitle: "GRN accuracy & match", flow: ["PO", "Receive", "Check", "Stock", "Match"] },
  inventory: { title: "Stock Control", subtitle: "Valuation & movement", flow: ["Stock", "Value", "Risk", "Cash", "Profit"] },
  manufacturing: { title: "Manufacturing Control", subtitle: "Yield & batch cost", flow: ["Ingredients", "Batch", "Yield", "FG", "Margin"] },
  customers: { title: "Customer Control", subtitle: "Revenue & GP movement", flow: ["Customer", "Price", "Invoice", "GP"] },
  reports: { title: "Reporting Centre", subtitle: "Board-ready insight", flow: ["Data", "Report", "Decision", "Action"] },
  executive: { title: "Executive Boardroom", subtitle: "Decision command", flow: ["Procure", "Make", "Stock", "Sell", "Recover"] },
  recovery: { title: "Recovery Scan", subtitle: "Leakage & opportunity", flow: ["Detect", "Review", "Action", "Recover"] },
  finance: { title: "Finance Control", subtitle: "P&L & cash discipline", flow: ["Revenue", "Cost", "Cash", "Margin"] },
};

export const VYRON_DOMAIN_INTELLIGENCE: Record<VyronVisualVariant, Array<{ label: string; detail: string }>> = {
  general: [
    { label: "Margin", detail: "Track GP % on every product and customer before erosion becomes structural." },
    { label: "Visibility", detail: "Connect costing, procurement and inventory into one intelligence layer." },
    { label: "Action", detail: "Every signal should link to a page where the work gets done." },
  ],
  ingredients: [
    { label: "Yield", detail: "Low yield inflates true unit cost even when purchase price looks stable." },
    { label: "Movement", detail: "Track purchase cost movement before it flows into every BOM line." },
    { label: "Supplier link", detail: "Every ingredient should trace to a supplier for procurement intelligence." },
  ],
  suppliers: [
    { label: "Price movement", detail: "Approved invoices and PO history reveal supplier inflation early." },
    { label: "Risk status", detail: "Flag unstable suppliers before they disrupt production and margin." },
    { label: "Invoice routing", detail: "Correct supplier invoice email reduces delays and duplicate risk." },
  ],
  products: [
    { label: "True cost", detail: "BOM-linked costing keeps selling price decisions honest." },
    { label: "GP gap", detail: "Products below target GP need repricing or cost review now." },
    { label: "Margin bridge", detail: "Separate price, volume and cost effects on profitability." },
  ],
  procurement: [
    { label: "Commitment", detail: "Every approved PO is a future cash and stock obligation." },
    { label: "3-way match", detail: "PO, GRN and invoice must agree — variance is margin or fraud." },
    { label: "Approvals", detail: "Threshold discipline prevents unauthorised spend." },
  ],
  "goods-receipt": [
    { label: "Accuracy", detail: "Received quantity drives inventory valuation and supplier payment." },
    { label: "Variance", detail: "Short or damaged receipts must be visible before month-end close." },
    { label: "PO link", detail: "GRNs should trace to open purchase orders for audit confidence." },
  ],
  inventory: [
    { label: "Valuation", detail: "Weighted average cost must reflect every posted movement." },
    { label: "Risk", detail: "Negative and slow-moving stock is hidden financial exposure." },
    { label: "Counts", detail: "Stock count variances explain where physical stock diverged from ledger." },
  ],
  manufacturing: [
    { label: "Yield", detail: "Every batch should be measured against expected output." },
    { label: "Wastage", detail: "Production waste is margin leaving the building." },
    { label: "Batch cost", detail: "Ingredient, packaging and labour must roll into finished goods value." },
  ],
  customers: [
    { label: "GP movement", detail: "Customer-level margin shows where commercial terms need review." },
    { label: "Terms", detail: "Payment terms affect cash flow alongside margin on every sale." },
    { label: "Top products", detail: "Know which SKUs drive revenue and which erode margin." },
  ],
  reports: [
    { label: "Board ready", detail: "Exports should survive an owner, CFO or auditor review." },
    { label: "Drill-down", detail: "Every report should explain where money is made and lost." },
    { label: "Recovery", detail: "Leakage and duplicate invoice reports protect working capital." },
  ],
  executive: [
    { label: "Decisions", detail: "Executives need ranked actions, not more disconnected charts." },
    { label: "Cross-domain", detail: "Finance, inventory, procurement and production on one screen." },
    { label: "Recovery", detail: "Identified leakage must show confidence and monthly exposure." },
  ],
  recovery: [
    { label: "Leakage", detail: "Duplicate invoices, wastage and price drift create recoverable value." },
    { label: "Confidence", detail: "Rank opportunities by evidence strength before approval." },
    { label: "Tracking", detail: "Recovery only counts when action is completed and audited." },
  ],
  finance: [
    { label: "P&L discipline", detail: "Revenue without margin control is vanity reporting." },
    { label: "Cash", detail: "Inventory and debtor days are balance-sheet margin risks." },
    { label: "Forecast", detail: "30/60/90 day margin risk should be visible before month-end." },
  ],
};

export function resolveDomainQuotes(variant: VyronVisualVariant | undefined, quotes?: VyronPremiumQuote[]): VyronPremiumQuote[] {
  const domain = variant ? VYRON_DOMAIN_QUOTES[variant] : VYRON_DOMAIN_QUOTES.general;
  if (quotes && quotes.length > 0) {
    const merged = [...quotes, ...domain];
    return merged.slice(0, 3);
  }
  return domain.slice(0, 3);
}
