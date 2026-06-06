import { getSupabaseAdmin } from "@/lib/supabase-server";

export const ENTERPRISE_ROLES = [
  { key: "owner", name: "Owner" },
  { key: "cfo", name: "CFO" },
  { key: "financial_manager", name: "Financial Manager" },
  { key: "procurement_manager", name: "Procurement Manager" },
  { key: "warehouse_manager", name: "Warehouse Manager" },
  { key: "production_manager", name: "Production Manager" },
  { key: "supervisor", name: "Supervisor" },
  { key: "user", name: "User" },
  { key: "read_only", name: "Read Only" },
  { key: "auditor", name: "Auditor" },
] as const;

export type EnterpriseRoleKey = (typeof ENTERPRISE_ROLES)[number]["key"];

export const ENTERPRISE_MODULES = [
  { key: "procurement", label: "Procurement" },
  { key: "inventory", label: "Inventory" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "suppliers", label: "Suppliers" },
  { key: "documents", label: "Documents / Invoices" },
  { key: "recovery", label: "Recovery" },
  { key: "finance", label: "Finance" },
  { key: "budgets", label: "Budgets" },
  { key: "forecasting", label: "Forecasting" },
  { key: "contracts", label: "Contracts" },
  { key: "compliance", label: "Compliance" },
  { key: "admin", label: "Administration" },
] as const;

export type PermissionAction = "view" | "create" | "edit" | "approve" | "delete" | "export" | "override";

export type ModulePermission = {
  moduleKey: string;
  moduleLabel: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  approve: boolean;
  delete: boolean;
  export: boolean;
  override: boolean;
};

export type RolePermissionMatrix = {
  roleKey: string;
  roleName: string;
  permissions: ModulePermission[];
};

function perm(
  moduleKey: string,
  flags: Partial<Record<PermissionAction, boolean>>
): Omit<ModulePermission, "moduleLabel"> {
  return {
    moduleKey,
    view: flags.view ?? false,
    create: flags.create ?? false,
    edit: flags.edit ?? false,
    approve: flags.approve ?? false,
    delete: flags.delete ?? false,
    export: flags.export ?? false,
    override: flags.override ?? false,
  };
}

const ALL = { view: true, create: true, edit: true, approve: true, delete: true, export: true, override: true };
const RW = { view: true, create: true, edit: true, export: true };
const RO = { view: true, export: true };
const APPROVE = { view: true, edit: true, approve: true, export: true };

