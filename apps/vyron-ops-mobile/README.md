# VYRON OPS Mobile

Operational workforce application for the VYRON Platform.

## Sprint 1 scope

Foundation only — navigation, theme, providers, platform service placeholders, and placeholder screens.

## Commands

```bash
npm run start
npm run typecheck
npm run lint
```

## Development Builds

This app is configured for Expo Development Builds, not Expo Go.

```bash
cd apps/vyron-ops-mobile
npm install
eas build --platform android --profile development
adb install -r <path-to-downloaded-apk>
adb reverse tcp:8081 tcp:8081
npm run start
```

`npm run start` now launches the Metro server for a dev client. On the device, open the installed VYRON OPS development build instead of Expo Go.

## Platform integration

Mobile app consumes VYRON Platform services via `platform/` and `services/api/client.ts`. Business logic remains in the web platform APIs — not duplicated from VYRON COST.
