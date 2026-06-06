import AuditLogsClient from "@/components/AuditLogsClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function AuditLogsPage() {
  return (
    <VyronCostShell
      title="Audit Logs"
      subtitle="BOM CHANGES · PRODUCT CHANGES · SUPPLIER FLAGS · INVOICE PROCESSING"
    >
      <AuditLogsClient />
    </VyronCostShell>
  );
}
