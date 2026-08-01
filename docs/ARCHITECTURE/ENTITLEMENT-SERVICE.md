# VYRON — Platform Entitlement Service

**Status:** Production. Implemented and covered by a permanent regression test.
**Location:** `src/lib/platform/entitlement/`
**Import:** `import { resolveCompanyPackage } from "@/lib/platform/entitlement";`
**Regression test:** `scripts/verify-entitlement-resolution.mjs` — 38 checks, no database required.

---

## 1. Responsibility

**The single authoritative source of package entitlement for every VYRON product.**

> **No other module may resolve a package independently.**

It answers one question — *what is this company licensed for?* — and every limit, gate and allowance in the platform derives from that answer.

It was originally written as `AiEntitlementResolver` under `platform/ai/`, because AI allowance was the first consumer. It was never AI-specific, and the name obscured that. It now serves AI allowance, server-side feature gating, and the limit surfaces in §7.

---

## 2. The trust boundary

> **A browser cookie, localStorage value, request header or request body is NEVER authoritative for licensing, entitlement, limits or feature access. It may be used for UI convenience only.**

This rule exists because it was once broken, in two places:

| Defect | Consequence |
|---|---|
| `AiUsageService.checkAllowance` took the package from `resolveSubscription()` → `cookies()` | A stale cookie carrying `"Starter"` resolved the zero-limit tier. The first recorded usage produced an `Infinity` ratio and every later request was refused with `AI_ALLOWANCE_EXCEEDED`, for a customer whose database record said Professional. |
| `requirePackageFeature` took the package from `getServerActiveWorkspace()?.packageName` | ~45 API routes — purchase orders, procurement, stores, inventory transactions, production planning, forecasting — gated on a client-editable value. Setting `packageName: "Enterprise"` in the cookie unlocked every gated feature server-side. |

Both now resolve through this service.

**Entitlement fails open; authentication and permissions fail closed.** These are different boundaries. If the database is unreachable, refusing service to paying customers is worse than briefly granting a default tier. Identity and permission checks run *before* entitlement and are unaffected by this choice.

---

## 3. Authoritative data source

**Canonical: `vyron_workspaces.package_name`.**

`vyron_cost_companies.subscription_plan` is a **fallback only**, for companies with no workspace row.

Why the workspace wins:

1. **The workspace is the licensing unit.** It carries `package_name`, `user_limit` and `status` together. Entitlement is a property of the workspace, not an attribute of the company.
2. **It is already what the application treats as the package.** `vyron-saas-workspace.ts:166` maps `row.package_name` into the workspace model that feeds every UI surface *and* the session cookie. Reading the same column for entitlement means the licensed limits and the displayed package cannot disagree.
3. **`subscription_plan` is a denormalised copy.** It is written once at company creation (`vyron-saas-workspace.ts:680`) from the same input that writes `package_name` (line 692). It is not an independent record.

**Divergence is detected, reported and never silently absorbed.** When the two disagree, the workspace value is used and a warning is logged naming both. A divergence is a data defect to be corrected at source, not something the resolver should quietly paper over.

---

## 4. Resolution order

```
resolveCompanyPackage(companyId)

  1. vyron_workspaces.package_name          ← CANONICAL
       (preferring status Live > Active > Setup > Demo)
  2. vyron_cost_companies.subscription_plan ← fallback, no workspace row
  3. caller-supplied fallback               ← the cookie value, ONLY if 1 and 2 yield nothing
  4. SYSTEM_DEFAULT_PACKAGE ("Professional")← nothing at all
```

Every result reports which rung it came from, via `source`:

| `source` | Meaning |
|---|---|
| `workspace.package_name` | Canonical. The normal case. |
| `company.subscription_plan` | No workspace row carried a package. |
| `caller-supplied-fallback` | Database yielded nothing; the cookie value was used. **Visible, never silent.** |
| `system-default` | No database value, no fallback supplied. |

The cookie can only ever reach rung 3, and only when the database is silent.

---

## 5. Override order

Overrides live in `vyron_ai_company_allowances` and layer on top of the resolved package:

```
company package (§4)
      ↓
package_id_override        ← replaces the package entirely
      ↓
monthly_credits_override   ┐
monthly_spend_usd_override ├─ replace individual tier numbers
monthly_requests_override  ┘
```

Two properties worth knowing:

- **`package_id_override` was previously read and discarded.** `getAllowanceOverride` returned it and `checkAllowance` never passed it on, so an administrator setting it saw no effect. It is now applied.
- **Numeric overrides only apply keys that are actually set.** A naive `{ ...base, ...override }` spread copies `undefined`-valued keys and silently wipes the tier default; `resolveTierAllowance` filters them first.

---

## 6. Consumers

### 6.1 Feature gating

