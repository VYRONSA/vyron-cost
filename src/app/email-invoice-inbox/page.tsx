import EmailInvoiceInboxClient from "@/components/EmailInvoiceInboxClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function EmailInvoiceInboxPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Email Invoice Inbox" subtitle="EMAIL TO VYRON · PDF QUEUE · REVIEW ROUTING">
      <EmailInvoiceInboxClient />
    </VyronCostAiShell>
  );
}
