// Test double for @/lib/vyron-workspace-login.
//
// Proving a password is Supabase Auth's job and needs the network, so it is
// replaced by a check against synthetic fixtures. Everything this module
// returns has the real shapes, and the membership it picks follows the real
// rule (the member's first Active membership), read from the same in-memory
// database the rest of the test uses.
import { resolveEffectivePermissions } from "@/lib/vyron-workspace-permissions";

const state = () => globalThis.__VYRON_SESSION_TEST__ || {};

function workspaceRecord(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    tradingName: row.company_name,
    packageName: row.package_name || "Professional",
    status: row.status || "Setup",
    userLimit: 10,
    contactEmail: "",
    phone: "",
    ownerUserId: null,
    owner: { firstName: "", surname: "", email: "", loginStatus: "active" },
    activeUsers: 1,
    createdAt: new Date(0).toISOString(),
  };
}

function resolveFor(userId) {
  const { supabase } = state();
  const user = (state().users || []).find((u) => u.id === userId);
  if (!user) throw new Error("No workspace is linked to this login. Contact your VOLORA administrator.");
  const membership = supabase.tables.vyron_workspace_memberships.find((m) => m.user_id === userId && m.status === "Active");
  if (!membership) throw new Error("No workspace is linked to this login. Contact your VOLORA administrator.");
  const ws = supabase.tables.vyron_workspaces.find((w) => w.id === membership.workspace_id);
  return {
    workspace: workspaceRecord(ws),
    member: {
      membershipId: membership.id,
      userId,
      email: user.email,
      firstName: user.firstName || "QA",
      surname: user.surname || "Member",
      mobile: "",
      role: membership.role,
      status: "Active",
      joinedAt: null,
      permissions: membership.permissions || {},
    },
    authUserId: userId,
  };
}

export async function authenticateWorkspaceLogin(email, password) {
  const user = (state().users || []).find((u) => u.email === String(email || "").trim().toLowerCase());
  if (!user || user.password !== password) throw new Error("Invalid email or password.");
  return resolveFor(user.id);
}

export async function resolveWorkspaceSessionForAuthUser(authUserId) {
  return resolveFor(String(authUserId || "").trim());
}

export function workspaceLoginToActiveClient(workspace, member) {
  return {
    id: workspace.id,
    companyId: workspace.companyId,
    companyName: workspace.companyName,
    tradingName: workspace.tradingName,
    packageName: workspace.packageName,
    status: workspace.status === "Live" ? "Active" : workspace.status,
    ownerUserId: member.userId,
    ownerEmail: member.email,
    contactEmail: workspace.contactEmail,
    phone: workspace.phone,
    userLimit: workspace.userLimit,
    demoMode: workspace.status === "Demo",
    impersonating: false,
    loginDisplayStatus: "active_login",
  };
}

export function workspaceLoginToSession(member) {
  return {
    userId: member.userId,
    email: member.email,
    firstName: member.firstName,
    surname: member.surname,
    role: member.role,
    permissions: resolveEffectivePermissions(member.role, member.permissions),
  };
}
