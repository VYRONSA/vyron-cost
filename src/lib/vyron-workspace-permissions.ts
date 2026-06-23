export type WorkspaceUserRole =
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

export type PermissionKey = string;

export type PermissionGroup = {
  label: string;
  permissions: { key: PermissionKey; label: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View dashboard" }],
  },
  {
    label: "Suppliers",
    permissions: [
      { key: "suppliers.view", label: "View suppliers" },
      { key: "suppliers.create", label: "Create suppliers" },
      { key: "suppliers.edit", label: "Edit suppliers" },
      { key: "suppliers.delete", label: "Delete suppliers" },
    ],
  },
  {
    label: "Ingredients",
    permissions: [
      { key: "ingredients.view", label: "View ingredients" },
      { key: "ingredients.create", label: "Create ingredients" },
      { key: "ingredients.edit", label: "Edit ingredients" },
      { key: "ingredients.delete", label: "Delete ingredients" },
    ],
  },
  {
    label: "Products",
    permissions: [
      { key: "products.view", label: "View products" },
      { key: "products.create", label: "Create products" },
      { key: "products.edit", label: "Edit products" },
      { key: "products.delete", label: "Delete products" },
    ],
  },
  {
    label: "Recipes & BOM",
    permissions: [
      { key: "boms.view", label: "View BOMs" },
      { key: "boms.create", label: "Create BOMs" },
      { key: "boms.edit", label: "Edit BOMs" },
      { key: "boms.delete", label: "Delete BOMs" },
    ],
  },
  {
    label: "Purchase Orders",
    permissions: [
      { key: "purchase_orders.view", label: "View POs" },
      { key: "purchase_orders.create", label: "Create POs" },
      { key: "purchase_orders.approve", label: "Approve POs" },
      { key: "purchase_orders.edit", label: "Edit POs" },
      { key: "purchase_orders.delete", label: "Delete POs" },
    ],
  },
  {
    label: "Goods Receipts",
    permissions: [
      { key: "goods_receipts.view", label: "View GRNs" },
      { key: "goods_receipts.create", label: "Create GRNs" },
      { key: "goods_receipts.approve", label: "Approve GRNs" },
    ],
  },
  {
    label: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View inventory" },
      { key: "inventory.counts.create", label: "Create stock counts" },
      { key: "inventory.counts.approve", label: "Approve stock counts" },
      { key: "inventory.adjustments.post", label: "Post stock adjustments" },
    ],
  },
  {
    label: "Manufacturing",
    permissions: [
      { key: "manufacturing.view", label: "View production" },
      { key: "manufacturing.runs.create", label: "Create production runs" },
      { key: "manufacturing.runs.start", label: "Start production runs" },
      { key: "manufacturing.runs.complete", label: "Complete production runs" },
      { key: "manufacturing.runs.reverse", label: "Reverse production runs" },
    ],
  },
  {
    label: "Customers",
    permissions: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.create", label: "Create customers" },
      { key: "customers.edit", label: "Edit customers" },
      { key: "customers.delete", label: "Delete customers" },
    ],
  },
  {
    label: "Customer Invoices",
    permissions: [
      { key: "invoices.view", label: "View invoices" },
      { key: "invoices.create", label: "Create invoices" },
      { key: "invoices.email", label: "Email invoices" },
      { key: "invoices.reverse", label: "Reverse invoices" },
    ],
  },
  {
    label: "Xero",
    permissions: [
      { key: "xero.view", label: "View Xero integration" },
      { key: "xero.connect", label: "Connect Xero" },
      { key: "xero.sync", label: "Sync to Xero" },
      { key: "xero.mapping.edit", label: "Edit Xero mapping" },
    ],
  },
  {
    label: "Reports",
    permissions: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.export", label: "Export reports" },
    ],
  },
  {
    label: "Admin",
    permissions: [
      { key: "admin.company", label: "Company setup" },
      { key: "admin.users", label: "User setup" },
      { key: "admin.imports", label: "Import centre" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);

const FULL_ACCESS = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((key) => [key, true])
) as Record<string, boolean>;

const VIEW_ONLY_ACCESS = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((key) => [
    key,
    key.endsWith(".view") || key === "dashboard.view",
  ])
) as Record<string, boolean>;

