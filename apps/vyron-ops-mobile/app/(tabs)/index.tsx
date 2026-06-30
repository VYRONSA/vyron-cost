import { VyronLoading } from "@/components/ui";
import { OperatorHomeDashboard } from "@/components/dashboard/OperatorHomeDashboard";
import { SupervisorCommandCentre } from "@/components/supervisor/SupervisorCommandCentre";
import { usePermissions } from "@/hooks/usePermissions";

export default function HomeScreen() {
  const permissions = usePermissions();

  if (permissions.isLoading) return <VyronLoading />;

  if (permissions.data?.canViewSupervisorCommandCentre) {
    return <SupervisorCommandCentre />;
  }

  return <OperatorHomeDashboard />;
}
