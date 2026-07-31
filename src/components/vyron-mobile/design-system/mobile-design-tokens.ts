export const MOBILE_TOKENS = {
  surface: {
    page: "bg-[#F8FAFC]",
    card: "rounded-[1.55rem] border border-white/80 bg-white/92 shadow-[0_18px_38px_rgba(12,23,41,0.08)]",
    cardRaised: "rounded-[1.75rem] border border-white/80 bg-white shadow-[0_24px_52px_rgba(12,23,41,0.13)]",
    cardMuted: "rounded-[1.45rem] border border-slate-100 bg-slate-50/92 shadow-[0_14px_30px_rgba(12,23,41,0.06)]",
    shellBackdrop:
      "bg-[linear-gradient(115deg,transparent_0%,rgba(29,107,255,0.03)_36%,transparent_72%),radial-gradient(circle_at_82%_8%,rgba(59,130,246,0.04),transparent_24%),radial-gradient(circle_at_24%_92%,rgba(29,107,255,0.03),transparent_32%)] opacity-[0.85]",
  },
  spacing: {
    pageX: "px-4 sm:px-5",
    stack: "space-y-4",
    stackLoose: "space-y-6",
  },
  text: {
    title: "text-[2.15rem] font-black tracking-[-0.055em] text-slate-950",
    heading: "text-[1.38rem] font-black tracking-[-0.035em] text-slate-950",
    body: "text-sm font-semibold leading-6 text-slate-600",
    mutedLabel: "text-[10px] font-black uppercase tracking-[0.2em] text-slate-400",
  },
  icon: {
    dark: "flex h-12 w-12 items-center justify-center rounded-2xl vyron-grad-surface text-white shadow-[0_12px_28px_rgba(7,17,31,0.22)]",
    light: "flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.08)]",
  },
  touch: {
    pressable: "transition duration-200 ease-out active:translate-y-[1px] active:scale-[0.985]",
    liftHover: "hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(15,23,42,0.14)]",
  },
} as const;

export const MOBILE_STATUS_TONES = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  pending: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  approved: "border-violet-200 bg-violet-50 text-violet-700",
  completed: "border-violet-200 bg-violet-50 text-violet-700",
  archived: "border-indigo-200 bg-indigo-50 text-indigo-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  received: "border-sky-200 bg-sky-50 text-sky-700",
} as const;

export type MobileStatusTone = keyof typeof MOBILE_STATUS_TONES;

export const MOBILE_TYPOGRAPHY = {
  family:
    "font-[\"SF_Pro_Display\",\"SF_Pro_Text\",\"Avenir_Next\",\"Segoe_UI\",\"Helvetica_Neue\",sans-serif]",
};
