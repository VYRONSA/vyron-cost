// Test double for @/lib/vyron-workspace-admin-server. The session stands for
// one the real module has already verified against an Active membership.
const state = () => globalThis.__VYRON_DOCUMENT_EMAIL_TEST__ || {};
const unsupported = (name) => async () => {
  throw new Error(`${name} is not available in the document email tests.`);
};

export async function getServerWorkspaceSession() {
  return state().session || null;
}
export const requireAdminSession = unsupported("requireAdminSession");
export const requireAdminWorkspaceId = unsupported("requireAdminWorkspaceId");
export const assertAdminAccess = unsupported("assertAdminAccess");
export const getActiveWorkspaceCompanyProfile = unsupported("getActiveWorkspaceCompanyProfile");
export const getWorkspaceModuleAccess = unsupported("getWorkspaceModuleAccess");
export const getWorkspaceUserLimit = unsupported("getWorkspaceUserLimit");
export const countWorkspaceUsers = unsupported("countWorkspaceUsers");
