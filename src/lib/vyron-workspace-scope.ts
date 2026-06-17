/** Client-safe dynamic loader for workspace server helpers. */
export async function workspaceScope() {
  const mod = await import("@/lib/vyron-workspace-server");
  return {
    useDemo: await mod.shouldUseWorkspaceDemoData(),
    companyId: await mod.getWorkspaceCompanyId(),
    tenantId: await mod.getWorkspaceTenantId(),
    client: await mod.getServerActiveWorkspace(),
  };
}
