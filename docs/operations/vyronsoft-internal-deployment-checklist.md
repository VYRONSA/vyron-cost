# VYRONSOFT Internal Deployment Checklist

## Release Control
1. Confirm target commit and production build hash.
2. Confirm schema validation passes.
3. Confirm rollback owner and incident commander.

## Security and Data
1. Confirm RLS audit status for production-sensitive tables.
2. Confirm backup ID recorded.
3. Confirm no unreviewed emergency SQL will be applied manually.

## Validation
1. Run `npm run validate:schema`.
2. Run `npm run build`.
3. Run production smoke workflow against deployed production runtime.
4. Confirm PDF and email stages succeed.

## Handover
1. Record deployment start and end times.
2. Record operator, approver, and evidence links.
3. Record any follow-up operational actions that do not block release.