/** Default permission matrix when DB not seeded */
export const DEFAULT_PERMISSION_MATRIX: Record<EnterpriseRoleKey, Partial<Record<string, Partial<Record<PermissionAction, boolean>>>>> = {
  owner: Object.fromEntries(ENTERPRISE_MODULES.map((m) => [m.key, ALL])),
  cfo: {
    procurement: RO,
    inventory: RO,
    manufacturing: RO,
    suppliers: RO,
    documents: APPROVE,
    recovery: { ...APPROVE, create: true },
    finance: ALL,
    budgets: ALL,
    forecasting: ALL,
    contracts: RW,
    compliance: RO,
    admin: { view: true, export: true },
  },
  financial_manager: {
    procurement: RO,
    documents: APPROVE,
    recovery: RW,
    finance: ALL,
    budgets: ALL,
    forecasting: RW,
    contracts: RW,
    compliance: RO,
    suppliers: RO,
    inventory: RO,
    manufacturing: RO,
    admin: { view: true },
  },
  procurement_manager: {
    procurement: ALL,
    suppliers: ALL,
    documents: APPROVE,
    inventory: { view: true, create: true, edit: true },
    recovery: RO,
    finance: RO,
    budgets: { view: true },
    forecasting: { view: true },
    contracts: RW,
    compliance: RO,
    manufacturing: { view: true },
    admin: { view: true },
  },
  warehouse_manager: {
    inventory: ALL,
    procurement: { view: true, create: true, edit: true },
    manufacturing: { view: true },
    suppliers: RO,
    documents: RO,
    recovery: RO,
    finance: RO,
    budgets: { view: true },
    forecasting: { view: true },
    contracts: RO,
    compliance: RO,
    admin: { view: true },
  },
  production_manager: {
    manufacturing: ALL,
    inventory: { view: true, edit: true },
    procurement: RO,
    suppliers: RO,
    documents: RO,
    recovery: RO,
    finance: RO,
    budgets: { view: true },
    forecasting: { view: true },
    contracts: RO,
    compliance: RO,
    admin: { view: true },
  },
  supervisor: {
    procurement: APPROVE,
    inventory: APPROVE,
    manufacturing: APPROVE,
    documents: APPROVE,
    recovery: { view: true, approve: true },
    suppliers: RO,
    finance: RO,
    budgets: RO,
    forecasting: RO,
    contracts: RO,
    compliance: RO,
    admin: { view: true },
  },
  user: {
    procurement: { view: true, create: true },
    inventory: { view: true, create: true },
    manufacturing: { view: true, create: true },
    suppliers: RO,
    documents: { view: true, create: true },
    recovery: RO,
    finance: RO,
    budgets: { view: true },
    forecasting: { view: true },
    contracts: RO,
    compliance: RO,
    admin: { view: true },
  },
  read_only: Object.fromEntries(ENTERPRISE_MODULES.map((m) => [m.key, RO])),
  auditor: Object.fromEntries(ENTERPRISE_MODULES.map((m) => [m.key, { view: true, export: true }])),
};

function buildMatrixFromDefaults(): RolePermissionMatrix[] {
  return ENTERPRISE_ROLES.map((role) => ({
    roleKey: role.key,
    roleName: role.name,
    permissions: ENTERPRISE_MODULES.map((mod) => {
      const flags = DEFAULT_PERMISSION_MATRIX[role.key]?.[mod.key] || { view: false };
      return {
        moduleLabel: mod.label,
        ...perm(mod.key, flags),
      };
    }),
  }));
}

export async function getRolePermissionMatrix(): Promise<RolePermissionMatrix[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return buildMatrixFromDefaults();

  const { data: perms } = await supabase.from("vyron_enterprise_role_permissions").select("*");
  if (!perms?.length) return buildMatrixFromDefaults();

  const { data: roles } = await supabase.from("vyron_enterprise_roles").select("role_key, role_name");
  const roleMap = new Map((roles || []).map((r) => [r.role_key, r.role_name]));

  return ENTERPRISE_ROLES.map((role) => {
    const rows = perms.filter((p) => p.role_key === role.key);
    return {
      roleKey: role.key,
      roleName: roleMap.get(role.key) || role.name,
      permissions: ENTERPRISE_MODULES.map((mod) => {
        const row = rows.find((p) => p.module_key === mod.key);
        return {
          moduleLabel: mod.label,
          moduleKey: mod.key,
          view: Boolean(row?.can_view),
          create: Boolean(row?.can_create),
          edit: Boolean(row?.can_edit),
          approve: Boolean(row?.can_approve),
          delete: Boolean(row?.can_delete),
          export: Boolean(row?.can_export),
          override: Boolean(row?.can_override),
        };
      }),
    };
  });
}

export function roleCan(
  matrix: RolePermissionMatrix[],
  roleKey: string,
  moduleKey: string,
  action: PermissionAction
): boolean {
  const role = matrix.find((r) => r.roleKey === roleKey);
  const mod = role?.permissions.find((p) => p.moduleKey === moduleKey);
  if (!mod) return false;
  const map: Record<PermissionAction, boolean> = {
    view: mod.view,
    create: mod.create,
    edit: mod.edit,
    approve: mod.approve,
    delete: mod.delete,
    export: mod.export,
    override: mod.override,
  };
  return map[action];
}
