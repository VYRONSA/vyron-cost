import { useId } from "react";

/**
 * VYRON COST mark — the VyronSoft blade-V, rebuilt as vector.
 *
 * Two faceted blades converge on a single point: the left in chrome, the right in
 * brand blue and pitched higher, with a glowing ring behind them. Each blade is
 * split into a lit face and a shadowed face so the bevel survives at 24px, where a
 * flat silhouette would just read as a grey triangle.
 */

export type VyronLogoVariant = "onDark" | "onLight";

export function VyronLogoMark({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  // useId keeps every gradient/filter id unique — duplicate ids would make each
  // mark on the page inherit whichever one rendered first.
  const uid = useId().replace(/:/g, "");
  const chrome = `chrome-${uid}`;
  const chromeDark = `chrome-dark-${uid}`;
  const blue = `blue-${uid}`;
  const blueDark = `blue-dark-${uid}`;
  const ring = `ring-${uid}`;
  const glow = `glow-${uid}`;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[1.15rem] shadow-[0_6px_20px_rgba(4,18,45,0.38)] ${className}`.trim()}
      style={{
        width: size,
        height: size,
        // Deep blue-black, matching the VyronSoft artwork's ground — the chrome
        // and the blue edge both need darkness to read as metal.
        background: "radial-gradient(circle at 50% 42%, #0d2f66 0%, #061630 58%, #030b1c 100%)",
      }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Vyron Cost" fill="none">
        <defs>
          <linearGradient id={chrome} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#D5DEE9" />
            <stop offset="100%" stopColor="#7E8DA1" />
          </linearGradient>
          <linearGradient id={chromeDark} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#9AA8BA" />
            <stop offset="100%" stopColor="#55637a" />
          </linearGradient>
          <linearGradient id={blue} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#7FD8FF" />
            <stop offset="40%" stopColor="#22A6FF" />
            <stop offset="100%" stopColor="#0B4FD6" />
          </linearGradient>
          <linearGradient id={blueDark} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1668D8" />
            <stop offset="100%" stopColor="#06308F" />
          </linearGradient>
          <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2FA8FF" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#6FD0FF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#2FA8FF" stopOpacity="0.15" />
          </linearGradient>
          <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Halo ring behind the blades */}
        <circle cx="32" cy="31" r="20.5" stroke={`url(#${ring})`} strokeWidth="1.4" filter={`url(#${glow})`} />

        {/* Left blade — chrome. Lit face, then the shadowed inner facet. */}
        <path d="M11 14 L24.5 17.2 L32 53.5 Z" fill={`url(#${chrome})`} />
        <path d="M24.5 17.2 L32 53.5 L27.4 30.5 Z" fill={`url(#${chromeDark})`} opacity="0.9" />

        {/* Right blade — brand blue, pitched higher than the left, as in the original. */}
        <path d="M53 10 L39.5 19 L32 53.5 Z" fill={`url(#${blue})`} />
        <path d="M39.5 19 L32 53.5 L36.4 31 Z" fill={`url(#${blueDark})`} opacity="0.85" />

        {/* Specular highlight down the blue blade's leading edge */}
        <path d="M53 10 L50.4 12.4 L33.4 52 L32 53.5 Z" fill="#CFF0FF" opacity="0.75" filter={`url(#${glow})`} />
      </svg>
    </div>
  );
}

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

  return (
    <span className={`flex items-center gap-3 ${className}`.trim()}>
      <VyronLogoMark size={size} />
      <span className="min-w-0 leading-none">
        {/* Set inline like VYRONSOFT: neutral "VYRON" + accented product word. */}
        <span className="block whitespace-nowrap text-[1.35rem] font-black tracking-[0.16em]">
          <span className={onDark ? "text-white" : "text-[#0F172A]"}>VYRON</span>
          <span className={onDark ? "text-[#7FD8FF]" : "text-[#0B54D6]"}>{suffix}</span>
        </span>
        <span
          className={`mt-1.5 block text-[0.52rem] font-bold uppercase tracking-[0.22em] ${
            onDark ? "text-[#BFDBFE]" : "text-[#64748B]"
          }`}
        >
          Smart Systems. Stronger Business.
        </span>
      </span>
    </span>
  );
}