`requirePackageFeature(feature)` in `src/lib/vyron-workspace-access.ts` — used by ~45 API routes. Resolves `companyId`, calls the service, then `hasFeature`. Throws `403 Feature not included in current package.`

The service also exposes `companyHasFeature(companyId, feature)` for callers outside the request-guard path.

### 6.2 AI allowance

`AiUsageService.checkAllowance({ companyId })` resolves the package here, applies overrides (§5), then computes ratios against `AI_TIER_ALLOWANCES`.

`packageName` remains an optional parameter for signature compatibility. **It is a fallback only and is never preferred over a database value.** Callers should stop supplying it.

### 6.3 Display

`resolveSubscription()`, `readActiveClient()` and the sidebar/banner components still read the cookie and localStorage. **This is permitted and correct** — they render a label. They enforce nothing.

---

## 7. Extension points

Surfaces this service will own. Each is named so that when it is built, it is built here rather than re-deriving a package independently.

| Surface | Status |
|---|---|
| AI allowance | **Implemented** — `AiUsageService` |
| Feature gating | **Implemented** — `requirePackageFeature` |
| User limits | **To build** — currently `vyron_workspaces.user_limit`, read ad hoc |
| Storage limits | **To build** — no enforcement exists |
| API rate limits | **To build** — no enforcement exists |
| Billing limits | **To build** |
| Product licensing | **To build** — multi-product entitlement across the `src/platform/products` registry (COST, CORE, PAY, FARM, REACH) |

**Rule for adding one:** add a function to this service. Do not add a package lookup to the consuming module.

---

## 8. Caching

**There is none, deliberately.** No `unstable_cache`, no `cache()`, no `revalidate` anywhere in the entitlement or AI allowance path. Every check queries the database.

Consequences, all verified:

- Changing a company's package takes effect **immediately**.
- Changing any override takes effect **immediately**.
- **No logout/login is required.**
- **No cookie refresh is required** — the cookie is not read for entitlement.

If caching is ever introduced it must be explicitly invalidated on package and override change, and this section must be rewritten. A stale entitlement cache would reintroduce the original defect by a different route.

---

## 9. Regression protection

`scripts/verify-entitlement-resolution.mjs` — Family A under the Repository Safety Programme; no database, no credentials, no network. The Supabase client is injected, so it exercises the shipped logic directly.

The two cases that must never regress:

```
Database = Professional, Cookie = Starter     →  Professional
Database = Starter,      Cookie = Enterprise  →  Starter
```

It additionally asserts all 16 tier-pair combinations (a cookie may neither upgrade nor downgrade), canonical-source precedence, divergence reporting, the full fallback ladder, and that failure modes never resolve to the zero-limit Starter tier.

```bash
node scripts/verify-entitlement-resolution.mjs
```

---

## 10. Architecture

```
                    ┌──────────────────────────────────────┐
   cookie /         │  UI: sidebar, banners, page shells   │
   localStorage ───►│  DISPLAY ONLY — enforces nothing     │
                    └──────────────────────────────────────┘

                    ┌──────────────────────────────────────┐
                    │   PLATFORM ENTITLEMENT SERVICE       │
                    │   src/lib/platform/entitlement/      │
                    │                                      │
                    │   resolveCompanyPackage(companyId)   │
                    │   companyHasFeature(companyId, f)    │
                    └───────────────┬──────────────────────┘
                                    │ reads (never cookies)
                    ┌───────────────▼──────────────────────┐
                    │  vyron_workspaces.package_name       │ ← CANONICAL
                    │  vyron_cost_companies.subscription_  │ ← fallback
                    │  vyron_ai_company_allowances         │ ← overrides
                    └───────────────┬──────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
   ┌──────────▼────────┐ ┌──────────▼────────┐ ┌──────────▼────────┐
   │  Feature gating   │ │   AI allowance    │ │  Future limits    │
   │  ~45 API routes   │ │  AiUsageService   │ │  users, storage,  │
   │  403 if excluded  │ │  402 if exceeded  │ │  API, billing     │
   └───────────────────┘ └───────────────────┘ └───────────────────┘
```

---

## 11. Reuse across the VYRON ecosystem

The service has no VYRON COST-specific logic. Two things must be parameterised before adoption elsewhere:

1. **Table names** — `vyron_workspaces`, `vyron_cost_companies`, `vyron_ai_company_allowances` are hard-coded.
2. **Tier definitions** — `AI_TIER_ALLOWANCES` lives in `AiTierEnforcement.ts` and is COST-specific; a shared service needs per-product tier tables.

The **resolution order, override order, trust boundary and fail-open policy are product-neutral** and should be adopted unchanged. Per the Repository Safety Programme's guidance, audit any repository before extending this to it.
