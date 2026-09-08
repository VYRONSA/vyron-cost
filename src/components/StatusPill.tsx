export default function StatusPill({
  children,
  tone = "lime",
}: {
  children: React.ReactNode;
  tone?: "lime" | "warning" | "red" | "slate" | "brand" | "emerald" | "amber" | "blue";
}) {
  const styles = {
    lime: "border border-[#3B82F6]/30 bg-[#3B82F6]/12 text-[#1D4ED8]",
    emerald: "border border-[#3B82F6]/30 bg-[#3B82F6]/12 text-[#1D4ED8]",
    warning: "border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    amber: "border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]",
    red: "border border-red-400/30 bg-red-500/12 text-red-700",
    slate: "border border-blue-400/25 bg-blue-500/10 text-slate-700",
    brand: "border border-blue-400/30 bg-blue-500/15 text-blue-700",
    blue: "border border-sky-400/35 bg-sky-500/12 text-sky-700",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${styles[tone]}`}>
      {children}
    </span>
  );
}
