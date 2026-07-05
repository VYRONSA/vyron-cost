import Link from "next/link";
import type { ReactNode } from "react";
import { MOBILE_TYPOGRAPHY } from "@/components/vyron-mobile/design-system/mobile-design-tokens";

type PremiumMobileButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";
type PremiumMobileButtonSize = "default" | "compact" | "icon";

const VARIANT_CLASS: Record<PremiumMobileButtonVariant, string> = {
  primary:
    "border border-[#D8B24A]/70 bg-gradient-to-b from-[#D7AE49] to-[#BE8C21] text-white shadow-[0_16px_36px_rgba(190,140,33,0.34)]",
  secondary: "border border-slate-200 bg-white text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.07)]",
  danger: "border border-rose-200 bg-rose-50 text-rose-700 shadow-[0_10px_24px_rgba(244,63,94,0.14)]",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_10px_24px_rgba(16,185,129,0.14)]",
  ghost: "border border-transparent bg-slate-100/60 text-slate-700 hover:bg-slate-100",
};

const SIZE_CLASS: Record<PremiumMobileButtonSize, string> = {
  default: "min-h-14 rounded-[1.05rem] px-5 py-3.5 text-[0.95rem]",
  compact: "min-h-11 rounded-[0.95rem] px-4 py-2.5 text-xs",
  icon: "h-12 w-12 rounded-2xl p-0",
};

export default function PremiumMobileButton({
  children,
  variant = "primary",
  size = "default",
  href,
  disabled = false,
  loading = false,
  fullWidth = false,
  className = "",
  onClick,
  type = "button",
}: {
  children: ReactNode;
  variant?: PremiumMobileButtonVariant;
  size?: PremiumMobileButtonSize;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  const buttonClassName = [
    MOBILE_TYPOGRAPHY.family,
    "inline-flex items-center justify-center gap-2 font-black tracking-[0.01em] transition duration-200 ease-out active:translate-y-[1px] active:scale-[0.985]",
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    fullWidth ? "w-full" : "",
    disabled || loading ? "cursor-not-allowed opacity-55" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : null}
      <span>{children}</span>
    </>
  );

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={buttonClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onClick}
      className={buttonClassName}
    >
      {content}
    </button>
  );
}