const ROLE_DEFAULTS: Record<WorkspaceUserRole, Record<string, boolean>> = {
  OWNER: FULL_ACCESS,
  ADMIN: FULL_ACCESS,
  SUPERVISOR: {
    ...VIEW_ONLY_ACCESS,
    "admin.company": true,
    "admin.users": true,
    "admin.imports": true,
    "purchase_orders.approve": true,
    "goods_receipts.approve": true,
    "inventory.counts.approve": true,
    "manufacturing.runs.complete": true,
    "reports.export": true,
  },
  MANAGER: {
    ...VIEW_ONLY_ACCESS,
    "admin.company": true,
    "admin.users": true,
    "admin.imports": true,
    "purchase_orders.approve": true,
    "goods_receipts.approve": true,
    "inventory.counts.approve": true,
    "reports.export": true,
  },
  PROCUREMENT: {
    ...VIEW_ONLY_ACCESS,
    "suppliers.create": true,
    "suppliers.edit": true,
    "purchase_orders.create": true,
    "purchase_orders.edit": true,
    "goods_receipts.create": true,
  },
  PRODUCTION: {
    ...VIEW_ONLY_ACCESS,
    "manufacturing.runs.create": true,
    "manufacturing.runs.start": true,
    "manufacturing.runs.complete": true,
    "boms.view": true,
    "ingredients.view": true,
  },
  INVENTORY: {
    ...VIEW_ONLY_ACCESS,
    "inventory.counts.create": true,
    "inventory.adjustments.post": true,
    "goods_receipts.create": true,
    "goods_receipts.approve": true,
  },
  SALES: {
    ...VIEW_ONLY_ACCESS,
    "customers.create": true,
    "customers.edit": true,
    "invoices.create": true,
    "invoices.email": true,
  },
  VIEW_ONLY: VIEW_ONLY_ACCESS,
  USER: VIEW_ONLY_ACCESS,
};

export const CLIENT_ADMIN_ROLES: WorkspaceUserRole[] = [
  "OWNER",
  "ADMIN",
  "SUPERVISOR",
  "MANAGER",
];

export const ASSIGNABLE_ROLES: WorkspaceUserRole[] = [
  "ADMIN",
  "SUPERVISOR",
  "PROCUREMENT",
  "PRODUCTION",
  "INVENTORY",
  "SALES",
  "VIEW_ONLY",
];

export function normalizeWorkspaceRole(role: string): WorkspaceUserRole {
  if (role === "MANAGER") return "SUPERVISOR";
  const allowed = new Set(Object.keys(ROLE_DEFAULTS));
  return allowed.has(role) ? (role as WorkspaceUserRole) : "VIEW_ONLY";
}

export function hasAdminAccess(role: string): boolean {
  const normalized = normalizeWorkspaceRole(role);
  return CLIENT_ADMIN_ROLES.includes(normalized) || normalized === "MANAGER";
}

export function defaultPermissionsForRole(role: string): Record<string, boolean> {
  const normalized = normalizeWorkspaceRole(role);
  return { ...ROLE_DEFAULTS[normalized] };
}

