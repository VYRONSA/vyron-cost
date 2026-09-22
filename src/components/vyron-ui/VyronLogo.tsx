/**
 * VOLORA — PROFITABILITY INTELLIGENCE brand mark.
 *
 * The wordmark is drawn as vector strokes rather than set in a web font, so it
 * renders identically everywhere (sidebar, login, reports, print, PWA) and never
 * waits on a font download. Its signature is the first O — a ring cut by a warm
 * gold arc — and the final A drawn as a gold Λ.
 *
 * Export names (VyronLogoMark / VyronLogoLockup) are internal identifiers and
 * are kept so every existing call site adopts the new brand unchanged.
 */

export type VyronLogoVariant = "onDark" | "onLight";

const GOLD = "#F4C44E";
const GOLD_ON_LIGHT = "#C99A26";

/** The VOLORA wordmark on its own. Height drives the size; width follows. */
export function VoloraWordmark({
  height = 28,
  variant = "onDark",
  className = "",
  title = "VOLORA",
}: {
  height?: number;
  variant?: VyronLogoVariant;
  className?: string;
  title?: string;
}) {
  const ink = variant === "onDark" ? "#FFFFFF" : "#0B202B";
  const gold = variant === "onDark" ? GOLD : GOLD_ON_LIGHT;
  const width = (height * 312) / 60;
  return (
    <svg
      viewBox="0 0 312 60"
      width={width}
      height={height}
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      strokeWidth={4.6}
      strokeLinejoin="miter"
    >
      <title>{title}</title>
      {/* V */}
      <path d="M3 8 L22.5 52 L42 8" stroke={ink} />
      {/* O — ring with the gold arc */}
      <circle cx="78" cy="30" r="21" stroke={ink} />
      <path d="M85.18 10.27 A21 21 0 0 1 97.73 37.18" stroke={gold} strokeWidth={5.6} strokeLinecap="round" />
      {/* L */}
      <path d="M118 8 V51.7 H147" stroke={ink} />
      {/* O */}
      <circle cx="183" cy="30" r="21" stroke={ink} />
      {/* R */}
      <path d="M222 52 V10.3 H240 A11 11 0 0 1 240 32.3 H222 M238.5 32.3 L256 52" stroke={ink} />
      {/* Λ — the gold A */}
      <path d="M268.5 52 L288.5 8 L308.5 52" stroke={gold} />
    </svg>
  );
}

/** Square app mark: navy tile, the gold-arc O ring and a gold Λ. */
export function VyronLogoMark({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] shadow-[0_6px_20px_rgba(6,23,34,0.38)] ${className}`.trim()}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 70% 20%, #163a48 0%, #0b202b 52%, #061722 100%)",
      }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="VOLORA" fill="none">
        <circle cx="32" cy="32" r="19" stroke="#FFFFFF" strokeWidth="3.4" />
        <path d="M38.5 14.15 A19 19 0 0 1 49.85 38.5" stroke={GOLD} strokeWidth="4.4" strokeLinecap="round" />
        <path d="M23.5 41 L32 22.5 L40.5 41" stroke={GOLD} strokeWidth="3.6" strokeLinejoin="miter" />
      </svg>
    </div>
  );
}

/**
 * Lockup: wordmark over the PROFITABILITY INTELLIGENCE tagline. `size` keeps
 * its historical meaning (the old mark's height) so call sites need no change;
 * `suffix` other than "COST" shows a small context label (e.g. DEV).
 */
export function VyronLogoLockup({
  variant = "onLight",
  size = 56,
  suffix = "COST",
  className = "",
}: {
  variant?: VyronLogoVariant;
  size?: number;
  suffix?: string;
  className?: string;
}) {
  const onDark = variant === "onDark";
  const wordHeight = Math.round(size * 0.46);
  const label = suffix && suffix !== "COST" ? suffix : null;

  return (
    <span className={`inline-flex min-w-0 flex-col items-start gap-1.5 ${className}`.trim()}>
      <span className="flex items-center gap-2.5">
        <VoloraWordmark height={wordHeight} variant={variant} />
        {label ? (
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.18em] ${
              onDark ? "border-[#F4C44E]/40 text-[#F4C44E]" : "border-[#0B202B]/25 text-[#0B202B]"
            }`}
          >
            {label}
          </span>
        ) : null}
      </span>
      <span
        className={`block whitespace-nowrap text-[0.54rem] font-semibold uppercase tracking-[0.34em] ${
          onDark ? "text-[#BCCDD5]" : "text-[#475569]"
        }`}
      >
        Profitability Intelligence
      </span>
    </span>
  );
}

/** "Powered by VOLORA" footer credit for customer-facing surfaces. */
export function PoweredByVolora({
  variant = "onLight",
  className = "",
}: {
  variant?: VyronLogoVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] ${
        variant === "onDark" ? "text-[#BCCDD5]" : "text-[#64748B]"
      } ${className}`.trim()}
    >
      Powered by
      <VoloraWordmark height={11} variant={variant} />
    </span>
  );
}
