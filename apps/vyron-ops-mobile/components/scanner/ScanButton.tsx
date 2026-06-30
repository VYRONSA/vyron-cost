import { VyronButton } from "@/components/ui";
import { useScanner } from "@/hooks/useScanner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/providers";
import type { ScanContext, ScanValidationResult, ScanWorkflow } from "@/types/scanner";

type ScanButtonProps = {
  label?: string;
  workflow: ScanWorkflow;
  context?: ScanContext;
  variant?: "primary" | "secondary" | "ghost";
  onValidated?: (result: ScanValidationResult) => void;
};

export function ScanButton({
  label = "Scan barcode",
  workflow,
  context,
  variant = "secondary",
  onValidated,
}: ScanButtonProps) {
  const { launchScan } = useScanner();
  const permissions = usePermissions();
  const { session } = useAuth();
  const actorEmail = session?.email || permissions.data?.email || "vyron-ops-mobile";

  return (
    <VyronButton
      label={label}
      variant={variant}
      className="min-h-[48px]"
      onPress={async () => {
        const result = await launchScan({ workflow, context, actorEmail, title: label });
        onValidated?.(result);
      }}
    />
  );
}
