/**
 * The synthetic "QA Pantry" Food Sock fixture shared by the executor and
 * validator regression tests: tenant A is imported into, tenant B holds
 * look-alike records that must never be matched or touched, and tenant C is
 * a third, empty tenant. No client data.
 *
 * `core` is the data-migration core module, passed in because the caller has
 * registered the TypeScript loader hook before importing it.
 */
export function qaFixture(core) {
  const n = (raw) => core.parseSourceNumber(raw);

  const A = "a1a1a1a1-0000-4000-8000-0000000000a1";
  const B = "b2b2b2b2-0000-4000-8000-0000000000b2";
  const C = "c3c3c3c3-0000-4000-8000-0000000000c3";

  /* -------------------------------------------------------------- fixtures */

  const ref = (file, row) => ({ system: "qa", file, fileSha256: `sha-${file}`, row });
  const product = (row, over) => ({
    ref: ref("products.csv", row), name: "", sku: "", category: "Raw Stock", itemType: "Stocked product", description: "",
    uom: "grams", purchasingUom: "kg's", purchasingRatio: n("1000"), cost: n(""), defaultPrice: n(""), taxInclusivePrice: false,
    lastVendor: "", barcode: "", isActive: true, autoManufacture: false, weight: n(""), remarks: "", ...over,
  });
  const bomLine = (row, finishedName, finishedSku, componentName, quantity) => ({ ref: ref("bom.csv", row), finishedName, finishedSku, componentName, componentSku: "", quantity: n(quantity), uom: "", isActive: true });
  const po = (row, number, productName, price, uom) => ({
    ref: ref("po.csv", row), orderNumber: number, inventoryStatus: "Fulfilled", paymentStatus: "Paid", vendor: "QA Mills", orderDate: "2026/08/01 10:00:00 +00:00",
    dueDate: "", isCancelled: false, isQuote: false, productName, sku: "", quantity: n("10"), uom, unitPrice: n(price), taxName: "VAT", taxRate: n("15"),
  });

  function qaSources() {
    return {
      files: [{ key: "contacts", name: "contacts.csv", sha256: "sha", bytes: 1, headerWidth: 1, rowWidths: {} }],
      vendors: [{ ref: ref("vendors.csv", 2), name: "QA Mills", contactName: "Pat", email: "pat@qa-mills.test", phone: "021 000 0000", paymentTerms: "", currency: "ZAR", taxInclusivePricing: false, isActive: true, remarks: "" }],
      products: [
        product(2, { name: "QA Flour", cost: n("0.01235"), lastVendor: "QA Mills" }),
        product(3, { name: "QA Bag", category: "Bags", uom: "Bags", purchasingUom: "Bags", purchasingRatio: n("1"), cost: n("2.03"), lastVendor: "QA Mills" }),
        product(4, { name: "QA Loaf", sku: "QA-1", category: "Meal for 4", uom: "Loaves", purchasingUom: "Loaves", purchasingRatio: n("1"), defaultPrice: n("20.00") }),
        product(5, { name: "QA Salt", cost: n("TBC") }),
        product(6, { name: "QA Old Loaf", sku: "QA-OLD", category: "Meal for 4", uom: "Loaves", purchasingUom: "Loaves", purchasingRatio: n("1"), defaultPrice: n("18.00") }),
      ],
      bomLines: [
        bomLine(2, "QA Loaf", "QA-1", "QA Flour", "250.0000"),
        bomLine(3, "QA Loaf", "QA-1", "QA Bag", "1.0000"),
        bomLine(4, "QA Old Loaf", "QA-OLD", "QA Flour", "100"),
      ],
      stockLevels: [
        { ref: ref("stock.csv", 2), name: "QA Flour", sku: "", location: "QA Store", quantity: n("12345.678") },
        { ref: ref("stock.csv", 3), name: "QA Bag", sku: "", location: "QA Store", quantity: n("50") },
        { ref: ref("stock.csv", 4), name: "QA Salt", sku: "", location: "QA Store", quantity: n("10") },
      ],
      purchaseOrderLines: [po(2, "PO-1", "QA Flour", "12.35000", "kg's"), po(3, "PO-2", "QA Bag", "2.03000", "Bags")],
      images: [],
      barcodes: [],
      costReference: [],
      workbookBomCosts: [],
      productRange: [],
      contacts: [],
      discontinuedNames: [{ ref: ref("setup.xlsx", 9), name: "QA Old Loaf" }],
    };
  }

  const B_ROWS = {
    vyron_cost_suppliers: [{ id: "b-supplier-1", company_id: B, supplier_name: "QA Mills", contact_email: "other@tenant.test" }],
    vyron_cost_ingredients: [{ id: "b-ing-1", company_id: B, ingredient_name: "QA Flour", purchase_cost: 1 }],
    vyron_cost_products: [{ id: "b-prod-1", company_id: B, product_name: "QA Loaf", sku: "QA-1", selling_price: 99 }],
    vyron_contacts: [{ id: "b-contact-1", company_id: B, contact_name: "QA Mills", is_supplier: true }],
  };

  function seed() {
    return {
      vyron_cost_companies: [{ id: A, name: "QA Pantry (Pty) Ltd" }, { id: B, name: "Other QA Tenant" }],
      vyron_workspaces: [{ id: "ws-a", company_id: A }, { id: "ws-b", company_id: B }],
      vyron_import_source_links: [],
      vyron_import_runs: [],
      vyron_cost_categories: [],
      vyron_cost_stock_items: [],
      vyron_cost_stock_ledger: [],
      vyron_cost_boms: [],
      vyron_cost_bom_lines: [],
      vyron_inventory_audit_log: [],
      vyron_cost_low_stock_alerts: [],
      ...structuredClone(B_ROWS),
    };
  }

  return { A, B, C, qaSources, B_ROWS, seed };
}
