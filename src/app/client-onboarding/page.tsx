import ClientOnboardingWizardClient from "@/components/ClientOnboardingWizardClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function ClientOnboardingPage() {
  return (
    <VyronCostShell
      title="Client Onboarding"
      subtitle="FIRST CLIENT SETUP · DATA COLLECTION · DEMO CHECKLIST"
    >
      <ClientOnboardingWizardClient />
    </VyronCostShell>
  );
}
