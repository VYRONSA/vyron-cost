# VYRON COST Rollback Runbook

## Objective
Revert a production release when customer impact or data risk cannot be safely forward-fixed in time.

## Triggers
- Sustained 5xx failures on critical APIs.
- Authentication regression.
- Cross-tenant exposure risk.
- Data corruption introduced by a release.

## App Rollback
1. Identify last known good deployment.
2. Deploy previous production build.
3. Validate health, auth, and critical workflows.
4. Monitor until error rates stabilize.

## Database Rollback
1. Confirm rollback requires data recovery, not only app redeploy.
2. Freeze writes where possible.
3. Restore to approved backup point.
4. Align app build to restored schema state.
5. Re-run validation gates before reopening traffic.

## Evidence
- Trigger condition
- Approver
- Build before and after
- Backup ID if database rollback executed
- Validation summary
