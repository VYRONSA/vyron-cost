# VYRON COST Backup Runbook

## Objective
Create a verified production backup before any high-risk deployment or incident response action.

## Preconditions
- Confirm maintenance window when backup is not routine.
- Confirm Supabase project access.
- Record current application commit and migration state.

## Procedure
1. Open the Supabase project for production.
2. Trigger or confirm the platform backup/snapshot for the production database.
3. Record backup identifier, timestamp, operator, and target environment.
4. Export row-count checkpoints for critical business tables:
   - `vyron_cost_purchase_orders`
   - `vyron_cost_goods_receipts`
   - `vyron_cost_production_runs`
   - `vyron_customer_sales_orders`
   - `vyron_customer_invoices`
5. Capture the currently deployed application commit hash.

## Verification
1. Confirm the backup artifact exists in Supabase backup history.
2. Confirm timestamp is within RPO.
3. Confirm row-count checkpoints were recorded.

## Evidence
- Backup ID
- Timestamp
- Operator
- Commit hash
- Row-count checkpoint file or log
