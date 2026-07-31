import type { StoreOrderWarning } from "@/lib/vyron-store-order-commercial";

export function StoreOrderWarningBadges({ warnings }: { warnings: StoreOrderWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map((warning) => (
        <span
          key={`${warning.code}-${warning.message}`}
          title={warning.message}
          className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-800"
        >
          Warning
        </span>
      ))}
    </div>
  );
}
