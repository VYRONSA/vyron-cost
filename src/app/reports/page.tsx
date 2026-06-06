import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";

const groups = [
  {
    title: "Procurement",
    reports: [
      ["Open Purchase Orders", "/reports/open-purchase-orders", "Open, approved, sent and partially received POs."],
      ["Outstanding Purchase Orders", "/reports/outstanding-purchase-orders", "Outstanding PO lines requiring supplier follow-up."],
      ["Back Orders", "/purchase-orders/back-orders", "Clickable back-order list with receive balance actions."],
      ["GRN Variances", "/reports/grn-variances", "Goods receipt quantity and supplier delivery review."],
      ["Invoice Variances", "/reports/invoice-variances", "Invoices in review or variance workflow."],
      ["Supplier Spend", "/reports/supplier-spend", "PO exposure and supplier spend view."],
    ],
  },
  {
    title: "Supplier",
    reports: [
      ["Supplier Price Increases", "/reports/supplier-price-increases", "Price movement from invoice/price history."],
      ["Supplier Inflation", "/reports/supplier-inflation", "Inflation watch by supplier and item."],
      ["Supplier Performance", "/reports/supplier-performance", "Supplier PO, receipt and variance performance."],
    ],
  },
  {
    title: "Inventory",
    reports: [
      ["Stock Valuation", "/reports/stock-valuation", "Stock master quantity and value report."],
      ["Stock Variance", "/reports/stock-variance", "Stock count variance register."],
      ["Slow Moving Items", "/reports/slow-moving-items", "Inventory movement review."],
      ["Stock Counts", "/inventory/counts", "Draft → submit → approve → post count workflow."],
    ],
  },
  {
    title: "Costing",
    reports: [
      ["Product GP", "/reports/product-margins", "Product cost, selling price and GP variance."],
      ["Recipe Cost Report", "/reports/product-costings", "BOM-linked product costing lines."],
      ["Ingredient Cost Report", "/reports/ingredient-movement", "Ingredient inflation and true cost movement."],
      ["BOM Changes", "/reports/bom-changes", "Recipe/BOM cost change audit trail."],
      ["Margin Erosion", "/reports/margin-erosion", "Products exposed to supplier increases and GP erosion."],
    ],
  },
  {
    title: "Sales",
    reports: [
      ["Sales Intelligence", "/reports/sales-intelligence", "Sales by customer, product, top performers and monthly trends."],
      ["Customer Statements", "/customer-statements", "Outstanding balance and invoice history by customer."],
      ["Sales GP Report", "/reports/sales", "Customer invoice gross profit summary."],
    ],
  },
  {
    title: "Recovery",
    reports: [
      ["Recovery Opportunities", "/reports/recovery-opportunities", "Potential Recovery, confidence and explanation."],
      ["Duplicate Invoice Risks", "/reports/duplicate-invoice-risks", "Once-off duplicate exposure. Not annualised."],
      ["Leakage Intelligence", "/reports/recovery-summary", "Leakage and recovery summary for client review."],
    ],
  },
];

export default function ReportsPage() {
  return (
    <VyronCostAiShell title="Reports Centre" subtitle="Open · print · export CSV · demo-ready report routing">
      <section className="grid gap-6">
        {groups.map((group) => (
          <section key={group.title} className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-950">{group.title}</h2>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">{group.reports.length} reports</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.reports.map(([title, href, text]) => (
                <Link key={title} href={href} className="block rounded-[1.5rem] border border-violet-100 bg-violet-50/40 p-5 transition hover:-translate-y-1 hover:bg-white hover:shadow-xl">
                  <h3 className="text-lg font-black text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{text}</p>
                  <div className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-violet-700">Open →</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
