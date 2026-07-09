# VYRON COST Restore Runbook

## Objective
Restore production data to an approved recovery point with validation before customer traffic resumes.

## Preconditions
- Incident declared and recovery point approved.
- Stakeholders notified.
- Write activity frozen where possible.

## Staging Rehearsal
1. Restore the selected backup into a staging or isolated recovery target.
2. Validate critical row counts.
3. Validate key referential links:
   - Sales order to lines
   - Purchase order to lines
   - Goods receipt to lines
   - Production run to lines
4. Run smoke checks on auth and critical APIs.

## Production Restore
1. Select approved backup ID and timestamp.
2. Restore via Supabase recovery workflow.
3. Reconcile schema only if the restored point predates required migrations.
4. Run post-restore checks:
   - `npm run validate:schema`
   - Production workflow smoke script(s)
   - Critical API health endpoints
5. Re-enable traffic after validation passes.

## Evidence
- Recovery point selected
- Restore start and end times
- Validation outputs
- Approval to reopen traffic
