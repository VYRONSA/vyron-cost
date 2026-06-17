import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

type StatusPillProps = {
  status: string;
};

const toneByStatus: Record<string, string> = {
  Completed: M.statusBrand,
  Paid: "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700",
  Posted: "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700",
  Active: M.statusBrand,
  Live: M.statusBrand,
  Monitoring: M.statusBrand,
  Sent: "rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/8 px-3 py-1 text-xs font-black text-[#7C3AED]",
  Approved: "rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/8 px-3 py-1 text-xs font-black text-[#7C3AED]",
  Draft: "rounded-full border border-[#E2E8F0] bg-[#F6F7FB] px-3 py-1 text-xs font-black text-[#64748B]",
  "In Production": "rounded-full border border-[#F43F5E]/25 bg-[#F43F5E]/8 px-3 py-1 text-xs font-black text-[#E11D48]",
  Warning: "rounded-full border border-[#F43F5E]/25 bg-[#F43F5E]/8 px-3 py-1 text-xs font-black text-[#E11D48]",
  Cancelled: "rounded-full border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-3 py-1 text-xs font-black text-[#E11D48]",
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
