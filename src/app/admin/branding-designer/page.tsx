import VyronCostAiShell from "@/components/VyronCostAiShell";
import BrandingDesignerClient from "@/components/admin/BrandingDesignerClient";

export default function BrandingDesignerPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Branding Designer"
      subtitle="Configure the branding every VYRON document and report inherits — logo, colours, and document text."
    >
      <BrandingDesignerClient />
    </VyronCostAiShell>
  );
}