export const PERMISSION_ALIASES: Record<string, string> = {
  view_dashboard: "dashboard.view",

  view_suppliers: "suppliers.view",
  create_suppliers: "suppliers.create",
  edit_suppliers: "suppliers.edit",
  delete_suppliers: "suppliers.delete",

  view_ingredients: "ingredients.view",
  create_ingredients: "ingredients.create",
  edit_ingredients: "ingredients.edit",
  delete_ingredients: "ingredients.delete",

  view_products: "products.view",
  create_products: "products.create",
  edit_products: "products.edit",
  delete_products: "products.delete",

  view_recipes: "boms.view",
  create_recipes: "boms.create",
  edit_recipes: "boms.edit",
  delete_recipes: "boms.delete",

  view_purchase_orders: "purchase_orders.view",
  create_purchase_orders: "purchase_orders.create",
  edit_purchase_orders: "purchase_orders.edit",
  approve_purchase_orders: "purchase_orders.approve",
  delete_purchase_orders: "purchase_orders.delete",

  view_goods_receipts: "goods_receipts.view",
  create_goods_receipts: "goods_receipts.create",
  approve_goods_receipts: "goods_receipts.approve",

  view_inventory: "inventory.view",
  create_inventory: "inventory.counts.create",
  edit_inventory: "inventory.adjustments.post",
  delete_inventory: "inventory.adjustments.post",

  view_stock_counts: "inventory.view",
  create_stock_counts: "inventory.counts.create",
  approve_stock_counts: "inventory.counts.approve",

  view_manufacturing: "manufacturing.view",
  create_manufacturing_runs: "manufacturing.runs.create",
  start_manufacturing_runs: "manufacturing.runs.start",
  complete_manufacturing_runs: "manufacturing.runs.complete",
  reverse_manufacturing_runs: "manufacturing.runs.reverse",

  view_customers: "customers.view",
  create_customers: "customers.create",
  edit_customers: "customers.edit",
  delete_customers: "customers.delete",

  view_customer_invoices: "invoices.view",
  create_customer_invoices: "invoices.create",
  edit_customer_invoices: "invoices.create",
  approve_customer_invoices: "invoices.reverse",
  email_customer_invoices: "invoices.email",
  delete_customer_invoices: "invoices.reverse",
  reverse_customer_invoices: "invoices.reverse",

  view_reports: "reports.view",
  export_reports: "reports.export",

  view_xero: "xero.view",
  manage_xero: "xero.sync",
  connect_xero: "xero.connect",
  sync_xero: "xero.sync",
  edit_xero_mapping: "xero.mapping.edit",

  view_company_setup: "admin.company",
  edit_company_setup: "admin.company",
  view_user_setup: "admin.users",
  create_users: "admin.users",
  edit_users: "admin.users",
  disable_users: "admin.users",
  reset_passwords: "admin.users",
  manage_permissions: "admin.users",
  view_imports: "admin.imports",
  run_imports: "admin.imports",
};

export function resolvePermissionKey(permission: string): string {
  return PERMISSION_ALIASES[permission] || permission;
}

export function normalizePermissionMap(
  input?: Record<string, boolean> | null
): Record<string, boolean> {
  const normalized = Object.fromEntries(
    ALL_PERMISSION_KEYS.map((key) => [key, false])
  ) as Record<string, boolean>;

  if (!input) return normalized;

  for (const [rawKey, value] of Object.entries(input)) {
    const key = resolvePermissionKey(rawKey);
    if (key in normalized) normalized[key] = Boolean(value);
  }

  return normalized;
}

export function resolveEffectivePermissions(
  role: string,
  custom?: Record<string, boolean> | null
): Record<string, boolean> {
  const normalizedRole = normalizeWorkspaceRole(role);
  if (normalizedRole === "OWNER") return { ...FULL_ACCESS };

  const roleDefaults = { ...defaultPermissionsForRole(normalizedRole) };
  const hasSavedPermissions = Boolean(custom && Object.keys(custom).length > 0);
  if (!hasSavedPermissions) return roleDefaults;

  // Merge saved overrides onto role defaults so sparse DB permission rows do not
  // strip standard view access from the sidebar and workspace.
  return { ...roleDefaults, ...normalizePermissionMap(custom) };
}

export function mergePermissions(
  role: string,
  custom?: Record<string, boolean> | null
): Record<string, boolean> {
  return resolveEffectivePermissions(role, custom);
}

