const sections = [
  "1. Login — use /login and enter the command centre.",
  "2. Company setup — confirm Handcrafted Food Products tenant.",
  "3. Add suppliers — capture category, risk and contacts.",
  "4. Add ingredients — purchase cost, yield % and true unit cost.",
  "5. Bulk import ingredients — /imports with CSV template.",
  "6. Create finished products — selling price and target GP.",
  "7. Build BOMs — ingredient, packaging, labour and wastage lines.",
  "8. Link BOM to product — update cost from BOM and recalculate GP.",
  "9. Add purchase orders — supplier, lines, totals and notes.",
  "10. Upload supplier invoices — /document-intelligence.",
  "11. Review supplier intelligence — movement, variance and negotiation.",
  "12. Review product GP — Product Performance and product detail.",
  "13. Review recovery opportunities — formula and annual value explained.",
  "14. Approve recommended actions — approve, investigate or reject.",
  "15. Use reports — margin, supplier movement, variance and forecast.",
  "16. Use AI assistant — ask margin, supplier and recovery questions.",
  "17. Month-end workflow — GP, PO variance, invoices and recovery pipeline.",
  "18. Handcrafted demo workflow — dashboard through reports.",
];

export async function GET() {
  const body = [
    "VYRON COST — TRAINING MANUAL",
    "Handcrafted Food Products Demo",
    "",
    ...sections,
    "",
    "Formula reference:",
    "Potential Recovery = estimated avoidable monthly loss × 12",
    "Below-target GP recovery = (Target GP margin gap × monthly product sales) × 12",
    "Supplier negotiation recovery = (Current supplier price variance × expected monthly usage) × 12",
    "Packaging saving recovery = (Packaging cost reduction per unit × monthly units sold) × 12",
    "Yield recovery = (Wastage/yield loss value per batch × monthly batches) × 12",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="VYRON-COST-Training-Manual.pdf"',
    },
  });
}
