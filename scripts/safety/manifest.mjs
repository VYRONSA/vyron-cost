/**
 * VYRON Repository Safety Programme — asset metadata.
 *
 * Priority 3 of RSP Phase 1. Every executable asset declares its safety
 * properties once; the execution banner and every gate derive from this
 * declaration rather than from the filename or from an operator's memory.
 *
 * WHY A CENTRAL REGISTER RATHER THAN 50 FILE HEADERS
 * --------------------------------------------------
 * RSP Phase 1 forbids modifying validation assets. Declaring metadata inside
 * each asset would mean editing 50 files, which is precisely the behavioural
 * risk this phase is scoped to avoid. The register below is therefore the
 * source of truth today, and it is still a single declaration per asset.
 *
 * `readInlineManifest()` additionally reads an optional `@vyron-safety` header
 * block from an asset's own source. When present it overrides the register.
 * This gives Phase 2 an incremental migration path — assets can adopt inline
 * declarations as they are refactored for other reasons, with no change to any
 * consumer of this module.
 *
 * Classification evidence: docs/TEST-INFRASTRUCTURE-AUDIT.md
 * Classification rules:    docs/REPOSITORY-SAFETY-HARDENING-PLAN.md Part 2
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/** Risk is a property of the family, not an independent judgement. */
export const RISK_BY_FAMILY = {
  A: "SAFE",
  B: "LOW",
  C: "HIGH",
  D: "CRITICAL",
  tooling: "NOT-VALIDATION",
};

export const FAMILY_LABEL = {
  A: "A — Read-only",
  B: "B — Ephemeral",
  C: "C — Persistent",
  D: "D — External",
  tooling: "Non-validation tooling",
};

/** Plan Part 3 §3.2. `null` means the family is permitted in no environment. */
export const FAMILY_ENVIRONMENTS = {
  A: ["development", "pat", "staging", "production"],
  B: ["development", "pat"],
  C: ["pat"],
  D: ["pat"],
  tooling: ["development"],
};

/** Families requiring a named approver per execution (Plan Part 2). */
export const FAMILY_REQUIRES_APPROVAL = { A: false, B: false, C: true, D: true, tooling: false };

const A = "A";
const B = "B";
const C = "C";
const D = "D";

/**
 * The asset register.
 *
 * `cleanup` records the OBSERVED state at audit time, not the desired state:
 *   n/a        — asset does not mutate
 *   complete   — tears down everything it creates, on the paths it handles
 *   partial    — teardown omits entities the asset created
 *   none       — no teardown at all
 *   external   — teardown cannot reverse the asset's external effects
 * No asset is recorded as `verified`; per Plan §7.5 none verifies its teardown.
 */
