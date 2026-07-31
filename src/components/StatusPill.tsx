export default function StatusPill({
  children,
  tone = "lime",
}: {
  children: React.ReactNode;
  tone?: "lime" | "warning" | "red" | "slate" | "brand" | "emerald" | "amber" | "blue";
}) {
  const styles = {
    lime: "border border-[#A855F7]/30 bg-[#A855F7]/12 text-[#7E22CE]",
    emerald: "border border-[#A855F7]/30 bg-[#A855F7]/12 text-[#7E22CE]",
    warning: "border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    amber: "border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    red: "border border-red-400/30 bg-red-500/12 text-red-700",
    slate: "border border-violet-400/25 bg-violet-500/10 text-slate-700",
    brand: "border border-violet-400/30 bg-violet-500/15 text-violet-700",
    blue: "border border-sky-400/35 bg-sky-500/12 text-sky-700",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${styles[tone]}`}>
      {children}
    </span>
  );
}
