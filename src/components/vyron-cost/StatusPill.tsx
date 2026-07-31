import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

type StatusPillProps = {
  status: string;
};

const toneByStatus: Record<string, string> = {
  Completed: M.statusBrand,
  Paid: "rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700",
  Posted: "rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700",
  Active: M.statusBrand,
  Live: M.statusBrand,
  Monitoring: M.statusBrand,
  Sent: "rounded-full border border-[#1D6BFF]/25 bg-[#1D6BFF]/8 px-3 py-1 text-xs font-black text-[#1D6BFF]",
  Approved: "rounded-full border border-[#1D6BFF]/25 bg-[#1D6BFF]/8 px-3 py-1 text-xs font-black text-[#1D6BFF]",
  Draft: "rounded-full border border-[#E2E8F0] bg-[#F6F7FB] px-3 py-1 text-xs font-black text-[#64748B]",
  "In Production": "rounded-full border border-[#3B82F6]/25 bg-[#3B82F6]/8 px-3 py-1 text-xs font-black text-[#2563EB]",
  Warning: "rounded-full border border-[#3B82F6]/25 bg-[#3B82F6]/8 px-3 py-1 text-xs font-black text-[#2563EB]",
  Cancelled: "rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-3 py-1 text-xs font-black text-[#2563EB]",
  Connected: M.statusXero,
  Xero: M.statusXero,
};

export default function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${toneByStatus[status] ?? M.statusBrand}`}>
      {status}
    </span>
  );
}
