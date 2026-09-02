import type { SupabaseClient } from "@supabase/supabase-js";

import { composeAddress, type StructuredAddress } from "@/lib/vyron-tax-profile";

/**
 * Customer branches, and the branch identity an invoice keeps.
 *
 * A retail group is one customer — one account, one VAT number, one credit
 * limit, one sales history. The branch says which of its stores a particular
 * invoice belongs to. Modelling the stores as separate customers would scatter
 * one business's trading relationship across several records, which is the
 * problem this exists to avoid.
 *
 * Branches are optional throughout. A customer with none invoices exactly as it
 * always has, and nothing here infers a branch from an address already on the
 * customer record.
 *
 * Every read and write is scoped to one company, and the composite foreign keys
 * behind them mean the database refuses a cross-tenant reference even if a query
 * forgets to.
 */

export type CustomerBranch = {
  id: string;
  company_id: string;
  customer_id: string;
  branch_code: string | null;
  branch_name: string;
  description: string | null;
  is_active: boolean;
  contact_person: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  delivery_instructions: string | null;
  notes: string | null;
};

export type CustomerBranchInput = {
  branch_code?: string | null;
  branch_name: string;
  description?: string | null;
  is_active?: boolean;
  contact_person?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  delivery_instructions?: string | null;
  notes?: string | null;
};

/**
 * What an invoice keeps about the branch it was raised for.
 *
 * Rendered from, not looked up. A branch that later moves premises must not
 * rewrite the address on an invoice that was already issued.
 */
export type BranchSnapshot = {
  branchId: string;
  branchCode: string | null;
  branchName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  deliveryInstructions: string | null;
};

const BRANCH_COLUMNS =
  "id, company_id, customer_id, branch_code, branch_name, description, is_active, contact_person, phone, mobile, email, " +
  "address_line1, address_line2, suburb, city, province, postal_code, country, delivery_instructions, notes";

const clean = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();
const orNull = (value: unknown): string | null => clean(value) || null;

/** The branch address in the same shape every other VYRON address uses. */
export function branchAddress(branch: Pick<CustomerBranch,
  "address_line1" | "address_line2" | "suburb" | "city" | "province" | "postal_code" | "country">): StructuredAddress {
  return {
    line1: branch.address_line1 || "",
    line2: branch.address_line2 || "",
    suburb: branch.suburb || "",
    city: branch.city || "",
    province: branch.province || "",
    postalCode: branch.postal_code || "",
    country: branch.country || "",
  };
}

export function composeBranchAddress(branch: CustomerBranch): string {
  return composeAddress(branchAddress(branch));
}

/** How a branch reads in a picker: "Johannesburg Branch — JHB01". */
export function branchLabel(branch: Pick<CustomerBranch, "branch_name" | "branch_code">): string {
  const code = clean(branch.branch_code);
  return code ? `${branch.branch_name} — ${code}` : branch.branch_name;
}

export function buildBranchSnapshot(branch: CustomerBranch): BranchSnapshot {
  return {
    branchId: branch.id,
    branchCode: orNull(branch.branch_code),
    branchName: clean(branch.branch_name),
    contactPerson: orNull(branch.contact_person),
    phone: orNull(branch.phone) || orNull(branch.mobile),
    email: orNull(branch.email),
    address: composeBranchAddress(branch) || null,
    deliveryInstructions: orNull(branch.delivery_instructions),
  };
}

/* ------------------------------------------------------------------- reading */

export async function listCustomerBranches(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  options: { activeOnly?: boolean } = {}
): Promise<CustomerBranch[]> {
  let query = supabase
    .from("vyron_customer_branches")
    .select(BRANCH_COLUMNS)
    .eq("company_id", companyId)
    .eq("customer_id", customerId);
  if (options.activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query.order("branch_name");
  if (error) throw new Error(error.message);
  return (data || []) as unknown as CustomerBranch[];
}

export async function getCustomerBranch(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string
): Promise<CustomerBranch | null> {
  const { data, error } = await supabase
    .from("vyron_customer_branches")
    .select(BRANCH_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as CustomerBranch | null) ?? null;
}

/* ------------------------------------------------------------------- writing */

function payloadFrom(input: CustomerBranchInput): Record<string, unknown> {
  return {
    branch_code: orNull(input.branch_code),
    branch_name: clean(input.branch_name),
    description: orNull(input.description),
    contact_person: orNull(input.contact_person),
    phone: orNull(input.phone),
    mobile: orNull(input.mobile),
    email: orNull(input.email),
    address_line1: orNull(input.address_line1),
    address_line2: orNull(input.address_line2),
    suburb: orNull(input.suburb),
    city: orNull(input.city),
    province: orNull(input.province),
    postal_code: orNull(input.postal_code),
    country: orNull(input.country),
    delivery_instructions: orNull(input.delivery_instructions),
    notes: orNull(input.notes),
  };
}

/** The customer named in the request does not belong to this workspace. */
export class CustomerNotInWorkspaceError extends Error {
  constructor() {
    super("Customer not found in this workspace.");
    this.name = "CustomerNotInWorkspaceError";
  }
}

export class BranchCodeInUseError extends Error {
  constructor(code: string) {
    super(`Branch code "${code}" is already used by another branch of this customer.`);
    this.name = "BranchCodeInUseError";
  }
}

export async function createCustomerBranch(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  input: CustomerBranchInput
): Promise<CustomerBranch> {
  if (!clean(input.branch_name)) throw new Error("A branch needs a name.");

  // The customer is confirmed to belong to this company before anything is
  // written, so a branch cannot be hung off another tenant's customer.
  const { data: customer, error: customerError } = await supabase
    .from("vyron_customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new CustomerNotInWorkspaceError();

  const { data, error } = await supabase
    .from("vyron_customer_branches")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      is_active: input.is_active ?? true,
      ...payloadFrom(input),
    })
    .select(BRANCH_COLUMNS)
    .single();

  if (error) {
    if (/vyron_customer_branches_code_key/.test(error.message)) {
      throw new BranchCodeInUseError(clean(input.branch_code));
    }
    throw new Error(error.message);
  }
  return data as unknown as CustomerBranch;
}