const REGISTER = [
  // ─── Family A — Read-only ────────────────────────────────────────────────
  {
    id: "validate-schema-drift",
    file: "scripts/validate-schema-drift.mjs",
    family: A,
    purpose: "Schema parity across 22 tables by exact column-list probe; exits 1 on drift.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Registered as `npm run validate:schema`.",
  },
  {
    id: "deployment-verification-remaining-modules",
    file: "scripts/deployment-verification-remaining-modules.mjs",
    family: A,
    purpose: "Declarative requirements check across 21 modules; writes deployment-gap-report.json.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Only writes are to a local report file.",
  },
  {
    id: "verify-sales-order-schema",
    file: "scripts/verify-sales-order-schema.mjs",
    family: A,
    purpose: "Sales-order schema via information_schema / pg_indexes / table_constraints.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Queries catalog interfaces that are blocked through PostgREST; likely non-functional.",
  },
  {
    id: "verify-sales-order-schema-runtime",
    file: "scripts/verify-sales-order-schema-runtime.mjs",
    family: A,
    purpose: "Sales-order schema via table/column probes that work through PostgREST.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. The working replacement for verify-sales-order-schema.",
  },
  {
    id: "tmp-schema-probe",
    file: "scripts/tmp-schema-probe.cjs",
    family: A,
    purpose: "Row counts across 15 manufacturing/inventory tables.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Overlaps validate-schema-drift; consolidation candidate.",
  },
  {
    id: "tmp-schema-alignment-probe",
    file: "scripts/tmp-schema-alignment-probe.cjs",
    family: A,
    purpose: "Column-list probe: stock counts, count lines, finished goods.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Consolidation candidate.",
  },
  {
    id: "tmp-column-exists-probe",
    file: "scripts/tmp-column-exists-probe.cjs",
    family: A,
    purpose: "Per-column existence probe including speculative columns.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Discovery aid; consolidation candidate.",
  },
  {
    id: "tmp-manufacturing-audit",
    file: "scripts/tmp-manufacturing-audit.cjs",
    family: A,
    purpose: "Column-list probe across 8 production tables.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Consolidation candidate.",
  },
  {
    id: "tmp-inventory-foundation-audit",
    file: "scripts/tmp-inventory-foundation-audit.cjs",
    family: A,
    purpose: "Column-list probe across 11 inventory tables.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Consolidation candidate.",
  },
  {
    id: "tmp-meta-probe",
    file: "scripts/tmp-meta-probe.cjs",
    family: A,
    purpose: "Tests reachability of information_schema, pg_indexes, pg_constraint, supabase_migrations.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. One-time capability question; retire once recorded.",
  },
  {
    id: "tmp-migration-history-probe",
    file: "scripts/tmp-migration-history-probe.mjs",
    family: A,
    purpose: "Searches 6 candidate migration-history table names.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. One-time discovery question; retire once recorded.",
  },
  {
    id: "tmp-check-product-financial-columns",
    file: "scripts/tmp-check-product-financial-columns.mjs",
    family: A,
    purpose: "Lists financial_* columns on vyron_cost_products.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Depends on blocked information_schema access; likely non-functional.",
  },
  {
    id: "tmp-live-constraint-proof",
    file: "scripts/tmp-live-constraint-proof.mjs",
    family: A,
    purpose: "Probes constraint visibility, and whether run_sql / exec_sql RPCs are exposed.",
    authentication: ["service-role"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.3. Security-relevant capability probe (Plan Unknown 13.6); record the answer, then retire.",
  },
  {
    id: "verify-master-data-integrity",
    file: "scripts/verify-master-data-integrity.mjs",
    family: A,
    purpose: "Verifies Phase 0 deterministic logic: CSV parser, Supplier Resolution hierarchy, duplicate invoice layers.",
    authentication: ["none"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence:
      "Product Gap Resolution Phase 0. Imports the production modules directly (src/lib/vyron-csv-parser.ts, vyron-supplier-resolution.ts, vyron-duplicate-invoice-detection.ts) so it tests shipped logic rather than a copy. No database, no credentials, no network, no application server. 69 checks.",
  },
  {
    id: "verify-entitlement-resolution",
    file: "scripts/verify-entitlement-resolution.mjs",
    family: A,
    purpose: "Regression test proving the database, not the browser cookie, is authoritative for package entitlement.",
    authentication: ["none"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence:
      "Guards the AI Entitlement Architecture v2 fix. Imports src/lib/platform/entitlement/EntitlementService.ts with an injected Supabase stand-in — no database, no credentials, no network. Asserts DB beats cookie across all 16 tier pairs, plus canonical-source precedence, divergence reporting, the fallback ladder and fail-open behaviour. 38 checks.",
  },
  {
    id: "visual-capture",
    file: "scripts/visual-capture.mjs",
    family: A,
    purpose: "Playwright capture of 13 routes x 3 viewports; reports console errors, redirects, HTTP status.",
    authentication: ["none"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.2. No database access. Highest-quality asset in the repository.",
  },
  {
    id: "tmp-run-marker",
    file: "scripts/tmp-run-marker.ps1",
    family: A,
    purpose: "Writes a marker file. Dead.",
    authentication: ["none"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.6. Paths reference a different machine's user profile; retire.",
  },

  // ─── Family B — Ephemeral ────────────────────────────────────────────────
  {
    id: "test-branches-warehouses-module-certification",
    file: "scripts/test-branches-warehouses-module-certification.mjs",
    family: B,
    purpose: "Branches / warehouses / store orders certification.",
    authentication: ["service-role", "user"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence: "Audit §3.4.1. cleanupWorkspace tears down 29 tables in FK order plus per-email user teardown. Reference implementation.",
  },
  {
    id: "test-procurement-critical-workflow",
    file: "scripts/test-procurement-critical-workflow.mjs",
    family: B,
    purpose: "Requisition to PO to GRN critical path.",
    authentication: ["service-role", "user"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence: "Audit §3.4.1. finally block clears 8 child tables then workspace, company, profile, auth user.",
  },
  {
    id: "test-user-management-module-certification",
    file: "scripts/test-user-management-module-certification.mjs",
    family: B,
    purpose: "User management certification.",
    authentication: ["service-role", "user"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence: "Audit §3.4.1. Tracked createdUserIds array plus workspace teardown.",
  },
  {
    id: "test-companies-module-certification",
    file: "scripts/test-companies-module-certification.mjs",
    family: B,
    purpose: "Company lifecycle, tenant isolation, platform-admin flows.",
    authentication: ["service-role", "user", "platform-admin"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence:
      "Audit §3.4.1 and §3.4.2c. Creates a real PLATFORM_ADMIN. Teardown is bounded at 10 pages x 200 = 2,000 auth users and returns silently past that — the highest-consequence cleanup fragility in the suite.",
  },
  {
    id: "test-pdf-export-module-certification",
    file: "scripts/test-pdf-export-module-certification.mjs",
    family: B,
    purpose: "Report export certification: permissions, tenant isolation, filters, empty states.",
    authentication: ["service-role", "user"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence: "Audit §3.4.1. Tracked seededStockItemIds plus workspace teardown.",
  },
  {
    id: "test-roles-permissions-module-certification",
    file: "scripts/test-roles-permissions-module-certification.mjs",
    family: B,
    purpose: "Roles, permission grant/revoke, privilege-escalation denial, unauthenticated 401.",
    authentication: ["service-role", "user"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence: "Audit §3.4.1 and §7. Two-tenant teardown. Strongest authorisation coverage in the repository.",
  },
  {
    id: "test-intelligence-modules-certification",
    file: "scripts/test-intelligence-modules-certification.mjs",
    family: B,
    purpose: "AI dashboards, demand forecasting, enterprise search.",
    authentication: ["service-role", "user", "anonymous"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence:
      "Audit §3.4.1. NOTE: /api/cost-ai-insights and /api/demand-forecast do NOT call OpenAI (verified in src/app/api), so no AI spend. Lines 176 and 179 assert two search endpoints succeed WITHOUT cookies — Plan Unknown 13.9.",
  },
  {
    id: "tmp-status-check-behavior",
    file: "scripts/tmp-status-check-behavior.mjs",
    family: B,
    purpose: "Enumerates accepted values of the vyron_customer_invoices status CHECK constraint.",
    authentication: ["service-role"],
    mutation: "ephemeral",
    external: [],
    cleanup: "complete",
    evidence: "Audit §3.4.1. Deletes the probe invoice and company in finally.",
  },

  // ─── Family C — Persistent ───────────────────────────────────────────────
  {
    id: "test-uom-module-certification",
    file: "scripts/test-uom-module-certification.mjs",
    family: C,
    purpose: "Units-of-measure certification.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1. Teardown covers workspace/company/user only; module rows orphaned.",
  },
  {
    id: "test-manufacturing-lifecycle-enterprise",
    file: "scripts/test-manufacturing-lifecycle-enterprise.mjs",
    family: C,
    purpose: "Production run lifecycle: create, start, complete, approve, reverse; cost roll-up.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence:
      "Audit §3.4.2b. cleanupWorkspace deletes 3 rows while the script creates production runs, run lines, an audit log, products, stock items and finished goods — all orphaned with a company_id pointing at a deleted company.",
  },
  {
    id: "test-finished-goods-critical-workflow",
    file: "scripts/test-finished-goods-critical-workflow.mjs",
    family: C,
    purpose: "Finished-goods critical path.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1. finally covers workspace/company/user only.",
  },
  {
    id: "test-master-data-integrity-audit",
    file: "scripts/test-master-data-integrity-audit.mjs",
    family: C,
    purpose: "Cross-module master-data integrity and flag propagation.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1. finally covers workspace/company/user only.",
  },
  {
    id: "tmp-deployment-verification",
    file: "scripts/tmp-deployment-verification.mjs",
    family: C,
    purpose: "Cross-module deployment verification (writing variant).",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence:
      "Audit §3.4.1. Products, stock items, ledger and audit-log rows orphaned. Name collides with the read-only deployment-verification-remaining-modules; rename in Phase 2.",
  },
  {
    id: "tmp-customer-invoice-production-check",
    file: "scripts/tmp-customer-invoice-production-check.mjs",
    family: C,
    purpose: "Customer invoicing production-path check.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1.",
  },
  {
    id: "tmp-customer-invoice-validation",
    file: "scripts/tmp-customer-invoice-validation.mjs",
    family: C,
    purpose: "Customer invoice create, post stock, verify inventory reduction, reverse.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1.",
  },
  {
    id: "tmp-customer-balance-statement-check",
    file: "scripts/tmp-customer-balance-statement-check.mjs",
    family: C,
    purpose: "Customer outstanding balance and statement verification.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1.",
  },
  {
    id: "tmp-runtime-failure-probe",
    file: "scripts/tmp-runtime-failure-probe.mjs",
    family: C,
    purpose: "Reproduction of an inventory-adjustment failure, with audit-log capture.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence: "Audit §3.4.1. Product and stock item are never deleted. Genuine gap-validation asset (GAP-003); promote, do not retire.",
  },
  {
    id: "test-client-archive",
    file: "scripts/test-client-archive.mjs",
    family: C,
    purpose: "Workspace archive and delete verification.",
    authentication: ["service-role"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence: "Audit §3.4.1. Cleans up only by reaching its final DELETE API call, past five process.exit(1) sites.",
  },
  {
    id: "test-permissions",
    file: "scripts/test-permissions.mjs",
    family: C,
    purpose: "Permission enforcement: session permissions, 403 on denied routes.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence:
      "Audit §3.4.2a. Creates a company, workspace, auth user, profile, membership and a supplier; deletes none of it. Every execution permanently adds a tenant and two users.",
  },
  {
    id: "test-invoice-stock",
    file: "scripts/test-invoice-stock.mjs",
    family: C,
    purpose: "Invoice to stock posting, idempotency and reversal, with ledger assertions.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence: "Audit §3.4.2a. Creates tenant, product, stock item, ledger entries and an invoice; no teardown.",
  },
  {
    id: "test-recipes-api",
    file: "scripts/test-recipes-api.mjs",
    family: C,
    purpose: "Recipe / BOM API surface.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence: "Audit §3.4.2a. Archives the recipe but leaves the tenant entirely.",
  },
  {
    id: "test-customer-selector",
    file: "scripts/test-customer-selector.mjs",
    family: C,
    purpose: "Customer selector field normalisation.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence: "Audit §3.4.2a.",
  },
  {
    id: "test-manage-login",
    file: "scripts/test-manage-login.mjs",
    family: C,
    purpose: "Owner login provisioning and /login flow.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence: "Audit §3.4.2a. Also the only asset that hard-codes localhost:3007 with no override — by accident, not design.",
  },
  {
    id: "test-customer-sales-orders-workflow",
    file: "scripts/test-customer-sales-orders-workflow.mjs",
    family: C,
    purpose: "Customer sales-order workflow and link tables.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "none",
    evidence: "Audit §3.4.1. No cleanup function and no finally block.",
  },
  {
    id: "certify-fg-export",
    file: ".tmp-fg-cert/certify-fg-export.mjs",
    family: C,
    purpose: "Finished-goods CSV/XLSX export certification with committed fixtures.",
    authentication: ["service-role", "user"],
    mutation: "persistent",
    external: [],
    cleanup: "partial",
    evidence:
      "Verified by inspection: operates inside a PRE-EXISTING tenant resolved from the committed cookies-test.txt session, seeds products and stock items into it and deletes them (cleanupSeededFixtures, lines 181-197), but vyron_inventory_audit_log rows generated by its writes are only read, never removed. Its committed fixtures are the only expected-outcome validation assets in the repository — promote them to pat/assets/ in Phase 1.",
  },

  // ─── Family D — External ─────────────────────────────────────────────────
  {
    id: "tmp-xero-live-target-check",
    file: "scripts/tmp-xero-live-target-check.mjs",
    family: D,
    purpose: "Enumerates every workspace holding live Xero tokens.",
    authentication: ["service-role"],
    mutation: "none",
    external: ["xero"],
    cleanup: "n/a",
    evidence:
      "Audit §3.3. Read-only by mechanism; Family D by Plan Rule 3 (reconnaissance escalation) — its output is the target list the other Xero assets consume.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-enterprise-financial-certification",
    file: "scripts/tmp-enterprise-financial-certification.mjs",
    family: D,
    purpose: "Chart-of-accounts sync certification.",
    authentication: ["service-role", "user", "system-integration"],
    mutation: "external",
    external: ["xero"],
    cleanup: "external",
    evidence:
      "Audit §5.1. Selects a workspace BECAUSE it holds a live Xero connection (lines 80-83), injects itself as OWNER, then runs select-organisation and sync-from-xero against the customer's real organisation.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-enterprise-financial-full-certification",
    file: "scripts/tmp-enterprise-financial-full-certification.mjs",
    family: D,
    purpose: "Full financial certification: chart sync plus product/category/customer/invoice records.",
    authentication: ["service-role", "user", "system-integration"],
    mutation: "external",
    external: ["xero"],
    cleanup: "external",
    evidence: "Audit §5.1. Same hijack pattern; tmp-enterprise-financial-certification is a strict subset of this asset.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-invoice-export-mapping-cert",
    file: "scripts/tmp-invoice-export-mapping-cert.ts",
    family: D,
    purpose: "Invoice export account-mapping precedence.",
    authentication: ["service-role", "user", "system-integration"],
    mutation: "external",
    external: ["xero"],
    cleanup: "external",
    evidence:
      "Audit §5.1. Runs save-defaults against the live tenant, overwriting the company-wide Xero account mapping; the prior value is never read and never restored.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-product-overrides-runtime-cert",
    file: "scripts/tmp-product-overrides-runtime-cert.ts",
    family: D,
    purpose: "Product financial override precedence, runtime path.",
    authentication: ["service-role", "user", "system-integration"],
    mutation: "external",
    external: ["xero"],
    cleanup: "external",
    evidence: "Audit §5.1. save-defaults, save-category, save-product against the live tenant.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-product-overrides-only-cert",
    file: "scripts/tmp-product-overrides-only-cert.mjs",
    family: D,
    purpose: "Product financial override precedence, verified against the exported Xero invoice.",
    authentication: ["service-role", "user", "system-integration"],
    mutation: "external",
    external: ["xero"],
    cleanup: "external",
    evidence:
      "Audit §5.1. Highest-severity asset in the repository: creates THREE real invoices per run in the live Xero organisation, and reads the customer's OAuth access token from the database to call api.xero.com directly (lines 129-135), bypassing the application's permission layer, audit log and rate limiting. Its 12-statement teardown cannot reverse any of it.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-xero-integration-regression-probe",
    file: "scripts/tmp-xero-integration-regression-probe.mjs",
    family: D,
    purpose: "Xero integration regression sweep.",
    authentication: ["service-role", "user", "system-integration"],
    mutation: "external",
    external: ["xero"],
    cleanup: "external",
    evidence:
      "Audit §5.1. Rotates the live OAuth refresh token (line 79), then runs sync-all-customers-now, sync-all-suppliers-now and sync-all-invoices-now — pushing every customer, supplier and invoice to the live organisation.",
    quarantine: "Plan Part 12 Phase 0. Prohibited pending rebuild.",
  },
  {
    id: "tmp-preview-e2e",
    file: "scripts/tmp-preview-e2e.ps1",
    family: D,
    purpose: "Document-intelligence end-to-end against a deployed Vercel preview.",
    authentication: ["captured-session"],
    mutation: "external",
    external: ["openai", "storage"],
    cleanup: "none",
    evidence:
      "Audit §3.6 and §5.2. The only asset exercising the AI extraction pipeline, and the only metered OpenAI path. Contains a hard-coded real session cookie with customer-identifying data. Not runnable — all paths reference a different machine's user profile.",
    quarantine: "Plan Part 12 Phase 0. Prohibited; purge rather than retire.",
  },
  {
    id: "test-po-enterprise-hardening",
    file: "scripts/test-po-enterprise-hardening.mjs",
    family: D,
    purpose: "PO hardening: discounts, approval workflow, PDF, attachments, email.",
    authentication: ["service-role", "user"],
    mutation: "external",
    external: ["storage", "email"],
    cleanup: "external",
    evidence:
      "Audit §4.5. Database teardown is complete, but it deletes vyron_documents ROWS with the service-role client, which cannot remove the storage object. Family D by Plan Rule 2 (reversibility). Email destination unverified — Plan Unknown 13.4.",
  },
  {
    id: "test-finished-goods-enterprise-phase8",
    file: "scripts/test-finished-goods-enterprise-phase8.mjs",
    family: D,
    purpose: "Finished-goods Phase 8: attachments, tenant isolation, permissions, manufacturing integration.",
    authentication: ["service-role", "user"],
    mutation: "external",
    external: ["storage"],
    cleanup: "external",
    evidence: "Audit §4.5. Uploads an attachment to the vyron-documents bucket; cleanupWorkspace removes neither the object nor the module rows.",
  },

  // ─── Non-validation tooling ──────────────────────────────────────────────
  {
    id: "generate-pwa-icons",
    file: "scripts/generate-pwa-icons.mjs",
    family: "tooling",
    purpose: "Renders PWA icons and splash images from the app icon SVG.",
    authentication: ["none"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.2. Build tooling; move to tools/ in Phase 1.",
  },
  {
    id: "import-handcrafted",
    file: "scripts/import-handcrafted.mjs",
    family: "tooling",
    purpose: "Transforms three Excel workbooks into data/generated/handcrafted-tenant.json.",
    authentication: ["none"],
    mutation: "none",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.2. Data tooling; move to tools/ in Phase 1.",
  },
  {
    id: "apply-api-permission-guards",
    file: "scripts/apply-api-permission-guards.mjs",
    family: "tooling",
    purpose: "One-shot codemod injecting permission guards into 43 API route handlers.",
    authentication: ["none"],
    mutation: "source",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.1. Rewrites production source by regex. Owned by Repository Governance, not RSP.",
  },
  {
    id: "fix-api-guard-placement",
    file: "scripts/fix-api-guard-placement.mjs",
    family: "tooling",
    purpose: "Repairs misplaced guards produced by apply-api-permission-guards.",
    authentication: ["none"],
    mutation: "source",
    external: [],
    cleanup: "n/a",
    evidence: "Audit §3.1. Imports `glob`, which is not declared in package.json. Owned by Repository Governance.",
  },
];

/**
 * Fixture residue patterns — Phase 2, Priority 3.
 *
 * Each asset names the tenants it creates with a literal prefix. Recording the
 * prefix lets the wrapper verify whether an asset's OWN cleanup succeeded,
 * without modifying the asset: count matching rows before, count after, compare.
 *
 * Every pattern below was read directly out of the asset's `.insert({ name: ... })`
 * call. An asset absent from this map cannot have its residue verified, and the
 * wrapper says so rather than reporting a clean result it did not establish.
 *
 * NOTE on test-manage-login: its company name is the CONSTANT "Broken Login Co"
 * with no run stamp, so residue from separate runs is indistinguishable and a
 * delta of zero does not prove the run cleaned up after itself. Flagged as
 * `ambiguous` so the report never overstates what the check proves.
 */
export const FIXTURE_PATTERNS = {
  "test-branches-warehouses-module-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "Warehouse Cert %" }],
  "test-client-archive": [{ table: "vyron_cost_companies", column: "name", pattern: "Archive Test %" }],
  "test-companies-module-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "Companies Cert %" }],
  "test-customer-sales-orders-workflow": [{ table: "vyron_cost_companies", column: "name", pattern: "SO Workflow %" }],
  "test-customer-selector": [{ table: "vyron_cost_companies", column: "name", pattern: "Selector Test %" }],
  "test-finished-goods-critical-workflow": [{ table: "vyron_cost_companies", column: "name", pattern: "FG Test %" }],
  "test-finished-goods-enterprise-phase8": [{ table: "vyron_cost_companies", column: "name", pattern: "FG Enterprise %" }],
  "test-intelligence-modules-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "Intelligence Cert %" }],
  "test-invoice-stock": [{ table: "vyron_cost_companies", column: "name", pattern: "Invoice Stock Test %" }],
  "test-manage-login": [{ table: "vyron_cost_companies", column: "name", pattern: "Broken Login Co", ambiguous: "Constant name with no run stamp — residue from separate runs is indistinguishable." }],
  "test-manufacturing-lifecycle-enterprise": [{ table: "vyron_cost_companies", column: "name", pattern: "MFG Enterprise %" }],
  "test-master-data-integrity-audit": [{ table: "vyron_cost_companies", column: "name", pattern: "MDA Test %" }],
  "test-pdf-export-module-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "PDF Cert %" }],
  "test-permissions": [{ table: "vyron_cost_companies", column: "name", pattern: "Perm Co %" }],
  "test-po-enterprise-hardening": [{ table: "vyron_cost_companies", column: "name", pattern: "PO Hardening %" }],
  "test-procurement-critical-workflow": [{ table: "vyron_cost_companies", column: "name", pattern: "Proc Test %" }],
  "test-recipes-api": [{ table: "vyron_cost_companies", column: "name", pattern: "Recipes Test %" }],
  "test-roles-permissions-module-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "Role Cert %" }],
  "test-uom-module-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "UOM Cert %" }],
  "test-user-management-module-certification": [{ table: "vyron_cost_companies", column: "name", pattern: "User Cert %" }],
  "tmp-customer-balance-statement-check": [{ table: "vyron_cost_companies", column: "name", pattern: "Balance Check %" }],
  "tmp-customer-invoice-production-check": [{ table: "vyron_cost_companies", column: "name", pattern: "Prod Invoice Check %" }],
  "tmp-customer-invoice-validation": [{ table: "vyron_cost_companies", column: "name", pattern: "Invoice E2E %" }],
  "tmp-deployment-verification": [{ table: "vyron_cost_companies", column: "name", pattern: "Deploy Verify %" }],
  "tmp-product-overrides-only-cert": [{ table: "vyron_cost_companies", column: "name", pattern: "POVR ISO %" }],
  "tmp-product-overrides-runtime-cert": [{ table: "vyron_cost_companies", column: "name", pattern: "POVR ISO %" }],
  "tmp-runtime-failure-probe": [{ table: "vyron_cost_companies", column: "name", pattern: "Probe %" }],
  "tmp-status-check-behavior": [{ table: "vyron_cost_companies", column: "name", pattern: "CHK PROBE %" }],
};

/**
 * Irreversible operations — Phase 2, Priority 2.
 *
 * What an acknowledgement must state before a Family D asset runs. Each entry
 * describes an effect that NO code in this repository can undo, taken from the
 * audit's per-asset evidence.
 */
export const IRREVERSIBLE_OPERATIONS = {
  "tmp-product-overrides-only-cert": [
    "Creates THREE real invoices in the connected Xero organisation (one per precedence step).",
    "Overwrites the tenant's company-wide Xero account mapping via save-defaults; the prior value is never captured.",
    "Blanks product and category Xero mappings to test inheritance fallback; the cleared state is not restored.",
    "Reads the tenant's OAuth access token from the database and calls api.xero.com directly, bypassing the application.",
  ],
  "tmp-xero-integration-regression-probe": [
    "Rotates the live OAuth refresh token. Xero refresh tokens are single-use; a failed write-back breaks the tenant's connection.",
    "Runs sync-all-customers-now, sync-all-suppliers-now and sync-all-invoices-now — pushing every customer, supplier and invoice to the live organisation.",
  ],
  "tmp-enterprise-financial-certification": [
    "Resynchronises the chart of accounts into the tenant's company scope.",
    "Issues select-organisation against the live Xero connection.",
  ],
  "tmp-enterprise-financial-full-certification": [
    "Resynchronises the chart of accounts into the tenant's company scope.",
    "Creates product, category, customer and invoice records under the live tenant's company_id.",
  ],
  "tmp-invoice-export-mapping-cert": [
    "Overwrites the tenant's company-wide Xero account mapping via save-defaults; the prior value is never captured.",
    "Writes category and product mappings into the live tenant.",
  ],
  "tmp-product-overrides-runtime-cert": [
    "Overwrites the tenant's company-wide Xero account mapping via save-defaults; the prior value is never captured.",
    "Writes category and product mappings into the live tenant.",
  ],
  "tmp-xero-live-target-check": ["Enumerates which tenants hold live Xero credentials. Read-only, but its output is the target list the other Xero assets consume."],
  "tmp-preview-e2e": [
    "Consumes metered OpenAI extraction quota.",
    "Uploads an object to the vyron-documents storage bucket in a DEPLOYED environment; nothing removes it.",
    "Authenticates with a committed session cookie belonging to a real identity.",
  ],
  "test-po-enterprise-hardening": [
    "Uploads an attachment to the vyron-documents storage bucket. Teardown deletes the vyron_documents ROW, which cannot remove the object.",
    "Dispatches email through the PO email path. Destination unverified (Hardening Plan Unknown 13.4).",
  ],
  "test-finished-goods-enterprise-phase8": ["Uploads an attachment to the vyron-documents storage bucket; cleanupWorkspace removes neither the object nor the module rows."],
};

/** Every registered asset, with derived fields resolved. */
export function listAssets() {
  return REGISTER.map(decorate);
}

function decorate(entry) {
  return {
    ...entry,
    risk: RISK_BY_FAMILY[entry.family],
    familyLabel: FAMILY_LABEL[entry.family],
    environments: FAMILY_ENVIRONMENTS[entry.family],
    requiresApproval: FAMILY_REQUIRES_APPROVAL[entry.family],
    quarantined: Boolean(entry.quarantine),
    fixtures: FIXTURE_PATTERNS[entry.id] || null,
    irreversible: IRREVERSIBLE_OPERATIONS[entry.id] || null,
    source: "register",
  };
}

/**
 * Resolve an asset by id, bare filename, or repo-relative path.
 * Returns null when the asset is not registered — callers must treat an
 * unregistered asset as unsafe, never as safe-by-default.
 */
export function findAsset(reference) {
  const needle = String(reference || "").trim();
  if (!needle) return null;

  const base = path.basename(needle).replace(/\.(mjs|cjs|ts|ps1)$/i, "");
  const normalised = needle.replace(/\\/g, "/");

  const match = REGISTER.find(
    (entry) =>
      entry.id === needle ||
      entry.id === base ||
      entry.file === normalised ||
      entry.file.endsWith(`/${normalised}`)
  );
  return match ? decorate(match) : null;
}

/**
 * Read an optional inline `@vyron-safety` declaration from an asset's source.
 *
 * Phase 2 migration path. Expected form, anywhere in the first 60 lines:
 *
 *   @vyron-safety {"family":"B","mutation":"ephemeral","external":[],"cleanup":"complete"}
 *
 * Returns null when absent or unparseable. An unparseable block is reported as
 * absent rather than throwing: a malformed comment must not stop a safety tool
 * from producing its banner.
 */
export function readInlineManifest(absolutePath) {
  let head = "";
  try {
    head = readFileSync(absolutePath, "utf8").split(/\r?\n/).slice(0, 60).join("\n");
  } catch {
    return null;
  }

  const marker = head.indexOf("@vyron-safety");
  if (marker === -1) return null;

  const start = head.indexOf("{", marker);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < head.length; i += 1) {
    if (head[i] === "{") depth += 1;
    if (head[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(head.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * The metadata a consumer should act on: the register entry, overlaid with any
 * inline declaration the asset makes about itself.
 */
export function resolveManifest(reference, absolutePath) {
  const registered = findAsset(reference);
  const inline = absolutePath ? readInlineManifest(absolutePath) : null;
  if (!registered && !inline) return null;

  const merged = { ...(registered || { id: String(reference), file: String(reference) }), ...(inline || {}) };
  if (inline) {
    merged.risk = RISK_BY_FAMILY[merged.family];
    merged.familyLabel = FAMILY_LABEL[merged.family];
    merged.environments = FAMILY_ENVIRONMENTS[merged.family];
    merged.requiresApproval = FAMILY_REQUIRES_APPROVAL[merged.family];
    merged.source = registered ? "register+inline" : "inline";
  }
  return merged;
}

/** Counts by family — used by the register report and by the Phase 1 evidence record. */
export function familyCounts() {
  const counts = { A: 0, B: 0, C: 0, D: 0, tooling: 0 };
  for (const entry of REGISTER) counts[entry.family] += 1;
  return counts;
}
