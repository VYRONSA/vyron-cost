# Catalogue snapshot for UAT

A snapshot is a **file**. Nothing in VOLORA exports one, and nothing in this
repository connects to a live tenant to produce one — by design. Whoever holds
the non-production copy produces the file and hands it over.

The UAT runner refuses a snapshot that does not classify itself, and refuses one
whose stated environment looks like production.

```
npm run uat:food-sock -- --catalogue <file.json>               run the scenarios
npm run uat:food-sock -- --catalogue <file.json> --check-only  catalogue report only
npm run uat:food-sock -- --catalogue <file.json> --json <out>  write the report
```

## Where it may come from

A restore of a backup, a staging copy, or any environment that is not the live
one. Take it there, not from production. Nothing in the file is written back
anywhere: it is loaded into memory, re-homed onto a fictional UAT tenant, and
discarded when the run ends.

## The file

```json
{
  "classification": "NON-PRODUCTION / UAT",
  "meta": {
    "environment": "uat-restore",
    "source": "restore of the backup taken 2026-10-01",
    "takenAt": "2026-10-01"
  },

  "products":   [{ "id": "…", "product_name": "…", "sku": "…", "selling_price": 61, "total_cost": 26, "status": "Active" }],
  "stockItems": [{ "id": "…", "entity_type": "finished_goods", "entity_id": "<product id>", "qty_on_hand": 120, "unit": "each" }],
  "boms":       [{ "id": "…", "product_id": "<product id>", "bom_name": "…", "yield_qty": 1 }],
  "bomLines":   [{ "id": "…", "bom_id": "<bom id>", "ingredient_id": "<component id>", "line_name": "…", "quantity": 0.18, "unit": "kg", "wastage_percent": 5 }],

  "customers":             [{ "id": "…", "customer_name": "…", "status": "Active", "active": true }],
  "priceLists":            [{ "id": "…", "name": "…", "status": "Active" }],
  "priceListVersions":     [{ "id": "…", "price_list_id": "…", "version_no": 1, "status": "Active", "effective_from": "2026-01-01" }],
  "priceListAssignments":  [{ "id": "…", "customer_id": "…", "contract_price_list_id": "…", "default_price_list_id": null, "status": "Active" }],
  "priceListItems":        [{ "id": "…", "price_list_id": "…", "product_id": "…", "final_price": 58, "status": "Active", "effective_from": "2026-01-01" }],
  "policies":              [{ "id": "…", "customer_id": "…", "require_po": true, "require_delivery_date": true, "enforce_case_quantity": false, "min_order_value": null, "min_gp_pct": null, "delivery_weekdays": null }],
  "packSizes":             [{ "id": "…", "product_id": "…", "units_per_box": 12, "confidence": "Confirmed" }],
  "productAliases":        [{ "id": "…", "customer_id": "…", "source_code_normalized": "sku:CUSTOMER-CODE", "product_id": "…" }],
  "customerIdentities":    [{ "id": "…", "external_reference": "woocommerce:store:4242", "customer_id": "…" }]
}
```

`classification`, `meta.environment`, `products`, `stockItems`, `boms` and
`bomLines` are required. Everything else is optional, and what is left out is
simply reported as not covered — never assumed.

**Do not include** customer contact details, addresses, e-mail addresses,
historical orders, invoices or anything else the scenarios do not need. The
orders used in UAT are fictional; nothing about a real person is required.

## What the run tells you

**Coverage** — how much of the catalogue can actually be ordered from: SKUs,
cost, stock, BOMs, case sizes, customer pricing, customer rules and mappings.

**Reconciliation** — the counts against the controlled Food Sock migration
(31 products, 31 BOMs, 348 BOM lines, 51 components, 82 stock items), so a
partial or unexpected extract is noticed before anyone reads the results.

**Catalogue exceptions**, each classified:

| Kind | Meaning | Who fixes it |
|---|---|---|
| DATA | The catalogue is incomplete: no SKU, a duplicate SKU, no cost, no stock record, no BOM, a BOM with no components, two customers with the same name, a code mapped to two products. | The business, in the data |
| DECISION | The engine needs a business decision: no price list for a customer, no ordering rules, no list price. | The business, in Order rules |
| ENGINEERING | The file itself is inconsistent — a BOM line whose BOM is not in the file, a BOM whose product is not in the file. The extract is incomplete. | Whoever produced the snapshot |

**Scenario results**, each one of:

| Verdict | Meaning |
|---|---|
| PASS | It did what the scenario says it should. |
| BLOCKED — BUSINESS DECISION | Something the business has not decided stopped it. |
| BLOCKED — DATA | Something the catalogue is missing stopped it, or the catalogue has no product of the shape that scenario needs. |
| FAIL — ENGINEERING | The application is wrong. Only this fails the run. |
