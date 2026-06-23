import VyronCostAiShell from "@/components/VyronCostAiShell";
import ContactCentreClient from "@/components/vyron-cost/contacts/ContactCentreClient";

export default function Page() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Contact Centre"
      subtitle="Unified contact master across customers and suppliers."
    >
      <ContactCentreClient />
    </VyronCostAiShell>
  );
}
