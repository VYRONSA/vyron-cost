/** Client-safe dynamic loader for workspace server helpers. */
export async function workspaceScope() {
  const mod = await import("@/lib/vyron-workspace-server");
  const apiWorkspace = await import("@/lib/vyron-api-workspace");
  const companyId = await apiWorkspace.resolveAndAlignApiCompanyId();
  return {
    useDemo: await mod.shouldUseWorkspaceDemoData(),
    companyId,
    tenantId: await mod.getWorkspaceTenantId(),
    client: await mod.getServerActiveWorkspace(),
  };
}
