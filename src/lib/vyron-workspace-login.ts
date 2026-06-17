import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getWorkspace, listWorkspaceMembers, type WorkspaceMember, type WorkspaceRecord } from "@/lib/vyron-saas-workspace";
import {
  resolveEffectivePermissions,
  type WorkspaceUserRole,
} from "@/lib/vyron-workspace-permissions";

export type WorkspaceLoginResult = {
  workspace: WorkspaceRecord;
  member: WorkspaceMember;
};

function normalizeSupabaseUrl(url: string | undefined) {
  if (!url) return undefined;
  return url.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
}

export async function authenticateWorkspaceLogin(email: string, password: string): Promise<WorkspaceLoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) {
    throw new Error("Workspace login requires database configuration. Use Developer Centre to enter a client workspace.");
  }

  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Authentication is not configured.");
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (signInError || !signInData.user?.id) {
    throw new Error("Invalid email or password.");
  }

  const authUserId = signInData.user.id;
  const metadata = signInData.user.user_metadata || {};

  const { data: profileByAuthId } = await supabase
    .from("vyron_user_profiles")
    .select("id, email, first_name, surname, mobile, status")
    .eq("id", authUserId)
    .maybeSingle();

  const { data: profileByEmail } = await supabase
    .from("vyron_user_profiles")
    .select("id, email, first_name, surname, mobile, status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileByEmail?.id && String(profileByEmail.id) !== authUserId) {
    await supabase.from("vyron_workspace_memberships").update({ user_id: authUserId }).eq("user_id", profileByEmail.id);
    await supabase.from("vyron_user_profiles").delete().eq("id", profileByEmail.id);
  }

  let profile = profileByAuthId || profileByEmail;
  if (!profile || String(profile.id) !== authUserId) {
    const firstName = String(
      profile?.first_name || metadata.first_name || metadata.firstName || ""
    );
    const surname = String(profile?.surname || metadata.surname || metadata.lastName || "");
    const mobile = String(profile?.mobile || metadata.mobile || "");
    const { error: profileError } = await supabase.from("vyron_user_profiles").upsert(
      {
        id: authUserId,
        email: normalizedEmail,
        first_name: firstName,
        surname: surname,
        mobile: mobile,
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (profileError) {
      throw new Error("Account profile is missing. Ask your administrator to recreate login from Manage Login.");
    }
    const { data: syncedProfile } = await supabase
      .from("vyron_user_profiles")
      .select("id, email, first_name, surname, mobile, status")
      .eq("id", authUserId)
      .single();
    profile = syncedProfile;
  }

  if (!profile?.id) {
    throw new Error("Invalid email or password.");
  }
  if (String(profile.status) === "Disabled") {
    throw new Error("This account is disabled. Contact your workspace administrator.");
  }

  const profileId = authUserId;

  const { data: memberships, error: membershipError } = await supabase
    .from("vyron_workspace_memberships")
    .select("*, vyron_workspaces(*)")
    .eq("user_id", profileId)
    .eq("status", "Active");
  if (membershipError) throw new Error(membershipError.message);

  const activeMemberships = (memberships || []).filter((row) => {
    const ws = row.vyron_workspaces as Record<string, unknown> | null;
    return ws && String(ws.status) !== "Suspended" && String(ws.status) !== "Archived";
  });

  if (!activeMemberships.length) {
    throw new Error("No active workspace found for this account. Contact your administrator.");
  }

  const membership = activeMemberships[0] as Record<string, unknown>;
  const workspaceRow = membership.vyron_workspaces as Record<string, unknown>;
  const workspaceId = String(workspaceRow.id);
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const members = await listWorkspaceMembers(workspaceId);
  const member = members.find((m) => m.userId === profileId);
  if (!member || member.status !== "Active") {
    throw new Error("Workspace membership is not active.");
  }

  return { workspace, member };
}

export function workspaceLoginToActiveClient(
  workspace: WorkspaceRecord,
  member: WorkspaceMember
) {
  return {
    id: workspace.id,
    companyId: workspace.companyId,
    companyName: workspace.companyName,
    tradingName: workspace.tradingName,
    packageName: workspace.packageName,
    status: workspace.status === "Live" ? ("Active" as const) : (workspace.status as "Demo" | "Setup" | "Suspended"),
    ownerUserId: member.userId,
    ownerEmail: member.email,
    contactEmail: workspace.contactEmail,
    phone: workspace.phone,
    userLimit: workspace.userLimit,
    demoMode: workspace.status === "Demo",
    impersonating: false,
    loginDisplayStatus: "active_login" as const,
  };
}

export function workspaceLoginToSession(member: WorkspaceMember) {
  const role = member.role as WorkspaceUserRole;
  return {
    userId: member.userId,
    email: member.email,
    firstName: member.firstName,
    surname: member.surname,
    role,
    permissions: resolveEffectivePermissions(role, member.permissions),
  };
}
