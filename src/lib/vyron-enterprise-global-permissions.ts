import { ENTERPRISE_MODULES, type PermissionAction } from "@/lib/vyron-enterprise-permissions";

export const GLOBAL_ENTERPRISE_ROLES = [
  { key: "group_ceo", name: "Group CEO", scope: "group" },
  { key: "group_cfo", name: "Group CFO", scope: "group" },
  { key: "regional_director", name: "Regional Director", scope: "region" },
  { key: "company_director", name: "Company Director", scope: "company" },
  { key: "branch_manager", name: "Branch Manager", scope: "branch" },
  { key: "auditor", name: "Auditor", scope: "group" },
  { key: "read_only", name: "Read Only", scope: "group" },
] as const;

export type GlobalRoleKey = (typeof GLOBAL_ENTERPRISE_ROLES)[number]["key"];

export type GlobalRolePermissionRow = {
  roleKey: string;
  roleName: string;
  scope: string;
  modules: Array<{
    moduleKey: string;
    moduleLabel: string;
    view: boolean;
    create: boolean;
    edit: boolean;
    approve: boolean;
    export: boolean;
  }>;
};

const GROUP_ALL: Partial<Record<PermissionAction, boolean>> = {
  view: true,
  create: true,
  edit: true,
  approve: true,
  export: true,
};

const GROUP_RO: Partial<Record<PermissionAction, boolean>> = { view: true, export: true };

const GLOBAL_MATRIX: Record<GlobalRoleKey, Partial<Record<string, Partial<Record<PermissionAction, boolean>>>>> = {
  group_ceo: Object.fromEntries(ENTERPRISE_MODULES.map((m) => [m.key, GROUP_ALL])),
  group_cfo: {
    finance: GROUP_ALL,
    recovery: GROUP_ALL,
    budgets: GROUP_ALL,
    forecasting: GROUP_ALL,
    procurement: GROUP_RO,
    inventory: GROUP_RO,
    manufacturing: GROUP_RO,
    suppliers: GROUP_RO,
    documents: GROUP_RO,
    compliance: GROUP_RO,
    contracts: GROUP_RO,
    admin: GROUP_RO,
  },
  regional_director: {
    procurement: GROUP_ALL,
    inventory: GROUP_ALL,
    manufacturing: GROUP_ALL,
    suppliers: GROUP_ALL,
    recovery: GROUP_RO,
    finance: GROUP_RO,
    budgets: { view: true },
    forecasting: { view: true },
    documents: { view: true, approve: true },
    compliance: GROUP_RO,
    contracts: GROUP_RO,
    admin: GROUP_RO,
  },
  company_director: {
    procurement: GROUP_ALL,
    inventory: GROUP_ALL,
    manufacturing: GROUP_ALL,
    suppliers: GROUP_ALL,
    recovery: GROUP_ALL,
    finance: GROUP_RO,
    budgets: GROUP_ALL,
    forecasting: GROUP_RO,
    documents: GROUP_ALL,
    compliance: GROUP_RO,
    contracts: GROUP_RO,
    admin: GROUP_RO,
  },
  branch_manager: {
    procurement: { view: true, create: true, edit: true, approve: true },
    inventory: { view: true, create: true, edit: true, approve: true },
    manufacturing: { view: true, create: true, edit: true },
    suppliers: GROUP_RO,
    recovery: GROUP_RO,
    finance: GROUP_RO,
    budgets: { view: true },
    forecasting: { view: true },
    documents: { view: true, create: true },
    compliance: GROUP_RO,
    contracts: GROUP_RO,
    admin: GROUP_RO,
  },
  auditor: Object.fromEntries(ENTERPRISE_MODULES.map((m) => [m.key, GROUP_RO])),
  read_only: Object.fromEntries(ENTERPRISE_MODULES.map((m) => [m.key, GROUP_RO])),
};

export function getGlobalPermissionMatrix(): GlobalRolePermissionRow[] {
  return GLOBAL_ENTERPRISE_ROLES.map((role) => ({
    roleKey: role.key,
    roleName: role.name,
    scope: role.scope,
    modules: ENTERPRISE_MODULES.map((m) => {
      const flags = GLOBAL_MATRIX[role.key][m.key] || {};
      return {
        moduleKey: m.key,
        moduleLabel: m.label,
        view: flags.view ?? false,
        create: flags.create ?? false,
        edit: flags.edit ?? false,
        approve: flags.approve ?? false,
        export: flags.export ?? false,
      };
    }),
  }));
}
