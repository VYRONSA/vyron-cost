type StatusPillProps = {
  status: string;
};

const toneByStatus: Record<string, string> = {
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Sent: "border-blue-200 bg-blue-50 text-blue-700",
  Approved: "border-violet-200 bg-violet-50 text-violet-700",
  Draft: "border-slate-200 bg-slate-50 text-slate-700",
  "In Production": "border-amber-200 bg-amber-50 text-amber-700",
  Cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${toneByStatus[status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
      {status}
    </span>
  );
}
