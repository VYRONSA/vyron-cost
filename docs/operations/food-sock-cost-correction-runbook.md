# Food Sock cost-precision correction — runbook

Operator procedure for the one controlled correction left open by the Food Sock
demo import (run `e6fcb6fa-36ed-4c63-bfef-370ef2116c04`). **Nothing in this
document has been executed.** Steps marked **WRITE** need a separate, explicit
production approval.

Tooling: `scripts/food-sock-cost-correction.mjs` (Family P),
`src/lib/data-migration/food-sock-cost-correction.ts`, migrations
`20260917090000_vyron_ingredient_cost_precision.sql` and
`20260917100000_food_sock_cost_precision_correction.sql`, proven by
`scripts/test-food-sock-cost-correction-pg.mjs`.

## 1. What it corrects, and nothing else

| Row | Field | From | To |
|---|---|---:|---:|
| Ingredient `03097405-22d1-42a5-bbcf-7162910848d4` Date Sticker | `purchase_cost`, `true_unit_cost` | 0.05 | 0.05064 |
| Ingredient `8a83683d-0475-42db-bb1c-2758b08ec2c2` Insert Sleeve | `purchase_cost`, `true_unit_cost` | 0.32 | 0.3164 |
| Date Sticker stock item (resolved from the data by the dry run) | `average_cost` | 0.0506 | 0.05064 |
| same | `inventory_value` | 2844.48 | 2846.73 (= its opening ledger value) |

The Insert Sleeve stock item is verified consistent (24058.75 × 0.3164 =
7612.19) and is not changed. BOM lines, BOMs, products, the ledger, import runs
and source links are not changed; the database function refuses and rolls
everything back if anything but these three rows changes.

The costs are the `Cost` column of the client's product export (Date Sticker
row 54, Insert Sleeve row 53). The dry run prints the file's SHA-256; compare it
with ‹pack: Source files›.

## 2. Schema (WRITE, additive)

`20260917090000` widens `vyron_cost_ingredients.purchase_cost` and
`true_unit_cost` from `numeric(12,2)` to `numeric(18,8)`, the scale BOM lines
and stock items already use. Existing values are unchanged. From then on, an
ingredient cost saved with more than two decimals keeps up to eight, for every
tenant.

`20260917100000` creates `vyron_data_corrections` (append-only, RLS on, no
policies) and `apply_food_sock_cost_precision_correction()` (service role only).

```sh
npx supabase migration list --linked      # only these two may be local-only
npx supabase db push --linked --dry-run   # must list exactly these two
npx supabase db push --linked
```

## 3. Dry run and approval

```sh
VYRON_ENV=production node scripts/food-sock-cost-correction.mjs \
  --sources <dir> --company e920c747-1d27-4d01-9e7c-182f9a7d0aa3 \
  --expect-database <REF> --verify-deterministic
```

Required: `Status: READY`, no blockers, the resolved Date Sticker stock item
reported, and the source SHA-256 equal to the pack. Record the plan hash `<H>`.
The named approver approves `<H>`. The approval is then pinned by a reviewed
commit setting `APPROVED_PLAN_HASH = "<H>"` in
`src/lib/data-migration/food-sock-cost-correction.ts`. Until then `--execute`
refuses.

## 4. Controlled execution (WRITE)

```sh
VYRON_ENV=production VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 \
node scripts/safety/run.mjs food-sock-cost-correction \
  --approver "<approver>" \
  --acknowledge "RUN FOOD-SOCK-COST-CORRECTION AGAINST PRODUCTION WITH NO-EXTERNAL" \
  --report .migration-reports/food-sock/cost-correction/safety.json \
  -- --sources <dir> --company e920c747-1d27-4d01-9e7c-182f9a7d0aa3 \
     --expect-database <REF> --execute --approve-plan-hash <H> \
     --approver "<approver>" --reason "<reason>" \
     --acknowledge "CORRECT FOOD SOCK COST PRECISION <H12> IN e920c747-1d27-4d01-9e7c-182f9a7d0aa3"
```

One transaction: all three rows and the `vyron_data_corrections` record, or
nothing. A repeat returns `already_applied` and changes nothing.

## 5. Verification (read-only)

- The dry run now reports `ALREADY_APPLIED` with no blockers.
- `vyron_data_corrections` holds one row for `food-sock-cost-precision-2026-09`
  with the approver, reason, plan hash, and previous and new values.
- The Date Sticker stock item's `inventory_value` equals its opening ledger
  value (2846.73).
- `food-sock-migration.mjs --validate` still passes.
- The original migration run is unchanged.

## 6. Stop conditions

Stop if: the dry run is not READY; the source hash differs from the pack; the
migration dry run lists anything else; the rebuilt hash is not the approved
one; the function refuses (nothing will have changed — report its message);
any verification in §5 differs.