export function hasPermission(
  role: string,
  permission: string,
  custom?: Record<string, boolean> | null
): boolean {
  const permissions = resolveEffectivePermissions(role, custom);
  return Boolean(permissions[resolvePermissionKey(permission)]);
}

export type WorkspacePermissionSession = {
  role: string;
  permissions: Record<string, boolean>;
};

export function sessionHasPermission(
  session: WorkspacePermissionSession,
  permission: string
): boolean {
  if (normalizeWorkspaceRole(session.role) === "OWNER") return true;
  const key = resolvePermissionKey(permission);
  return Boolean(session.permissions[key]);
}

export const NAV_PATH_PERMISSIONS: Record<string, string> = {
  "/dashboard": "dashboard.view",

  "/suppliers": "suppliers.view",
  "/supplier-intelligence": "suppliers.view",
  "/supplier-inflation": "suppliers.view",

  "/document-intelligence": "suppliers.view",
  "/document-intelligence/supplier-learning": "suppliers.view",
  "/document-intelligence/price-history/supplier": "suppliers.view",
  "/document-intelligence/settings": "suppliers.view",
  "/email-invoice-inbox": "suppliers.view",

  "/ingredients": "ingredients.view",

  "/products": "products.view",

  "/recipes": "boms.view",

  "/purchase-orders": "purchase_orders.view",
  "/purchase-orders/list": "purchase_orders.view",
  "/purchase-orders/approvals": "purchase_orders.view",
  "/purchase-orders/back-orders": "purchase_orders.view",
  "/purchase-orders/settings": "purchase_orders.view",

  "/goods-receipts": "goods_receipts.view",

  "/inventory": "inventory.view",
  "/inventory/stock": "inventory.view",
  "/inventory/ledger": "inventory.view",
  "/inventory/counts": "inventory.view",
  "/inventory/alerts": "inventory.view",
  "/inventory-intelligence": "inventory.view",

  "/manufacturing": "manufacturing.view",
  "/manufacturing/runs": "manufacturing.view",
  "/manufacturing/history": "manufacturing.view",
  "/manufacturing/finished-goods": "manufacturing.view",

  "/customers": "customers.view",
  "/contacts": "customers.view",

  "/customer-invoices": "invoices.view",

  "/integrations/xero": "xero.view",

  "/reports": "reports.view",

  "/executive-boardroom": "reports.view",
  "/cost-intelligence": "reports.view",
  "/business-health": "reports.view",
  "/early-warning": "reports.view",
  "/predictive-risk": "reports.view",
  "/root-cause": "reports.view",
  "/decisions": "reports.view",
  "/actions": "reports.view",
  "/autonomous-command-centre": "reports.view",
  "/ask-vyron": "reports.view",
  "/execution-centre": "reports.view",
  "/ai-cost-intelligence": "reports.view",

  "/admin/company-setup": "admin.company",
  "/admin/users": "admin.users",
  "/admin/imports": "admin.imports",
  "/deployment-readiness": "admin.company",
};

const SORTED_NAV_PREFIXES = Object.entries(NAV_PATH_PERMISSIONS).sort(
  (a, b) => b[0].length - a[0].length
);

export function getRequiredPermissionForPath(pathname: string): string | null {
  if (pathname === "/login" || pathname.startsWith("/developer")) return null;

  for (const [prefix, permission] of SORTED_NAV_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return permission;
  }

  if (pathname.startsWith("/admin")) return "admin.company";

  return null;
}

export function canAccessPath(
  pathname: string,
  session: WorkspacePermissionSession
): boolean {
  const required = getRequiredPermissionForPath(pathname);
  if (!required) return true;
  return sessionHasPermission(session, required);
}

export function hasAnyAdminNavPermission(
  session: WorkspacePermissionSession
): boolean {
  return (
    sessionHasPermission(session, "admin.company") ||
    sessionHasPermission(session, "admin.users") ||
    sessionHasPermission(session, "admin.imports")
  );
}