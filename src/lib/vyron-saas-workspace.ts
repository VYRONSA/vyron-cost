import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { normalizePermissionMap } from "@/lib/vyron-workspace-permissions";

export type WorkspaceRole =
  | "OWNER"
  | "ADMIN"
  | "SUPERVISOR"
  | "MANAGER"
  | "PROCUREMENT"
  | "PRODUCTION"
  | "INVENTORY"
  | "SALES"
  | "VIEW_ONLY"
  | "USER";
export type MemberStatus = "Active" | "Disabled" | "Invited";
export type WorkspaceStatus = "Live" | "Demo" | "Setup" | "Suspended" | "Archived";
export type LoginSetupMethod = "invite" | "password";
export type OwnerLoginStatus = "active" | "invited" | "pending_activation" | "disabled";

export type WorkspaceOwnerDetails = {
  firstName: string;
  surname: string;
  email: string;
  mobile: string;
  loginMethod: LoginSetupMethod;
  loginStatus: OwnerLoginStatus;
};

export type WorkspaceRecord = {
  id: string;
  companyId: string;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: WorkspaceStatus;
  userLimit: number;
  contactEmail: string;
  phone: string;
  ownerUserId: string | null;
  owner: WorkspaceOwnerDetails;
  activeUsers: number;
  createdAt: string;
};

export type WorkspaceMember = {
  membershipId: string;
  userId: string;
  email: string;
  firstName: string;
  surname: string;
  mobile: string;
  role: WorkspaceRole;
  status: MemberStatus;
  joinedAt: string | null;
  permissions: Record<string, boolean>;
};

export type WorkspaceCompanyProfile = {
  workspaceId: string;
  companyName: string;
  tradingName: string;
  vatNumber: string;
  registrationNumber: string;
  contactEmail: string;
  phone: string;
  physicalAddress: string;
  postalAddress: string;
  defaultVatRate: number;
  xeroStatus: string;
  packageName: string;
  userLimit: number;
  activeModules: string[];
  status: WorkspaceStatus;
};

export type CreateClientInput = {
  companyName: string;
  tradingName: string;
  packageName: string;
  userLimit: number;
  contactEmail: string;
  phone: string;
  admin: {
    firstName: string;
    surname: string;
    email: string;
    mobile: string;
  };
  loginSetup: {
    method: LoginSetupMethod;
    password?: string;
  };
};

export type InviteUserInput = {
  firstName: string;
  surname: string;
  email: string;
  mobile?: string;
  role: WorkspaceRole;
  method: LoginSetupMethod;
  password?: string;
  permissions?: Record<string, boolean>;
};

export type UpdateCompanyProfileInput = {
  companyName: string;
  tradingName: string;
  vatNumber?: string;
  registrationNumber?: string;
  contactEmail?: string;
  phone?: string;
  physicalAddress?: string;
  postalAddress?: string;
  defaultVatRate?: number;
};

type MemoryUser = {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  mobile: string;
  status: MemberStatus;
  password?: string;
};

type MemoryMembership = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: MemberStatus;
  joinedAt: string | null;
};

const memoryWorkspaces = new Map<string, WorkspaceRecord>();
const memoryUsers = new Map<string, MemoryUser>();
const memoryMemberships = new Map<string, MemoryMembership>();
const memoryCompanyProfiles = new Map<string, WorkspaceCompanyProfile>();

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";
}

function mapOwnerFromRow(row: Record<string, unknown>): WorkspaceOwnerDetails {
  const contactEmail = String(row.contact_email || "").trim().toLowerCase();
  return {
    firstName: String(row.owner_first_name || ""),
    surname: String(row.owner_surname || ""),
    email: String(row.owner_email || contactEmail || ""),
    mobile: String(row.owner_mobile || ""),
    loginMethod: (row.owner_login_method as LoginSetupMethod) || "password",
    loginStatus: (row.owner_login_status as OwnerLoginStatus) || "pending_activation",
  };
}

function mapWorkspace(row: Record<string, unknown>, activeUsers = 0): WorkspaceRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    companyName: String(row.company_name),
    tradingName: String(row.trading_name),
    packageName: String(row.package_name),
    status: String(row.status) as WorkspaceStatus,
    userLimit: Number(row.user_limit || 5),
    contactEmail: String(row.contact_email || ""),
    phone: String(row.phone || ""),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    owner: mapOwnerFromRow(row),
    activeUsers,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function buildOwnerDetails(input: CreateClientInput, loginStatus: OwnerLoginStatus): WorkspaceOwnerDetails {
  return {
    firstName: input.admin.firstName.trim(),
    surname: input.admin.surname.trim(),
    email: input.admin.email.trim().toLowerCase(),
    mobile: input.admin.mobile.trim(),
    loginMethod: input.loginSetup.method,
    loginStatus,
  };
}

function mapMember(profile: Record<string, unknown>, membership: Record<string, unknown>): WorkspaceMember {
  const permissions =
    membership.permissions && typeof membership.permissions === "object"
      ? (membership.permissions as Record<string, boolean>)
      : {};
  return {
    membershipId: String(membership.id),
    userId: String(profile.id),
    email: String(profile.email),
    firstName: String(profile.first_name),
    surname: String(profile.surname),
    mobile: String(profile.mobile || ""),
    role: String(membership.role) as WorkspaceRole,
    status: String(membership.status) as MemberStatus,
    joinedAt: membership.joined_at ? String(membership.joined_at) : null,
    permissions,
  };
}

function packageModulesLabel(packageName: string) {
  const pkg = packageName.toLowerCase();
  if (pkg.includes("enterprise")) return ["All modules", "Advanced intelligence", "Multi-company", "API/integrations"];
  if (pkg.includes("professional") || pkg.includes("demo")) {
    return ["Dashboard", "Suppliers", "Costing", "Procurement", "Inventory", "Manufacturing", "Customers", "Xero"];
  }
  return ["Dashboard", "Suppliers", "Ingredients", "Products", "Recipes", "Basic reports"];
}

