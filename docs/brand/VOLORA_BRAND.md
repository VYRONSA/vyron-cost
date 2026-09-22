# VOLORA — Profitability Intelligence: brand system

The product formerly presented as VYRON COST is presented as **VOLORA —
PROFITABILITY INTELLIGENCE**, a product of Vyronsoft (Pty) Ltd. This is a visual
and brand change only: routes, APIs, data, permissions, tenant isolation,
accounting and the Order Engine are unchanged.

## 1. Tokens (single source)

| Where | What |
|---|---|
| `src/app/globals.css` — `@theme` | Tailwind scales `navy-*`, `gold-*`, `leaf-*`; `blue`/`indigo`/`sky` remapped to navy, `emerald`/`green`/`lime` remapped to VOLORA green; `--font-sans` (Inter), `--font-display` (Montserrat) |
| `src/app/globals.css` — `:root` | `--volora-*` palette and atmospheres (`--volora-night`, `--volora-workspace-wash`), brand hooks (`--vyron-brand*`), semantic success (VOLORA green), focus ring (gold) |
| `src/components/vyron-ui/style-tokens.ts` | `VYRON_MASTER` class bundles (shell, sidebar, buttons, inputs, cards) and `VYRON_MASTER_COLOUR` |
| `src/app/layout.tsx` | next/font loading (self-hosted), metadata, Open Graph, theme colour |

Palette:

| Role | Values |
|---|---|
| Navy foundation | `#061722` `#081C27` `#0B202B` (ramp `navy-50…950`) |
| Gold — action, brand, highlight | `#F7C948` `#F4C44E` `#E8B83F`; gold text on white uses `#8A6510` (AA) |
| Green — positive, healthy, success | `#3E9B52` `#43A95A` `#55B968` |
| Red — error, danger, blocking only | Tailwind `rose`/`red` (unchanged) |
| Amber — warning | Tailwind `amber` (unchanged) |
| Xero | `#13B5EA` (unchanged) |

Buttons: primary = `vyron-grad-surface` (gold, navy ink — forced, because white
on gold fails contrast); secondary = navy outline; success = green; danger = red.

Surfaces: dark navy for the shell, navigation, login and heroes
(`vyron-grad-deep`, `volora-night`, `volora-texture`, `volora-glass-dark`); light
workspace for tables, forms and reports.

Typography: Montserrat (display: headings, KPI figures — `vyron-t-display`,
`vyron-t-title`, `volora-display`) and Inter (everything else). Two families
only; figures use tabular numerals.

Icons: lucide-react throughout (one family).

## 2. Logo

`src/components/vyron-ui/VyronLogo.tsx` — `VoloraWordmark`, `VyronLogoMark`
(app mark), `VyronLogoLockup` (wordmark + tagline), `PoweredByVolora`. The
wordmark is vector strokes, so it needs no font and prints crisply. App icons,
maskable icons, splash screens, favicon and the Open Graph card are generated
by `node scripts/generate-pwa-icons.mjs` from `public/vyron-cost-app-icon.svg`
and `public/vyron-order-app-icon.svg` (historical file names, new artwork).

## 3. What was renamed, and what deliberately was not

User-visible brand text was changed by a classified pass over string literals
and JSX text only (never comments or identifiers) — full list in
`volora-brand-text-changes.tsv`:

| Old | New |
|---|---|
| VYRON COST | VOLORA |
| VYRON ORDER / VYRON Order | VOLORA Order |
| VYRON AI, CORE, FINANCE, INTELLIGENCE, PAY, FARM, MAINT, REACH, SUITE | VOLORA AI, Core, Finance, … |
| bare VYRON (e.g. "Ask VYRON") | VOLORA |

Kept on purpose (each row is in the TSV with its reason):

- **Internal identifiers**: `VYRON_*` exports and env vars, `vyron_*` tables,
  migrations, file and route names (`/vyron-core`, `/vyron-finance`), cookie and
  storage keys, issue codes such as `PRICE_FROM_VYRON`.
- **Stored data values**: approval `requested_by`, notification
  `recipient_name`, tenant document-branding defaults, seeded demo company
  names (e.g. "Vyron Pie Co"), provider identifier.
- **Frozen subsystem**: invoice-extraction AI prompts.
- **Historical technical text**: Food Sock migration plan and reports, developer
  log prefixes, code comments, scripts' headers.
- **Legal entity**: Vyronsoft (Pty) Ltd.
- **Mobile app identifiers**: Expo slug, scheme, bundle id, package, owner and
  EAS project id (display name and colours changed only).

Colour literals were migrated by `volora-colour-codemod.tsv` (brand blue,
indigo and legacy lime hexes and washes → VOLORA navy / green; neutrals, Xero,
red and amber untouched; tenant branding defaults excluded).

## 4. Accessibility rules

- Gold is never used for text on white except `#8A6510` (≥ 4.5:1).
- Primary buttons use navy ink on gold.
- Status is never colour alone: pills carry words, the active sidebar item
  carries a leading edge, alerts carry an icon.
- One visible gold focus ring on every interactive element.
