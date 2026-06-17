export default function StatusPill({
  children,
  tone = "lime",
}: {
  children: React.ReactNode;
  tone?: "lime" | "warning" | "red" | "slate" | "brand" | "emerald" | "amber";
}) {
  const styles = {
    lime: "border border-[#A3E635]/30 bg-[#A3E635]/12 text-[#65A30D]",
    emerald: "border border-[#A3E635]/30 bg-[#A3E635]/12 text-[#65A30D]",
    warning: "border border-orange-400/35 bg-orange-500/15 text-orange-700",
    amber: "border border-orange-400/35 bg-orange-500/15 text-orange-700",
    red: "border border-red-400/30 bg-red-500/12 text-red-700",
    slate: "border border-violet-400/25 bg-violet-500/10 text-slate-700",
    brand: "border border-violet-400/30 bg-violet-500/15 text-violet-700",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${styles[tone]}`}>
      {children}
    </span>
  );
}