function profileFromWorkspace(workspace: WorkspaceRecord, row?: Record<string, unknown>): WorkspaceCompanyProfile {
  return {
    workspaceId: workspace.id,
    companyName: workspace.companyName,
    tradingName: workspace.tradingName,
    vatNumber: String(row?.vat_number || ""),
    registrationNumber: String(row?.registration_number || ""),
    contactEmail: workspace.contactEmail,
    phone: workspace.phone,
    physicalAddress: String(row?.physical_address || ""),
    postalAddress: String(row?.postal_address || ""),
    defaultVatRate: Number(row?.default_vat_rate ?? 15),
    xeroStatus: String(row?.xero_status || "Not Connected"),
    packageName: workspace.packageName,
    userLimit: workspace.userLimit,
    activeModules: packageModulesLabel(workspace.packageName),
    status: workspace.status,
  };
}

function profileFromActiveClient(client: {
  id: string;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: string;
  contactEmail?: string;
  phone?: string;
  userLimit?: number;
  vatNumber?: string;
  registrationNumber?: string;
  physicalAddress?: string;
  postalAddress?: string;
  defaultVatRate?: number;
  xeroStatus?: string;
}): WorkspaceCompanyProfile {
  return {
    workspaceId: client.id,
    companyName: client.companyName,
    tradingName: client.tradingName,
    vatNumber: client.vatNumber || "",
    registrationNumber: client.registrationNumber || "",
    contactEmail: client.contactEmail || "",
    phone: client.phone || "",
    physicalAddress: client.physicalAddress || "",
    postalAddress: client.postalAddress || "",
    defaultVatRate: client.defaultVatRate ?? 15,
    xeroStatus: client.xeroStatus || "Not Connected",
    packageName: client.packageName,
    userLimit: client.userLimit ?? 5,
    activeModules: packageModulesLabel(client.packageName),
    status: (client.status === "Active" ? "Live" : client.status) as WorkspaceStatus,
  };
}

async function countActiveMembers(supabase: SupabaseClient, workspaceId: string) {
  const { count } = await supabase
    .from("vyron_workspace_memberships")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "Disabled");
  return count || 0;
}

async function findAuthUserIdByEmail(supabase: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match?.id) return match.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function createAuthUser(
  supabase: SupabaseClient,
  input: { email: string; firstName: string; surname: string; mobile: string; method: LoginSetupMethod; password?: string }
) {
  const email = input.email.trim().toLowerCase();
  if (input.method === "invite") {
    console.log("Creating auth user...");
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl()}/login`,
      data: {
        first_name: input.firstName,
        surname: input.surname,
        mobile: input.mobile,
      },
    });
    if (error) {
      throw error;
    }
    if (!data.user?.id) {
      throw new Error("Invite failed — no user returned.");
    }
    return { userId: data.user.id, status: "Invited" as MemberStatus };
  }

  if (!input.password || input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  console.log("Creating auth user...");
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName,
      surname: input.surname,
      mobile: input.mobile,
    },
  });
  if (!error && data.user?.id) {
    return { userId: data.user.id, status: "Active" as MemberStatus };
  }

  const message = error?.message || "User creation failed.";
  if (message.toLowerCase().includes("already") || message.toLowerCase().includes("registered")) {
    const existingId = await findAuthUserIdByEmail(supabase, email);
    if (!existingId) throw error ?? new Error(message);

    const updated = await supabase.auth.admin.updateUserById(existingId, {
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: input.firstName,
        surname: input.surname,
        mobile: input.mobile,
      },
    });

    if (updated.error) {
      throw updated.error;
    }
    return { userId: existingId, status: "Active" as MemberStatus };
  }

  throw error ?? new Error(message);
}

async function upsertOwnerProfile(
  supabase: SupabaseClient,
  input: {
    userId: string;
    email: string;
    firstName: string;
    surname: string;
    mobile: string;
    status: MemberStatus;
  }
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const { data: existingByEmail } = await supabase
    .from("vyron_user_profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingByEmail?.id && String(existingByEmail.id) !== input.userId) {
    await supabase.from("vyron_workspace_memberships").update({ user_id: input.userId }).eq("user_id", existingByEmail.id);
    await supabase.from("vyron_user_profiles").delete().eq("id", existingByEmail.id);
  }

  const { error } = await supabase.from("vyron_user_profiles").upsert(
    {
      id: input.userId,
      email: normalizedEmail,
      first_name: input.firstName.trim(),
      surname: input.surname.trim(),
      mobile: input.mobile.trim(),
      status: input.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Profile save failed: ${error.message}`);
}

async function resolveWorkspaceOwnerAuthUserId(
  supabase: SupabaseClient,
  workspace: WorkspaceRecord,
  email: string
) {
  if (workspace.ownerUserId) {
    const { data: linked } = await supabase.auth.admin.getUserById(workspace.ownerUserId);
    if (linked.user?.id) return workspace.ownerUserId;
  }
  const existingId = await findAuthUserIdByEmail(supabase, email);
  if (existingId) return existingId;
  return null;
}

