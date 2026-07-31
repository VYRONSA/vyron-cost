# VYRON Enterprise Design Language

**v1.0 — canonical.** The shared presentation layer for every VYRON product.

Implementation: [`src/styles/vyron-enterprise-design-language.css`](../src/styles/vyron-enterprise-design-language.css)
Product overrides: [`src/app/globals.css`](../src/app/globals.css)
Tailwind bundles: [`src/components/vyron-ui/style-tokens.ts`](../src/components/vyron-ui/style-tokens.ts)

---

## Principle

The design language defines **everything except brand hue**. A product supplies its
identity by overriding four gradients and four brand variables; it inherits
atmosphere, typography, spacing, elevation, glass, motion, focus and status.

That split is what lets two VYRON products feel like one company while staying
visually distinct. Shared *quality*, not shared *colour*.

## Adopting it in a new product

```css
@import "tailwindcss";
@import "../styles/vyron-enterprise-design-language.css";

:root {
  --vyron-brand:        #4f46e5;              /* product primary        */
  --vyron-brand-strong: #3d3ab8;              /* pressed / deep         */
  --vyron-brand-wash:   rgba(79,70,229,0.06); /* row hover, soft fills  */
  --vyron-brand-edge:   rgba(79,70,229,0.18); /* branded hairline       */

  --vyron-grad-surface: /* large fills carrying white text  */;
  --vyron-grad-deep:    /* hero + module panels, body copy  */;
  --vyron-grad-accent:  /* decorative only, nothing on top  */;
  --vyron-grad-text:    /* bg-clip-text on light surfaces   */;
}
```

Then add `vyron-interactive-root` to the app shell and public page roots to
activate the shared focus, motion and form patterns.

### Gradient contract

| Fade | Constraint |
|---|---|
| `--vyron-grad-surface` | Every stop must hold **≥4:1 against white** — white text sits on it. |
| `--vyron-grad-deep` | Same, but darker: these panels carry small body copy. |
| `--vyron-grad-accent` | May run to any chroma. **Nothing is ever placed on top of it.** |
| `--vyron-grad-text` | Every stop must hold **≥4.5:1 against the page background**. |

Violating these is how a fade becomes unreadable. A light-yellow accent stop is
fine on a 1px rule and invisible as a heading.

---

## 1. Workspace atmosphere

One continuous ambient field, shared by the shell, the authenticated body and
the public pages so there is no seam between them. Three broad low-amplitude
ellipses over a soft vertical wash, `background-attachment: fixed` so the
atmosphere is identical at every scroll depth.

**Rule:** the background is *felt, not noticed*. No page may render as a flat
white sheet, and no panel may sit on it as a hard-edged slab. Avoid the
white → coloured hero → white banding pattern.

## 2. Typography

Hierarchy is carried by **weight and tracking, not size**, so adopting the scale
never reflows an existing layout.

| Class | Weight | Tracking | Use |
|---|---|---|---|
| `vyron-t-display` | 800 | −0.03em | Page titles, hero headlines |
| `vyron-t-title` | 700 | −0.02em | Panel and card titles |
| `vyron-t-section` | 700 | +0.02em | Section headings |
| `vyron-t-label` | 600 | +0.10em, uppercase | Eyebrows, field labels, table heads |
| `vyron-t-metric` | — | −0.02em, tabular | Metric values |
| `vyron-t-body` | 450 | — | Body copy, 1.6 line height |
| `vyron-t-caption` | 500 | — | Helper and note text |

Metric values and **all table cells** use `font-variant-numeric: tabular-nums`.
Financial columns must align on the digit.

## 3. Spacing

4px base: `--vyron-space-1|2|3|4|5|6|8|10`.
Radius: `--vyron-radius-sm|md|lg|xl` (0.5 / 0.75 / 1 / 1.5rem).

Documented so new products inherit the cadence. Applying it to an existing
product is **opt-in** — never retrofit spacing onto a shipped layout.

## 4. Elevation

Layered and low-alpha. Enterprise depth is many soft shadows; one heavy drop
reads consumer.

| Token | Use |
|---|---|
| `--vyron-elev-1` | Rested chips, quiet controls |
| `--vyron-elev-2` | Cards, panels, page headers |
| `--vyron-elev-3` | Card hover, elevated panels |
| `--vyron-elev-4` | Dialogs, drawers, primary hover |
| `--vyron-elev-brand` | Brand-tinted, for primary actions only |

## 5. Glass surfaces

`--vyron-glass` (72%) and `--vyron-glass-strong` (86%) with
`--vyron-glass-blur: blur(14px) saturate(1.4)`. The saturation lift is what
keeps glass from graying out the atmosphere behind it.

Borders use hairlines — `--vyron-hairline` (7%) and `--vyron-hairline-strong`
(11%). At full slate a border reads as a box; at 7% it reads as an edge.

## 6. Motion

One curve, one duration: `--vyron-ease` `cubic-bezier(0.4,0,0.2,1)`,
`--vyron-dur` 180ms, `--vyron-dur-slow` 260ms.
`prefers-reduced-motion` collapses all of it to 1ms.

## 7. Focus

A single visible ring on every interactive element: `--vyron-focus-ring`,
applied via `:focus-visible` so pointer users never see it.

## 8. Interaction patterns

Scoped by `vyron-interactive-root`:

- Buttons and links transition background, border, shadow, transform and colour.
- Inputs transition border, shadow and background; hover strengthens the hairline.
- `[aria-invalid="true"]` gets the error border plus a soft error ring.
- Table rows hover on `--vyron-brand-wash`; selected rows add an inset 3px brand
  bar so selection is not conveyed by colour alone.

## 9. Semantic status colour

**Reserved.** Four hues placed deliberately outside every product's brand fade,
so "this is state" can never be confused with "this is brand".

| Token | fg | bg | border | solid | on-deep |
|---|---|---|---|---|---|
| success | `#047857` | `#ECFDF5` | `#A7F3D0` | `#059669` | `#6EE7B7` |
| warning | `#B45309` | `#FFFBEB` | `#FDE68A` | `#D97706` | `#FCD34D` |
| error | `#BE123C` | `#FFF1F2` | `#FECDD3` | `#E11D48` | `#FDA4AF` |
| info | `#0E7490` | `#ECFEFF` | `#A5F3FC` | `#0891B2` | `#67E8F9` |
| neutral | `#475569` | 3% slate | 10% slate | — | — |

Info is **cyan, not blue** — it has to stay distinguishable from a blue brand hue.
`-on-deep` variants exist because the light fills vanish against deep panels.

### Permitted uses — the complete list

badges · alerts · validation · workflow status · approval state ·
health indicators · AI recommendations · executive signals

### Prohibited

Semantic colour is **never decorative**. It may not be used for branding,
emphasis, category coding, charts-by-series, or to make a section "pop". If the
colour is not communicating state, it must come from the brand palette.

### Components

```
.vyron-status  +  .vyron-status-{success|warning|error|info|neutral}   badges
.vyron-alert   +  .vyron-alert-{success|warning|error|info}           banners
.vyron-on-deep-{success|warning|error|info}                           on deep panels
.vyron-metric-{success|warning|error|info}                            metric values
.vyron-tone-{success|warning|error}                                   card health edge
```

---

## Component consistency rule

Every shared component reads from these tokens. **No page-specific styling
unless absolutely necessary.** A page that hardcodes its own button fill,
surface colour or status hue is a defect, not a variation — the enterprise pass
found and removed 145 such lines across 72 files.