export async function updateCustomerBranch(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string,
  input: Partial<CustomerBranchInput>
): Promise<CustomerBranch> {
  const existing = await getCustomerBranch(supabase, companyId, branchId);
  if (!existing) throw new Error("Branch not found in this workspace.");

  const merged: CustomerBranchInput = {
    branch_code: input.branch_code !== undefined ? input.branch_code : existing.branch_code,
    branch_name: input.branch_name !== undefined ? input.branch_name : existing.branch_name,
    description: input.description !== undefined ? input.description : existing.description,
    contact_person: input.contact_person !== undefined ? input.contact_person : existing.contact_person,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    mobile: input.mobile !== undefined ? input.mobile : existing.mobile,
    email: input.email !== undefined ? input.email : existing.email,
    address_line1: input.address_line1 !== undefined ? input.address_line1 : existing.address_line1,
    address_line2: input.address_line2 !== undefined ? input.address_line2 : existing.address_line2,
    suburb: input.suburb !== undefined ? input.suburb : existing.suburb,
    city: input.city !== undefined ? input.city : existing.city,
    province: input.province !== undefined ? input.province : existing.province,
    postal_code: input.postal_code !== undefined ? input.postal_code : existing.postal_code,
    country: input.country !== undefined ? input.country : existing.country,
    delivery_instructions:
      input.delivery_instructions !== undefined ? input.delivery_instructions : existing.delivery_instructions,
    notes: input.notes !== undefined ? input.notes : existing.notes,
  };
  if (!clean(merged.branch_name)) throw new Error("A branch needs a name.");

  const patch: Record<string, unknown> = payloadFrom(merged);
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("vyron_customer_branches")
    .update(patch)
    .eq("id", branchId)
    .eq("company_id", companyId)
    .select(BRANCH_COLUMNS)
    .single();

  if (error) {
    if (/vyron_customer_branches_code_key/.test(error.message)) {
      throw new BranchCodeInUseError(clean(merged.branch_code));
    }
    throw new Error(error.message);
  }
  return data as unknown as CustomerBranch;
}

/**
 * Branches are deactivated, never deleted.
 *
 * A branch that has invoiced is part of the record of what happened, so it stops
 * being offered for new work and stays exactly where it is. The database refuses
 * the delete as well, through ON DELETE RESTRICT.
 */
export async function setCustomerBranchActive(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string,
  isActive: boolean
): Promise<CustomerBranch> {
  return updateCustomerBranch(supabase, companyId, branchId, { is_active: isActive });
}

export async function countBranchInvoices(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("vyron_customer_invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branchId);
  if (error) throw new Error(error.message);
  return (data || []).length;
}

/* ----------------------------------------------------------------- invoicing */

export class BranchNotSelectableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BranchNotSelectableError";
  }
}

/**
 * Confirm a branch may be put on an invoice for this customer.
 *
 * The branch id arrives from a browser, so none of it is taken on trust: the
 * branch must exist in this company, belong to this customer, and — for a new
 * invoice — still be active. A branch of another customer is refused even when
 * it belongs to the same company, which is what stops one group's site being
 * billed under another's account.
 */
export async function resolveBranchForInvoice(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string | null | undefined,
  branchId: string | null | undefined,
  options: { allowInactive?: boolean } = {}
): Promise<CustomerBranch | null> {
  if (!branchId) return null;
  if (!customerId) {
    throw new BranchNotSelectableError("Choose a customer before choosing a branch.");
  }

  const branch = await getCustomerBranch(supabase, companyId, branchId);
  if (!branch) throw new BranchNotSelectableError("Branch not found in this workspace.");
  if (branch.customer_id !== customerId) {
    throw new BranchNotSelectableError("That branch belongs to a different customer.");
  }
  if (!branch.is_active && !options.allowInactive) {
    throw new BranchNotSelectableError(`"${branch.branch_name}" is deactivated and cannot be used on a new invoice.`);
  }
  return branch;
}