async function persistWorkspaceOwnerAuthState(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    companyId: string;
    ownerUserId: string;
    ownerDetails: WorkspaceOwnerDetails;
    memberStatus: MemberStatus;
    ownerLoginStatus: OwnerLoginStatus;
  }
) {
  await upsertOwnerProfile(supabase, {
    userId: input.ownerUserId,
    email: input.ownerDetails.email,
    firstName: input.ownerDetails.firstName,
    surname: input.ownerDetails.surname,
    mobile: input.ownerDetails.mobile,
    status: input.memberStatus,
  });

  await upsertOwnerMembership(supabase, {
    workspaceId: input.workspaceId,
    userId: input.ownerUserId,
    status: input.memberStatus,
  });

  const updatePayload: Record<string, unknown> = {
    owner_user_id: input.ownerUserId,
    owner_first_name: input.ownerDetails.firstName,
    owner_surname: input.ownerDetails.surname,
    owner_email: input.ownerDetails.email,
    owner_mobile: input.ownerDetails.mobile,
    owner_login_method: input.ownerDetails.loginMethod,
    owner_login_status: input.ownerLoginStatus,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("vyron_workspaces").update(updatePayload).eq("id", input.workspaceId);
  if (error?.message?.includes("owner_")) {
    const { error: minimalError } = await supabase
      .from("vyron_workspaces")
      .update({ owner_user_id: input.ownerUserId, updated_at: new Date().toISOString() })
      .eq("id", input.workspaceId);
    if (minimalError) throw new Error(minimalError.message);
  } else if (error) {
    throw new Error(error.message);
  }

  try {
    await supabase.from("vyron_cost_users").upsert(
      {
        company_id: input.companyId,
        full_name: `${input.ownerDetails.firstName} ${input.ownerDetails.surname}`.trim(),
        email: input.ownerDetails.email,
        role: "OWNER",
        status: input.memberStatus === "Disabled" ? "Inactive" : "Active",
      },
      { onConflict: "email" }
    );
  } catch {
    // Optional legacy table.
  }
}

async function upsertOwnerMembership(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    userId: string;
    status: MemberStatus;
  }
): Promise<WorkspaceMember | null> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("vyron_workspace_memberships")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("vyron_workspace_memberships")
      .update({
        role: "OWNER",
        status: input.status,
        joined_at: input.status === "Active" ? existing.joined_at || now : existing.joined_at,
        invited_at: input.status === "Invited" ? existing.invited_at || now : existing.invited_at,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`Membership update failed: ${error.message}`);
    const { data: profile } = await supabase.from("vyron_user_profiles").select("*").eq("id", input.userId).single();
    if (!profile) return null;
    return mapMember(profile as Record<string, unknown>, updated as Record<string, unknown>);
  }

  const { data: membership, error } = await supabase
    .from("vyron_workspace_memberships")
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      role: "OWNER",
      status: input.status,
      invited_at: input.status === "Invited" ? now : null,
      joined_at: input.status === "Active" ? now : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Membership create failed: ${error.message}`);

  const { data: profile } = await supabase.from("vyron_user_profiles").select("*").eq("id", input.userId).single();
  if (!profile) return null;
  return mapMember(profile as Record<string, unknown>, membership as Record<string, unknown>);
}

async function provisionWorkspaceOwner(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    companyId: string;
    admin: CreateClientInput["admin"];
    loginSetup: CreateClientInput["loginSetup"];
  }
): Promise<{
  authUserId: string;
  authStatus: MemberStatus;
  ownerLoginStatus: OwnerLoginStatus;
  ownerMember: WorkspaceMember | null;
}> {
  const adminEmail = input.admin.email.trim().toLowerCase();
  console.log("Creating auth user...");
  const auth = await createAuthUser(supabase, {
    email: adminEmail,
    firstName: input.admin.firstName.trim(),
    surname: input.admin.surname.trim(),
    mobile: input.admin.mobile.trim(),
    method: input.loginSetup.method,
    password: input.loginSetup.password,
  });

  await upsertOwnerProfile(supabase, {
    userId: auth.userId,
    email: adminEmail,
    firstName: input.admin.firstName,
    surname: input.admin.surname,
    mobile: input.admin.mobile,
    status: auth.status,
  });

  console.log("Creating workspace membership...");
  const ownerMember = await upsertOwnerMembership(supabase, {
    workspaceId: input.workspaceId,
    userId: auth.userId,
    status: auth.status,
  });

  try {
    await supabase.from("vyron_cost_users").upsert(
      {
        company_id: input.companyId,
        full_name: `${input.admin.firstName.trim()} ${input.admin.surname.trim()}`,
        email: adminEmail,
        role: "OWNER",
        status: auth.status === "Disabled" ? "Inactive" : "Active",
      },
      { onConflict: "email" }
    );
  } catch {
    // Optional legacy table — do not block owner provisioning.
  }

  return {
    authUserId: auth.userId,
    authStatus: auth.status,
    ownerLoginStatus: auth.status === "Invited" ? "invited" : "active",
    ownerMember,
  };
}

function createMemoryAuthUser(input: {
  email: string;
  firstName: string;
  surname: string;
  mobile: string;
  method: LoginSetupMethod;
  password?: string;
}) {
  const userId = randomUUID();
  const status: MemberStatus = input.method === "invite" ? "Invited" : "Active";
  memoryUsers.set(userId, {
    id: userId,
    email: input.email.trim().toLowerCase(),
    firstName: input.firstName,
    surname: input.surname,
    mobile: input.mobile,
    status,
    password: input.method === "password" ? input.password : undefined,
  });
  return { userId, status };
}

export async function createClientWorkspace(input: CreateClientInput): Promise<{
  workspace: WorkspaceRecord;
  owner: WorkspaceMember | null;
  ownerDetails: WorkspaceOwnerDetails;
  authProvisioned: boolean;
}> {
  const companyName = input.companyName.trim();
  const tradingName = input.tradingName.trim() || companyName;
  const adminEmail = input.admin.email.trim().toLowerCase();

  if (!companyName) throw new Error("Company name is required.");
  if (!input.admin.firstName.trim() || !input.admin.surname.trim()) {
    throw new Error("Primary administrator first name and surname are required.");
  }
  if (!adminEmail) throw new Error("Primary administrator email is required.");
  if (input.loginSetup.method === "password") {
    if (!input.loginSetup.password || input.loginSetup.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
  }

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const ownerBase = buildOwnerDetails(input, "pending_activation");

  if (supabase) {
    console.log("Creating company...");
    const { data: company, error: companyError } = await supabase
      .from("vyron_cost_companies")
      .insert({
        name: companyName,
        trading_name: tradingName,
        contact_email: input.contactEmail.trim() || adminEmail,
        phone: input.phone.trim(),
        subscription_plan: input.packageName,
        subscription_status: "Setup",
      })
      .select("*")
      .single();
    if (companyError) throw new Error(companyError.message);

    const ownerDetailsPending = { ...ownerBase, loginStatus: "pending_activation" as OwnerLoginStatus };
    const workspacePayload: Record<string, unknown> = {
      company_id: company.id,
      company_name: companyName,
      trading_name: tradingName,
      package_name: input.packageName,
      status: "Setup",
      user_limit: Number(input.userLimit || 5),
      contact_email: input.contactEmail.trim() || adminEmail,
      phone: input.phone.trim(),
      owner_user_id: null,
      owner_first_name: ownerDetailsPending.firstName,
      owner_surname: ownerDetailsPending.surname,
      owner_email: ownerDetailsPending.email,
      owner_mobile: ownerDetailsPending.mobile,
      owner_login_method: ownerDetailsPending.loginMethod,
      owner_login_status: ownerDetailsPending.loginStatus,
    };

    console.log("Creating workspace...");
    let workspaceResult = await supabase.from("vyron_workspaces").insert(workspacePayload).select("*").single();
    if (workspaceResult.error?.message?.includes("owner_")) {
      const { owner_first_name, owner_surname, owner_email, owner_mobile, owner_login_method, owner_login_status, ...minimal } =
        workspacePayload;
      void owner_first_name;
      void owner_surname;
      void owner_email;
      void owner_mobile;
      void owner_login_method;
      void owner_login_status;
      workspaceResult = await supabase.from("vyron_workspaces").insert(minimal).select("*").single();
    }
    if (workspaceResult.error) throw new Error(workspaceResult.error.message);
    const workspace = workspaceResult.data;

    let authUserId: string | null = null;
    let ownerLoginStatus: OwnerLoginStatus = "pending_activation";
    let authProvisioned = false;
    let ownerMember: WorkspaceMember | null = null;

    try {
      const provisioned = await provisionWorkspaceOwner(supabase, {
        workspaceId: String(workspace.id),
        companyId: String(company.id),
        admin: input.admin,
        loginSetup: input.loginSetup,
      });
      authUserId = provisioned.authUserId;
      ownerLoginStatus = provisioned.ownerLoginStatus;
      authProvisioned = true;
      ownerMember = provisioned.ownerMember;

      const ownerDetails = { ...ownerBase, loginStatus: ownerLoginStatus };
      const updatePayload: Record<string, unknown> = {
        owner_user_id: authUserId,
        owner_first_name: ownerDetails.firstName,
        owner_surname: ownerDetails.surname,
        owner_email: ownerDetails.email,
        owner_mobile: ownerDetails.mobile,
        owner_login_method: ownerDetails.loginMethod,
        owner_login_status: ownerDetails.loginStatus,
        updated_at: new Date().toISOString(),
      };
      const { data: updatedWorkspace, error: updateError } = await supabase
        .from("vyron_workspaces")
        .update(updatePayload)
        .eq("id", workspace.id)
        .select("*")
        .single();
      if (updateError?.message?.includes("owner_")) {
        await supabase.from("vyron_workspaces").update({ owner_user_id: authUserId }).eq("id", workspace.id);
      } else if (updateError) {
        throw new Error(updateError.message);
      }

      const workspaceRecord = mapWorkspace(
        (updatedWorkspace || workspace) as Record<string, unknown>,
        authProvisioned ? 1 : 0
      );
      workspaceRecord.owner = ownerDetails;
      workspaceRecord.ownerUserId = authUserId;
      return {
        workspace: workspaceRecord,
        owner: ownerMember,
        ownerDetails,
        authProvisioned,
      };
    } catch (error) {
      await supabase.from("vyron_workspaces").delete().eq("id", workspace.id);
      await supabase.from("vyron_cost_companies").delete().eq("id", company.id);
      throw error;
    }
  }

  const companyId = randomUUID();
  const workspaceId = randomUUID();
  const now = new Date().toISOString();
  const ownerDetails = buildOwnerDetails(input, "pending_activation");
  const workspace: WorkspaceRecord = {
    id: workspaceId,
    companyId,
    companyName,
    tradingName,
    packageName: input.packageName,
    status: "Setup",
    userLimit: Number(input.userLimit || 5),
    contactEmail: input.contactEmail.trim() || adminEmail,
    phone: input.phone.trim(),
    ownerUserId: null,
    owner: ownerDetails,
    activeUsers: 0,
    createdAt: now,
  };
  memoryWorkspaces.set(workspaceId, workspace);

  return {
    workspace,
    owner: null,
    ownerDetails,
    authProvisioned: false,
  };
}

export type UpdateOwnerLoginInput = {
  action: "save" | "invite" | "password" | "disable" | "enable";
  admin: {
    firstName: string;
    surname: string;
    email: string;
    mobile: string;
  };
  loginSetup?: {
    method: LoginSetupMethod;
    password?: string;
  };
};

export async function updateWorkspaceOwnerLogin(
  workspaceId: string,
  input: UpdateOwnerLoginInput
): Promise<{
  ownerDetails: WorkspaceOwnerDetails;
  authProvisioned: boolean;
  message: string;
  ownerUserId: string | null;
}> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  let ownerUserId = workspace.ownerUserId;
  const ownerDetails: WorkspaceOwnerDetails = {
    firstName: input.admin.firstName.trim(),
    surname: input.admin.surname.trim(),
    email: input.admin.email.trim().toLowerCase(),
    mobile: input.admin.mobile.trim(),
    loginMethod: input.loginSetup?.method || workspace.owner.loginMethod,
    loginStatus: workspace.owner.loginStatus,
  };

  let authProvisioned = false;
  let message = "Owner details saved. Owner login pending activation.";

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) {
    throw new Error("Supabase service role is required to manage owner login.");
  }

  if (input.action === "invite") {
    ownerDetails.loginMethod = "invite";
    const existingAuthUserId = await resolveWorkspaceOwnerAuthUserId(supabase, workspace, ownerDetails.email);
    if (existingAuthUserId) {
      const { error } = await supabase.auth.admin.inviteUserByEmail(ownerDetails.email, {
        redirectTo: `${appUrl()}/login`,
        data: {
          first_name: ownerDetails.firstName,
          surname: ownerDetails.surname,
          mobile: ownerDetails.mobile,
        },
      });
      if (error) throw new Error(error.message);
      ownerUserId = existingAuthUserId;
    } else {
      const provisioned = await provisionWorkspaceOwner(supabase, {
        workspaceId,
        companyId: workspace.companyId,
        admin: input.admin,
        loginSetup: { method: "invite" },
      });
      ownerUserId = provisioned.authUserId;
    }
    ownerDetails.loginStatus = "invited";
    authProvisioned = true;
    message = `Invitation sent to ${ownerDetails.email}.`;
    await persistWorkspaceOwnerAuthState(supabase, {
      workspaceId,
      companyId: workspace.companyId,
      ownerUserId: ownerUserId as string,
      ownerDetails,
      memberStatus: "Invited",
      ownerLoginStatus: "invited",
    });
  } else if (input.action === "password") {
    ownerDetails.loginMethod = "password";
    const password = input.loginSetup?.password;
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const existingAuthUserId = await resolveWorkspaceOwnerAuthUserId(supabase, workspace, ownerDetails.email);
    if (existingAuthUserId) {
      const { error } = await supabase.auth.admin.updateUserById(existingAuthUserId, {
        password,
        email: ownerDetails.email,
        email_confirm: true,
        user_metadata: {
          first_name: ownerDetails.firstName,
          surname: ownerDetails.surname,
          mobile: ownerDetails.mobile,
        },
      });
      if (error) throw new Error(error.message);
      ownerUserId = existingAuthUserId;
    } else {
      const provisioned = await provisionWorkspaceOwner(supabase, {
        workspaceId,
        companyId: workspace.companyId,
        admin: input.admin,
        loginSetup: { method: "password", password },
      });
      ownerUserId = provisioned.authUserId;
    }

    ownerDetails.loginStatus = "active";
    authProvisioned = true;
    message = `LOGIN ACTIVE — ${ownerDetails.email} can sign in at /login.`;
    await persistWorkspaceOwnerAuthState(supabase, {
      workspaceId,
      companyId: workspace.companyId,
      ownerUserId: ownerUserId as string,
      ownerDetails,
      memberStatus: "Active",
      ownerLoginStatus: "active",
    });
  } else if (input.action === "disable") {
    const authUserId = await resolveWorkspaceOwnerAuthUserId(supabase, workspace, ownerDetails.email);
    if (!authUserId) throw new Error("No auth user exists for this workspace owner.");
    await supabase.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" });
    ownerUserId = authUserId;
    ownerDetails.loginStatus = "disabled";
    authProvisioned = true;
    message = "Owner login disabled.";
    await persistWorkspaceOwnerAuthState(supabase, {
      workspaceId,
      companyId: workspace.companyId,
      ownerUserId: authUserId,
      ownerDetails,
      memberStatus: "Disabled",
      ownerLoginStatus: "disabled",
    });
  } else if (input.action === "enable") {
    const authUserId = await resolveWorkspaceOwnerAuthUserId(supabase, workspace, ownerDetails.email);
    if (!authUserId) {
      throw new Error("No auth user exists. Set a temporary password first.");
    }
    await supabase.auth.admin.updateUserById(authUserId, { ban_duration: "none", email_confirm: true });
    ownerUserId = authUserId;
    ownerDetails.loginStatus = "active";
    authProvisioned = true;
    message = "LOGIN ACTIVE — owner can sign in at /login.";
    await persistWorkspaceOwnerAuthState(supabase, {
      workspaceId,
      companyId: workspace.companyId,
      ownerUserId: authUserId,
      ownerDetails,
      memberStatus: "Active",
      ownerLoginStatus: "active",
    });
  } else {
    ownerDetails.loginStatus =
      workspace.owner.loginStatus === "active" || workspace.owner.loginStatus === "invited"
        ? workspace.owner.loginStatus
        : "pending_activation";
    message =
      ownerDetails.loginStatus === "pending_activation"
        ? "Owner details saved. Owner login pending activation."
        : "Owner details saved.";
  }

  if (input.action === "save") {
    const updatePayload: Record<string, unknown> = {
      owner_first_name: ownerDetails.firstName,
      owner_surname: ownerDetails.surname,
      owner_email: ownerDetails.email,
      owner_mobile: ownerDetails.mobile,
      owner_login_method: ownerDetails.loginMethod,
      owner_login_status: ownerDetails.loginStatus,
      updated_at: new Date().toISOString(),
    };
    if (ownerUserId) updatePayload.owner_user_id = ownerUserId;
    const { error } = await supabase.from("vyron_workspaces").update(updatePayload).eq("id", workspaceId);
    if (error?.message?.includes("owner_")) {
      if (ownerUserId) {
        await supabase.from("vyron_workspaces").update({ owner_user_id: ownerUserId }).eq("id", workspaceId);
      }
    } else if (error) {
      throw new Error(error.message);
    }
  }

  const memoryWorkspace = memoryWorkspaces.get(workspaceId);
  if (memoryWorkspace) {
    memoryWorkspaces.set(workspaceId, {
      ...memoryWorkspace,
      ownerUserId,
      owner: ownerDetails,
    });
  }

  return { ownerDetails, authProvisioned, message, ownerUserId };
}

export async function startClientImpersonation(workspaceId: string): Promise<{
  workspace: WorkspaceRecord;
  ownerUserId: string;
  ownerEmail: string;
  loginStatus: OwnerLoginStatus;
  message: string;
}> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  if (workspace.owner.loginStatus === "disabled") {
    throw new Error("Owner login is disabled. Enable login before entering this workspace.");
  }

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) {
    if (!workspace.owner.email) throw new Error("Owner email is required for impersonation.");
    return {
      workspace,
      ownerUserId: workspace.ownerUserId || workspaceId,
      ownerEmail: workspace.owner.email,
      loginStatus: workspace.ownerUserId ? "active" : "pending_activation",
      message: workspace.ownerUserId
        ? "Entered client workspace (local impersonation mode)."
        : "Entered client workspace without auth user (demo mode).",
    };
  }

  let ownerUserId = workspace.ownerUserId;
  if (!ownerUserId) {
    throw new Error("No Supabase auth user linked to this workspace. Use Manage Login to create credentials first.");
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(ownerUserId);
  if (authError || !authUser.user) {
    throw new Error("Owner auth user not found in Supabase. Recreate login credentials from Manage Login.");
  }
  if (authUser.user.banned_until) {
    throw new Error("Owner login is disabled in Supabase Auth.");
  }

  const members = await listWorkspaceMembers(workspaceId);
  const ownerMember = members.find((member) => member.role === "OWNER");
  if (ownerMember?.status === "Disabled") {
    throw new Error("Owner membership is disabled.");
  }

  const ownerDetails = { ...workspace.owner, loginStatus: "active" as OwnerLoginStatus };
  await supabase
    .from("vyron_workspaces")
    .update({
      owner_login_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  workspace.owner = ownerDetails;

  return {
    workspace,
    ownerUserId,
    ownerEmail: workspace.owner.email,
    loginStatus: "active",
    message: "ACTIVE LOGIN — entered client workspace via secure impersonation.",
  };
}

export function ensureMemoryWorkspace(input: {
  id: string;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: WorkspaceStatus;
  userLimit: number;
  contactEmail?: string;
  phone?: string;
  ownerUserId?: string | null;
  owner?: WorkspaceOwnerDetails;
}) {
  if (memoryWorkspaces.has(input.id)) return memoryWorkspaces.get(input.id)!;
  const record: WorkspaceRecord = {
    id: input.id,
    companyId: input.id,
    companyName: input.companyName,
    tradingName: input.tradingName,
    packageName: input.packageName,
    status: input.status,
    userLimit: input.userLimit,
    contactEmail: input.contactEmail || "",
    phone: input.phone || "",
    ownerUserId: input.ownerUserId || null,
    owner:
      input.owner ||
      ({
        firstName: "",
        surname: "",
        email: "",
        mobile: "",
        loginMethod: "password",
        loginStatus: "pending_activation",
      } as WorkspaceOwnerDetails),
    activeUsers: 1,
    createdAt: new Date().toISOString(),
  };
  memoryWorkspaces.set(input.id, record);
  memoryCompanyProfiles.set(input.id, profileFromWorkspace(record));
  return record;
}

export async function listClientWorkspaces(): Promise<WorkspaceRecord[]> {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return Array.from(memoryWorkspaces.values());

  const { data, error } = await supabase
    .from("vyron_workspaces")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data || [];
  const workspaces: WorkspaceRecord[] = [];
  for (const row of rows) {
    const activeUsers = await countActiveMembers(supabase, String(row.id));
    workspaces.push(mapWorkspace(row as Record<string, unknown>, activeUsers));
  }
  return workspaces;
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (supabase) {
    const { data } = await supabase.from("vyron_workspaces").select("*").eq("id", workspaceId).maybeSingle();
    if (!data) return memoryWorkspaces.get(workspaceId) || null;
    const activeUsers = await countActiveMembers(supabase, workspaceId);
    return mapWorkspace(data as Record<string, unknown>, activeUsers);
  }
  return memoryWorkspaces.get(workspaceId) || null;
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;

  if (supabase) {
    const { data, error } = await supabase
      .from("vyron_workspace_memberships")
      .select("*, vyron_user_profiles(*)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => {
      const profile = (row.vyron_user_profiles || {}) as Record<string, unknown>;
      return mapMember(profile, row as Record<string, unknown>);
    });
  }

  return Array.from(memoryMemberships.values())
    .filter((m) => m.workspaceId === workspaceId)
    .map((m) => {
      const user = memoryUsers.get(m.userId);
      if (!user) throw new Error("User not found.");
      return {
        membershipId: m.id,
        userId: m.userId,
        email: user.email,
        firstName: user.firstName,
        surname: user.surname,
        mobile: user.mobile,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        permissions: {},
      };
    });
}

export async function getWorkspaceCompanyProfile(
  workspaceId: string,
  fallbackClient?: {
    id: string;
    companyName: string;
    tradingName: string;
    packageName: string;
    status: string;
    contactEmail?: string;
    phone?: string;
    userLimit?: number;
    vatNumber?: string;
    registrationNumber?: string;
    physicalAddress?: string;
    postalAddress?: string;
    defaultVatRate?: number;
    xeroStatus?: string;
  } | null
): Promise<WorkspaceCompanyProfile> {
  const cached = memoryCompanyProfiles.get(workspaceId);
  if (cached) return cached;

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (supabase) {
    const { data } = await supabase.from("vyron_workspaces").select("*").eq("id", workspaceId).maybeSingle();
    if (data) {
      const workspace = await getWorkspace(workspaceId);
      if (workspace) {
        const profile = profileFromWorkspace(workspace, data as Record<string, unknown>);
        memoryCompanyProfiles.set(workspaceId, profile);
        return profile;
      }
    }
  }

  const workspace = memoryWorkspaces.get(workspaceId);
  if (workspace) {
    const profile = profileFromWorkspace(workspace);
    memoryCompanyProfiles.set(workspaceId, profile);
    return profile;
  }

  if (fallbackClient) {
    const profile = profileFromActiveClient(fallbackClient);
    memoryCompanyProfiles.set(workspaceId, profile);
    return profile;
  }

  throw new Error("Workspace not found.");
}

export async function updateWorkspaceCompanyProfile(
  workspaceId: string,
  input: UpdateCompanyProfileInput
): Promise<WorkspaceCompanyProfile> {
  const existing = await getWorkspaceCompanyProfile(workspaceId).catch(() => null);
  if (!existing) throw new Error("Workspace not found.");

  const next: WorkspaceCompanyProfile = {
    ...existing,
    companyName: input.companyName.trim(),
    tradingName: input.tradingName.trim(),
    vatNumber: input.vatNumber?.trim() || "",
    registrationNumber: input.registrationNumber?.trim() || "",
    contactEmail: input.contactEmail?.trim() || existing.contactEmail,
    phone: input.phone?.trim() || existing.phone,
    physicalAddress: input.physicalAddress?.trim() || "",
    postalAddress: input.postalAddress?.trim() || "",
    defaultVatRate: Number(input.defaultVatRate ?? existing.defaultVatRate),
  };

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const now = new Date().toISOString();

  if (supabase) {
    const { data: row } = await supabase.from("vyron_workspaces").select("id").eq("id", workspaceId).maybeSingle();
    if (row) {
      const { error } = await supabase
        .from("vyron_workspaces")
        .update({
          company_name: next.companyName,
          trading_name: next.tradingName,
          vat_number: next.vatNumber,
          registration_number: next.registrationNumber,
          contact_email: next.contactEmail,
          phone: next.phone,
          physical_address: next.physicalAddress,
          postal_address: next.postalAddress,
          default_vat_rate: next.defaultVatRate,
          updated_at: now,
        })
        .eq("id", workspaceId);
      if (error) throw new Error(error.message);

      await supabase
        .from("vyron_cost_companies")
        .update({
          name: next.companyName,
          trading_name: next.tradingName,
          contact_email: next.contactEmail,
          phone: next.phone,
          updated_at: now,
        })
        .eq("id", (await getWorkspace(workspaceId))?.companyId || "");
    }
  }

  const memoryWorkspace = memoryWorkspaces.get(workspaceId);
  if (memoryWorkspace) {
    memoryWorkspaces.set(workspaceId, {
      ...memoryWorkspace,
      companyName: next.companyName,
      tradingName: next.tradingName,
      contactEmail: next.contactEmail,
      phone: next.phone,
    });
  }

  memoryCompanyProfiles.set(workspaceId, next);
  return next;
}

export async function inviteWorkspaceUser(workspaceId: string, input: InviteUserInput): Promise<WorkspaceMember> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const members = await listWorkspaceMembers(workspaceId);
  if (members.length >= workspace.userLimit) {
    throw new Error("User limit reached for this package. Upgrade package to add more users.");
  }
  if (members.some((m) => m.email.toLowerCase() === input.email.trim().toLowerCase())) {
    throw new Error("A user with this email already exists in the workspace.");
  }
  if (input.role === "OWNER") {
    throw new Error("Use transfer ownership to assign OWNER role.");
  }

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const now = new Date().toISOString();

  if (supabase) {
    const auth = await createAuthUser(supabase, {
      email: input.email,
      firstName: input.firstName,
      surname: input.surname,
      mobile: input.mobile || "",
      method: input.method,
      password: input.password,
    });

    await supabase.from("vyron_user_profiles").upsert({
      id: auth.userId,
      email: input.email.trim().toLowerCase(),
      first_name: input.firstName.trim(),
      surname: input.surname.trim(),
      mobile: input.mobile?.trim() || "",
      status: auth.status,
      updated_at: now,
    });

    const { data: membership, error } = await supabase
      .from("vyron_workspace_memberships")
      .insert({
        workspace_id: workspaceId,
        user_id: auth.userId,
        role: input.role,
        status: auth.status,
        permissions: input.permissions || {},
        invited_at: auth.status === "Invited" ? now : null,
        joined_at: auth.status === "Active" ? now : null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return mapMember(
      {
        id: auth.userId,
        email: input.email.trim().toLowerCase(),
        first_name: input.firstName.trim(),
        surname: input.surname.trim(),
        mobile: input.mobile?.trim() || "",
      },
      membership as Record<string, unknown>
    );
  }

  const auth = createMemoryAuthUser({
    email: input.email,
    firstName: input.firstName,
    surname: input.surname,
    mobile: input.mobile || "",
    method: input.method,
    password: input.password,
  });
  const membershipId = randomUUID();
  memoryMemberships.set(membershipId, {
    id: membershipId,
    workspaceId,
    userId: auth.userId,
    role: input.role,
    status: auth.status,
    joinedAt: auth.status === "Active" ? now : null,
  });

  const user = memoryUsers.get(auth.userId)!;
  return {
    membershipId,
    userId: auth.userId,
    email: user.email,
    firstName: user.firstName,
    surname: user.surname,
    mobile: user.mobile,
    role: input.role,
    status: auth.status,
    joinedAt: auth.status === "Active" ? now : null,
    permissions: input.permissions || {},
  };
}

export async function updateWorkspaceMember(
  workspaceId: string,
  userId: string,
  input: { role?: WorkspaceRole; status?: MemberStatus; permissions?: Record<string, boolean> }
): Promise<WorkspaceMember> {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const now = new Date().toISOString();

  if (input.role === "OWNER") {
    throw new Error("Cannot promote to OWNER via this action.");
  }

  if (supabase) {
    const { data: existing } = await supabase
      .from("vyron_workspace_memberships")
      .select("*, vyron_user_profiles(*)")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!existing) throw new Error("Membership not found.");
    if (String(existing.role) === "OWNER" && input.status === "Disabled") {
      throw new Error("Cannot disable the workspace owner.");
    }

    const membershipPatch: Record<string, unknown> = {};
    if (input.role) membershipPatch.role = input.role;
    if (input.status) membershipPatch.status = input.status;
    if (input.permissions) membershipPatch.permissions = normalizePermissionMap(input.permissions);

    const { data: membership, error } = await supabase
      .from("vyron_workspace_memberships")
      .update(membershipPatch)
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .select("*, vyron_user_profiles(*)")
      .single();
    if (error) throw new Error(error.message);

    if (input.status) {
      await supabase.from("vyron_user_profiles").update({ status: input.status, updated_at: now }).eq("id", userId);
    }

    const profile = (membership.vyron_user_profiles || {}) as Record<string, unknown>;
    return mapMember(profile, membership as Record<string, unknown>);
  }

  const membership = Array.from(memoryMemberships.values()).find(
    (m) => m.workspaceId === workspaceId && m.userId === userId
  );
  if (!membership) throw new Error("Membership not found.");
  if (membership.role === "OWNER" && input.status === "Disabled") {
    throw new Error("Cannot disable the workspace owner.");
  }
  if (input.role) membership.role = input.role;
  if (input.status) {
    membership.status = input.status;
    const user = memoryUsers.get(userId);
    if (user) user.status = input.status;
  }
  const user = memoryUsers.get(userId)!;
  return {
    membershipId: membership.id,
    userId,
    email: user.email,
    firstName: user.firstName,
    surname: user.surname,
    mobile: user.mobile,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt,
    permissions: input.permissions || {},
  };
}

export async function resetWorkspaceUserPassword(workspaceId: string, userId: string, password: string) {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (supabase) {
    const { data: membership } = await supabase
      .from("vyron_workspace_memberships")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new Error("Membership not found.");

    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(error.message);
    await supabase.from("vyron_user_profiles").update({ status: "Active", updated_at: new Date().toISOString() }).eq("id", userId);
    return { ok: true };
  }

  const user = memoryUsers.get(userId);
  if (!user) throw new Error("User not found.");
  user.password = password;
  user.status = "Active";
  return { ok: true };
}

export async function archiveClientWorkspace(workspaceId: string, archivedBy = "developer") {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) throw new Error("Supabase service role is required to archive workspaces.");

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const now = new Date().toISOString();

  await supabase
    .from("vyron_workspace_memberships")
    .update({ status: "Disabled" })
    .eq("workspace_id", workspaceId);

  const updatePayload: Record<string, unknown> = {
    status: "Archived",
    archived_at: now,
    archived_by: archivedBy,
    owner_login_status: "disabled",
    updated_at: now,
  };

  let { error } = await supabase.from("vyron_workspaces").update(updatePayload).eq("id", workspaceId);
  if (error?.message?.includes("archived_") || error?.message?.includes("owner_login_status")) {
    ({ error } = await supabase
      .from("vyron_workspaces")
      .update({ status: "Archived", updated_at: now })
      .eq("id", workspaceId));
  }
  if (error?.message?.includes("vyron_workspaces_status_check")) {
    throw new Error(
      "Archived status is not enabled in the database. Apply migration 20260616_workspace_archive.sql in Supabase."
    );
  }
  if (error) throw new Error(error.message);

  const memoryWorkspace = memoryWorkspaces.get(workspaceId);
  if (memoryWorkspace) {
    memoryWorkspaces.set(workspaceId, {
      ...memoryWorkspace,
      status: "Archived",
      owner: { ...memoryWorkspace.owner, loginStatus: "disabled" },
      activeUsers: 0,
    });
  }

  return getWorkspace(workspaceId);
}

function isForeignKeyViolation(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("foreign key") || lower.includes("violates") || lower.includes("23503");
}

export async function countWorkspaceOperationalData(companyId: string): Promise<number> {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase || !companyId) return 0;

  const probes = await Promise.all([
    supabase.from("vyron_cost_suppliers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_ingredients").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_purchase_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_documents").select("id", { count: "exact", head: true }).eq("tenant_id", companyId),
    supabase.from("execution_actions").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);

  return probes.reduce((total, probe) => total + (probe.count || 0), 0);
}

export async function deleteClientWorkspace(workspaceId: string) {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) throw new Error("Supabase service role is required to delete workspaces.");

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const companyId = workspace.companyId;
  const operationalRows = await countWorkspaceOperationalData(companyId);
  if (operationalRows > 0) {
    throw new Error(
      `WORKSPACE_HAS_DATA:${operationalRows} operational record(s) are linked to this client. Archive instead of delete.`
    );
  }

  await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId);

  const { error } = await supabase.from("vyron_workspaces").delete().eq("id", workspaceId);
  if (error) {
    if (isForeignKeyViolation(error.message)) {
      throw new Error(`WORKSPACE_HAS_DATA:${error.message}`);
    }
    throw new Error(error.message);
  }

  const { count } = await supabase
    .from("vyron_workspaces")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (!count) {
    await supabase.from("vyron_cost_companies").delete().eq("id", companyId);
  }

  memoryWorkspaces.delete(workspaceId);
  memoryCompanyProfiles.delete(workspaceId);

  return { ok: true as const, workspaceId, companyId };
}

export async function deleteWorkspaceMember(workspaceId: string, userId: string) {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;

  if (supabase) {
    const { data: membership } = await supabase
      .from("vyron_workspace_memberships")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new Error("Membership not found.");
    if (String(membership.role) === "OWNER") throw new Error("Cannot delete the workspace owner.");

    await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
    const { count } = await supabase
      .from("vyron_workspace_memberships")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (!count) {
      await supabase.from("vyron_user_profiles").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
    }
    return { ok: true };
  }

  const membership = Array.from(memoryMemberships.values()).find(
    (m) => m.workspaceId === workspaceId && m.userId === userId
  );
  if (!membership) throw new Error("Membership not found.");
  if (membership.role === "OWNER") throw new Error("Cannot delete the workspace owner.");
  memoryMemberships.delete(membership.id);
  const stillMember = Array.from(memoryMemberships.values()).some((m) => m.userId === userId);
  if (!stillMember) memoryUsers.delete(userId);
  return { ok: true };
}
