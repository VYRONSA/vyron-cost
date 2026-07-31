import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

type StatusPillProps = {
  status: string;
};

// Workflow and approval state — the canonical use of semantic colour.
const toneByStatus: Record<string, string> = {
  Completed: M.statusSuccess,
  Paid: M.statusSuccess,
  Posted: M.statusSuccess,
  Approved: M.statusSuccess,
  Delivered: M.statusSuccess,
  Connected: M.statusSuccess,

  Active: M.statusInfo,
  Live: M.statusInfo,
  Monitoring: M.statusInfo,
  Sent: M.statusInfo,
  "In Production": M.statusInfo,

  Warning: M.statusWarning,
  Pending: M.statusWarning,
  "Awaiting Approval": M.statusWarning,
  Overdue: M.statusWarning,

  Cancelled: M.statusError,
  Rejected: M.statusError,
  Failed: M.statusError,

  Draft: M.statusNeutral,
  Xero: M.statusXero,
};

export default function StatusPill({ status }: StatusPillProps) {
  return <span className={toneByStatus[status] ?? M.statusNeutral}>{status}</span>;
}
