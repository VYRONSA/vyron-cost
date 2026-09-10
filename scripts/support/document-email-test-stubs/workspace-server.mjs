// Test double for @/lib/vyron-workspace-server. The company id stands for the
// one the real module derives from the verified membership.
const state = () => globalThis.__VYRON_DOCUMENT_EMAIL_TEST__ || {};

export function parseActiveClient() {
  return null;
}
export async function getServerActiveWorkspace() {
  return state().activeWorkspace || null;
}
export async function shouldUseWorkspaceDemoData() {
  return false;
}
export async function authorisedWorkspaceId() {
  return state().session?.workspaceId || null;
}
export async function getWorkspaceCompanyId() {
  return state().companyId || null;
}
export async function getWorkspaceCompanyResolution() {
  return { companyId: state().companyId || null };
}
export async function getWorkspaceTenantId() {
  return state().companyId || null;
}
export function isWorkspaceUuid(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || ""));
}
export async function requireActiveWorkspaceId() {
  const id = state().session?.workspaceId;
  if (!id) throw new Error("No active workspace.");
  return id;
}
