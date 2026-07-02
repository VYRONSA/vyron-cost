# Customer Sales Orders Schema Verification Report

Checked at: 2026-07-02T19:41:22.123Z
Source: Connected Supabase project from `.env.local`

Method note:
- Verification was performed via runtime table/column probes through Supabase service-role APIs.
- Direct `information_schema` access is not exposed via PostgREST in this environment, so type/default/index/FK definition diffs cannot be fully introspected from this runtime channel.

## 1) Tables (requested + migration scope)

| Object | Status | Notes |
|---|---|---|
| `vyron_customer_sales_orders` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_lines` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_allocations` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_invoice_links` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_audit` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_production_links` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_requisition_links` | ❌ Missing | Could not find table in schema cache |
| `vyron_customer_sales_order_items` | ⚠ Different definition | Current migrations/app use `vyron_customer_sales_order_lines` |

## 2) Customer commercial workflow columns

| Table | Column | Status |
|---|---|---|
| `vyron_customers` | `credit_limit` | ❌ Missing |
| `vyron_customers` | `on_hold` | ❌ Missing |
| `vyron_customers` | `invoice_email` | ✅ Exists |
| `vyron_customers` | `terms` | ✅ Exists |
| `vyron_customers` | `vat_number` | ✅ Exists |
| `vyron_customers` | `status` | ✅ Exists |
| `vyron_customers` | `active` | ✅ Exists |

## 3) Sales-order columns required by current code

Result: ❌ Missing

All probed columns on these tables returned missing-table errors:
- `vyron_customer_sales_orders`
- `vyron_customer_sales_order_lines`
- `vyron_customer_sales_order_allocations`
- `vyron_customer_sales_order_invoice_links`
- `vyron_customer_sales_order_audit`
- `vyron_customer_sales_order_production_links`
- `vyron_customer_sales_order_requisition_links`

## 4) Comparison summary

Expected schema from:
- `src/supabase/migrations/20260706_customer_sales_orders.sql`
- `src/supabase/migrations/20260707_customer_sales_orders_commercial_workflow.sql`

Current connected database:
- Sales-order workflow tables: ❌ Not synchronized
- Customer commercial control columns (`credit_limit`, `on_hold`): ❌ Not synchronized
- Legacy table name request (`..._items`): ⚠ Different definition (app uses `..._lines`)

## 5) Consolidated migration generated

Created:
- `src/supabase/migrations/20260708_customer_sales_orders_schema_sync.sql`

This migration is idempotent and includes:
- creation of all customer sales-order workflow tables and indexes
- commercial workflow columns (`requires_approval`, `approval_flags`)
- customer commercial columns (`credit_limit`, `on_hold`)
- compatibility view `vyron_customer_sales_order_items` mapped to `vyron_customer_sales_order_lines`
- PostgREST schema reload notification
