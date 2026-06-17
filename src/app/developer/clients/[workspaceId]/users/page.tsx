import DeveloperManageUsersClient from "@/components/vyron-cost/developer/DeveloperManageUsersClient";

export default async function ManageUsersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <DeveloperManageUsersClient workspaceId={workspaceId} workspaceName={workspaceId} />;
}
