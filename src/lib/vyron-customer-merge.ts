import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merging imported customers into the customers a workspace already has.
 *
 * The rule this module exists to enforce: importing a customer twice must not
 * produce two customers. Imports arrive repeatedly, from different systems and
 * different people, each carrying a different slice of the truth — one file has
 * the phone number, the next has the VAT number, a third has the address. They
 * describe one customer and must end up as one customer holding all of it.
 *
 * Two dangers pull in opposite directions, and both are worse than doing
 * nothing. Matching too loosely welds two real businesses into one record and
 * takes their invoice history with it. Matching too tightly splits one customer
 * across a dozen near-identical rows until nobody can tell which is current.
 * Where the evidence does not settle it, this module refuses to decide and says
 * so, because a human resolving a handful of flagged rows is cheap and
 * unpicking a wrongly merged customer is not.
 *
 * Every lookup is scoped to one company. A customer in one workspace is never a
 * candidate for a row imported into another, whatever the file says.
 */

/* ------------------------------------------------------------------ shapes */

export type CustomerRecord = {
  id: string;
  customer_name: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  email?: string | null;
  invoice_email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  delivery_address?: string | null;
  contact_person?: string | null;
  website?: string | null;
  category?: string | null;
  terms?: string | null;
  xero_contact_id?: string | null;
};

/** One incoming row, already mapped to customer fields. */
export type CustomerImportRow = {
  customer_name?: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  email?: string | null;
  invoice_email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  delivery_address?: string | null;
  contact_person?: string | null;
  website?: string | null;
  category?: string | null;
  terms?: string | null;
  xero_contact_id?: string | null;

  /*
   * Branch columns. A file that lists one customer once per site repeats the
   * customer's own columns on every line; those rows describe one customer and
   * several branches, not several customers.
   */
  branch_code?: string | null;
  branch_name?: string | null;
  branch_address_line1?: string | null;
  branch_address_line2?: string | null;
  branch_suburb?: string | null;
  branch_city?: string | null;
  branch_province?: string | null;
  branch_postal_code?: string | null;
  branch_country?: string | null;
  branch_contact_person?: string | null;
  branch_phone?: string | null;
  branch_email?: string | null;
};

/** The fields an import may fill in. Identity and money fields are not here. */
export const MERGEABLE_FIELDS = [
  "trading_name",
  "registration_number",
  "vat_number",
  "email",
  "invoice_email",
  "phone",
  "billing_address",
  "delivery_address",
  "contact_person",
  "website",
  "category",
  "terms",
  "xero_contact_id",
] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export type FieldChange = { field: MergeableField; from: string | null; to: string };
export type FieldConflict = { field: MergeableField; existing: string; incoming: string };

export type MatchOutcome =
  | { kind: "matched"; customer: CustomerRecord; basis: string }
  | { kind: "ambiguous"; candidates: CustomerRecord[]; reason: string }
  | { kind: "none" };

export type PlanStatus =
  | "new"
  | "update"
  | "unchanged"
  | "conflict"
  | "ambiguous";

export type BranchPlanRow = {
  sourceRows: number[];
  status: PlanStatus;
  branchCode: string | null;
  branchName: string;
  matchedBranchId: string | null;
  changes: { field: string; from: string | null; to: string }[];
  conflicts: FieldConflict[];
  message: string;
};

export type CustomerImportPlanRow = {
  /** 1-based positions of the source rows that folded into this entry. */
  sourceRows: number[];
  incoming: CustomerImportRow;
  status: PlanStatus;
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
  matchBasis: string | null;
  changes: FieldChange[];
  conflicts: FieldConflict[];
  ambiguousWith: { id: string; name: string }[];
  message: string;
  /** The branches this customer's rows described, if any. */
  branches: BranchPlanRow[];
  /** The incoming rows this entry was built from, kept so apply can read branch columns. */
  members?: CustomerImportRow[];
};

export type CustomerImportPlan = {
  sourceRowCount: number;
  rows: CustomerImportPlanRow[];
  summary: Record<PlanStatus, number>;
};

/* ----------------------------------------------------------- normalisation */

const LEGAL_NOISE =
  /\b(PTY|PTY\.|PROPRIETARY|LTD|LTD\.|LIMITED|CC|INC|CO|COMPANY|GROUP|HOLDINGS|T\/A|TA|TRADING AS|THE|AND)\b/g;

/**
 * A name reduced to what actually identifies the business.
 *
 * Legal wrappers are noise for matching: "AL Lifestyle (Pty) Ltd T/A Jellyfish"
 * and "AL LIFESTYLE JELLYFISH" are one customer written two ways. Stripping
 * them is safe because the remaining words still have to match in full.
 */
export function normaliseName(value: unknown): string {
  // Apostrophes are deleted rather than spaced, so a possessive stays one word:
  // "What's The Scoop" and "WHATS THE SCOOP" are the same shop, and splitting on
  // the apostrophe would leave a stray "S" that matches nothing.
  const raw = String(value ?? "").toUpperCase().replace(/[‘’'`]/g, "");
  const withoutNoise = raw.replace(/[^A-Z0-9\s/.]/g, " ").replace(LEGAL_NOISE, " ");
  return withoutNoise.replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}

/** Digits only, with a South African country code reduced to its local form. */
export function normalisePhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("27") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

export function normaliseEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Registration and VAT numbers compared without their punctuation. */
export function normaliseRef(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** How a field is compared when deciding whether two values agree. */
function comparableValue(field: MergeableField, value: unknown): string {
  if (field === "phone") return normalisePhone(value);
  if (field === "email" || field === "invoice_email") return normaliseEmail(value);
  if (field === "vat_number" || field === "registration_number") return normaliseRef(value);
  return clean(value).toUpperCase();
}

/* ---------------------------------------------------------------- matching */

function tokens(name: string): string[] {
  return name.split(" ").filter(Boolean);
}

/**
 * Find the existing customer a row refers to.
 *
 * The tiers run strongest first and stop at the first that produces exactly one
 * candidate. A tier that produces several is reported as ambiguous rather than
 * resolved by preferring one — there is nothing in the data that would justify
 * the preference.
 *
 * Email and phone never identify a customer on their own. Whole customer books
 * legitimately share one address (a group's accounts inbox, a switchboard), and
 * matching on either would collapse every one of them into a single record.
 * They corroborate a name; they never stand in for one.
 */
export function matchCustomer(existing: CustomerRecord[], row: CustomerImportRow): MatchOutcome {
  const xero = clean(row.xero_contact_id);
  if (xero) {
    const hits = existing.filter((c) => clean(c.xero_contact_id) === xero);
    if (hits.length === 1) return { kind: "matched", customer: hits[0], basis: "Xero contact id" };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits, reason: "Several customers share that Xero contact id." };
  }

  const vat = normaliseRef(row.vat_number);
  if (vat) {
    const hits = existing.filter((c) => normaliseRef(c.vat_number) === vat);
    if (hits.length === 1) return { kind: "matched", customer: hits[0], basis: "VAT number" };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits, reason: "Several customers share that VAT number." };
  }

  const reg = normaliseRef(row.registration_number);
  if (reg) {
    const hits = existing.filter((c) => normaliseRef(c.registration_number) === reg);
    if (hits.length === 1) return { kind: "matched", customer: hits[0], basis: "Registration number" };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits, reason: "Several customers share that registration number." };
  }

  const name = normaliseName(row.customer_name);
  if (!name) return { kind: "none" };

  const exact = existing.filter((c) => normaliseName(c.customer_name) === name);
  if (exact.length === 1) return { kind: "matched", customer: exact[0], basis: "Name" };
  if (exact.length > 1) {
    return { kind: "ambiguous", candidates: exact, reason: "More than one customer already has that name." };
  }

  /*
   * A name that is wholly contained in another, in either direction: "PALM RISE
   * TRADING" inside "PALM RISE TRADING KINGSBURG DULCE". Accepted only when the
   * shorter name is specific enough to mean something on its own — a single
   * shared word is a coincidence, not an identification — and only when exactly
   * one customer qualifies.
   */
  const rowTokens = tokens(name);
  const contained = existing.filter((c) => {
    const candidate = normaliseName(c.customer_name);
    if (!candidate) return false;
    const candTokens = tokens(candidate);
    const shorter = rowTokens.length <= candTokens.length ? rowTokens : candTokens;
    if (shorter.length < 2) return false;
    return `${candidate} `.includes(`${name} `) || `${name} `.includes(`${candidate} `);
  });
  if (contained.length === 1) return { kind: "matched", customer: contained[0], basis: "Name (one contains the other)" };
  if (contained.length > 1) {
    return { kind: "ambiguous", candidates: contained, reason: "Several customers have names containing this one." };
  }

  return { kind: "none" };
}

/* ----------------------------------------------------------------- merging */

/**
 * What an import would change about an existing customer.
 *
 * A blank incoming value is silence, not an instruction to erase: a file that
 * omits the phone column must never wipe the phone numbers already recorded.
 * A value that disagrees with one already held is reported and left alone —
 * the import is not automatically more current than the record.
 */
export function mergeCustomer(
  existing: CustomerRecord,
  row: CustomerImportRow
): { changes: FieldChange[]; conflicts: FieldConflict[] } {
  const changes: FieldChange[] = [];
  const conflicts: FieldConflict[] = [];

  for (const field of MERGEABLE_FIELDS) {
    const incoming = clean((row as Record<string, unknown>)[field]);
    if (!incoming) continue;

    const current = clean((existing as Record<string, unknown>)[field]);
    if (!current) {
      changes.push({ field, from: null, to: incoming });
      continue;
    }
    if (comparableValue(field, current) === comparableValue(field, incoming)) continue;
    conflicts.push({ field, existing: current, incoming });
  }

  return { changes, conflicts };
}

/**
 * Fold rows that describe the same customer within one file into one entry.
 *
 * A file may list a customer once per branch, or simply repeat it. Each
 * occurrence usually carries a little more, so they are combined rather than
 * fought over: the first non-blank value for a field wins, and later
 * disagreements are left for the merge against the stored record to report.
 */
export function collapseRows(
  rows: CustomerImportRow[]
): { row: CustomerImportRow; sourceRows: number[]; members: CustomerImportRow[] }[] {
  const groups: { row: CustomerImportRow; sourceRows: number[]; members: CustomerImportRow[] }[] = [];

  rows.forEach((row, index) => {
    const asRecord: CustomerRecord[] = groups.map((g, i) => ({
      id: String(i),
      customer_name: g.row.customer_name ?? null,
      registration_number: g.row.registration_number ?? null,
      vat_number: g.row.vat_number ?? null,
      xero_contact_id: g.row.xero_contact_id ?? null,
    }));
    const outcome = matchCustomer(asRecord, row);

    if (outcome.kind === "matched") {
      const target = groups[Number(outcome.customer.id)];
      target.sourceRows.push(index + 1);
      // Kept whole: these rows may each describe a different branch.
      target.members.push(row);
      for (const field of MERGEABLE_FIELDS) {
        const incoming = clean((row as Record<string, unknown>)[field]);
        const held = clean((target.row as Record<string, unknown>)[field]);
        if (incoming && !held) (target.row as Record<string, unknown>)[field] = incoming;
      }
      return;
    }
    groups.push({ row: { ...row }, sourceRows: [index + 1], members: [row] });
  });

  return groups;
}

/* -------------------------------------------------------------- the plan */

/** Load every customer in one company. Tenant scope is not optional. */
export async function loadCompanyCustomers(
  supabase: SupabaseClient,
  companyId: string
): Promise<CustomerRecord[]> {
  const { data, error } = await supabase
    .from("vyron_customers")
    .select(
      "id, customer_name, trading_name, registration_number, vat_number, email, invoice_email, phone, billing_address, delivery_address, contact_person, website, category, terms, xero_contact_id"
    )
    .eq("company_id", companyId)
    .limit(20000);
  if (error) throw new Error(error.message);
  return (data || []) as CustomerRecord[];
}

const STATUS_MESSAGE: Record<PlanStatus, string> = {
  new: "New customer",
  update: "Existing customer — information will be added",
  unchanged: "Existing customer — no changes",
  conflict: "Existing customer — conflicting information",
  ambiguous: "Ambiguous — requires review",
};

/**
 * Work out what an import would do, without doing any of it.
 *
 * The plan is what the preview shows and what the apply step executes, so what
 * the operator confirms is exactly what runs.
 */
/** A stored branch, as much of it as matching and merging need. */
export type ExistingBranch = {
  id: string;
  branch_code?: string | null;
  branch_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
};

const BRANCH_FIELDS: { key: string; column: string }[] = [
  { key: "branch_address_line1", column: "address_line1" },
  { key: "branch_address_line2", column: "address_line2" },
  { key: "branch_suburb", column: "suburb" },
  { key: "branch_city", column: "city" },
  { key: "branch_province", column: "province" },
  { key: "branch_postal_code", column: "postal_code" },
  { key: "branch_country", column: "country" },
  { key: "branch_contact_person", column: "contact_person" },
  { key: "branch_phone", column: "phone" },
  { key: "branch_email", column: "email" },
];

/**
 * Which stored branch a row refers to.
 *
 * A branch code, where the file supplies one, is the identity: it is what the
 * customer themselves uses to tell their sites apart. Without one the branch
 * name has to serve, and only when it matches exactly once. Two branches are
 * never joined because their names merely resemble each other, because
 * "Cape Town" and "Cape Town North" are different shops.
 */
export function matchBranch(
  existing: ExistingBranch[],
  row: CustomerImportRow
): { kind: "matched"; branch: ExistingBranch } | { kind: "ambiguous"; candidates: ExistingBranch[] } | { kind: "none" } {
  const code = normaliseRef(row.branch_code);
  if (code) {
    const hits = existing.filter((b) => normaliseRef(b.branch_code) === code);
    if (hits.length === 1) return { kind: "matched", branch: hits[0] };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits };
    return { kind: "none" };
  }

  const name = normaliseName(row.branch_name);
  if (!name) return { kind: "none" };
  const hits = existing.filter((b) => normaliseName(b.branch_name) === name);
  if (hits.length === 1) return { kind: "matched", branch: hits[0] };
  if (hits.length > 1) return { kind: "ambiguous", candidates: hits };
  return { kind: "none" };
}

/**
 * Fold the rows of one file that describe the same branch.
 *
 * A file may list a branch more than once, each line carrying a little more of
 * it. They are one branch, so they are combined before anything is decided:
 * the first non-blank value for a field wins, exactly as repeated customer rows
 * are handled.
 */
function foldBranchRows(
  members: CustomerImportRow[],
  sourceRows: number[]
): { key: string; row: CustomerImportRow; sourceRows: number[] }[] {
  const folded: { key: string; row: CustomerImportRow; sourceRows: number[] }[] = [];
  const byKey = new Map<string, { key: string; row: CustomerImportRow; sourceRows: number[] }>();

  members.forEach((member, index) => {
    const code = clean(member.branch_code);
    const name = clean(member.branch_name);
    if (!code && !name) return;

    const sourceRow = sourceRows[index] ?? index + 1;
    const key = code ? `c:${normaliseRef(code)}` : `n:${normaliseName(name)}`;
    const held = byKey.get(key);

    if (!held) {
      const entry = { key, row: { ...member }, sourceRows: [sourceRow] };
      byKey.set(key, entry);
      folded.push(entry);
      return;
    }

    held.sourceRows.push(sourceRow);
    const target = held.row as unknown as Record<string, unknown>;
    const incoming = member as unknown as Record<string, unknown>;
    for (const field of ["branch_code", "branch_name", ...BRANCH_FIELDS.map((f) => f.key)]) {
      if (!clean(target[field]) && clean(incoming[field])) target[field] = incoming[field];
    }
  });

  return folded;
}

/** What an import would do to one customer's branches. */
function planBranches(
  existing: ExistingBranch[],
  members: CustomerImportRow[],
  sourceRows: number[]
): BranchPlanRow[] {
  const plans: BranchPlanRow[] = [];

  for (const folded of foldBranchRows(members, sourceRows)) {
    const row = folded.row;
    const code = clean(row.branch_code);
    const name = clean(row.branch_name);

    const outcome = matchBranch(existing, row);

    if (outcome.kind === "ambiguous") {
      const entry: BranchPlanRow = {
        sourceRows: folded.sourceRows,
        status: "ambiguous",
        branchCode: code || null,
        branchName: name || code,
        matchedBranchId: null,
        changes: [],
        conflicts: [],
        message: "Ambiguous — more than one branch matches. Requires review.",
      };
      plans.push(entry);
      continue;
    }

    if (outcome.kind === "none") {
      if (!name) {
        const entry: BranchPlanRow = {
          sourceRows: folded.sourceRows,
          status: "ambiguous",
          branchCode: code || null,
          branchName: code,
          matchedBranchId: null,
          changes: [],
          conflicts: [],
          message: "A branch code with no branch name — cannot be created safely. Requires review.",
        };
        plans.push(entry);
        continue;
      }
      const entry: BranchPlanRow = {
        sourceRows: folded.sourceRows,
        status: "new",
        branchCode: code || null,
        branchName: name,
        matchedBranchId: null,
        changes: [],
        conflicts: [],
        message: "New branch",
      };
      plans.push(entry);
      continue;
    }

    const branch = outcome.branch;
    const changes: { field: string; from: string | null; to: string }[] = [];
    const conflicts: FieldConflict[] = [];
    const compare: { column: string; incoming: string }[] = [
      { column: "branch_name", incoming: name },
      ...BRANCH_FIELDS.map((f) => ({
        column: f.column,
        incoming: clean((row as unknown as Record<string, unknown>)[f.key]),
      })),
    ];

    for (const entry of compare) {
      if (!entry.incoming) continue;
      const current = clean((branch as unknown as Record<string, unknown>)[entry.column]);
      if (!current) {
        changes.push({ field: entry.column, from: null, to: entry.incoming });
        continue;
      }
      if (current.toUpperCase() === entry.incoming.toUpperCase()) continue;
      conflicts.push({ field: entry.column as MergeableField, existing: current, incoming: entry.incoming });
    }

    const planned: BranchPlanRow = {
      sourceRows: folded.sourceRows,
      status: conflicts.length ? "conflict" : changes.length ? "update" : "unchanged",
      branchCode: code || clean(branch.branch_code) || null,
      branchName: name || clean(branch.branch_name),
      matchedBranchId: branch.id,
      changes,
      conflicts,
      message: conflicts.length
        ? "Existing branch — conflicting information"
        : changes.length
          ? "Existing branch — information will be added"
          : "Existing branch — no changes",
    };
    plans.push(planned);
  }

  return plans;
}

export function buildCustomerImportPlan(
  existing: CustomerRecord[],
  rows: CustomerImportRow[],
  /** Branches already stored, keyed by customer id. Absent means none. */
  existingBranches: Map<string, ExistingBranch[]> = new Map()
): CustomerImportPlan {
  const collapsed = collapseRows(rows);
  const planRows: CustomerImportPlanRow[] = [];

  // Rows matched earlier in the same file must be visible to later rows, or two
  // rows the collapse step kept apart could each create their own customer.
  const claimed = new Map<string, CustomerImportPlanRow>();

  for (const group of collapsed) {
    const outcome = matchCustomer(existing, group.row);

    if (outcome.kind === "ambiguous") {
      planRows.push({
        sourceRows: group.sourceRows,
        incoming: group.row,
        status: "ambiguous",
        matchedCustomerId: null,
        matchedCustomerName: null,
        matchBasis: null,
        changes: [],
        conflicts: [],
        ambiguousWith: outcome.candidates.map((c) => ({ id: c.id, name: clean(c.customer_name) })),
        message: `${STATUS_MESSAGE.ambiguous}: ${outcome.reason}`,
        // The customer could not be identified, so its branches cannot be either.
        branches: [],
      });
      continue;
    }

    if (outcome.kind === "none") {
      planRows.push({
        sourceRows: group.sourceRows,
        incoming: group.row,
        status: "new",
        matchedCustomerId: null,
        matchedCustomerName: null,
        matchBasis: null,
        changes: [],
        conflicts: [],
        ambiguousWith: [],
        message: STATUS_MESSAGE.new,
        branches: planBranches([], group.members, group.sourceRows),
        members: group.members,
      });
      continue;
    }

    const alreadyClaimed = claimed.get(outcome.customer.id);
    const { changes, conflicts } = mergeCustomer(outcome.customer, group.row);
    const status: PlanStatus = conflicts.length ? "conflict" : changes.length ? "update" : "unchanged";

    const planRow: CustomerImportPlanRow = {
      sourceRows: alreadyClaimed
        ? [...alreadyClaimed.sourceRows, ...group.sourceRows]
        : group.sourceRows,
      incoming: group.row,
      status,
      matchedCustomerId: outcome.customer.id,
      matchedCustomerName: clean(outcome.customer.customer_name),
      matchBasis: outcome.basis,
      changes,
      conflicts,
      ambiguousWith: [],
      message: STATUS_MESSAGE[status],
      branches: planBranches(existingBranches.get(outcome.customer.id) || [], group.members, group.sourceRows),
      members: group.members,
    };

    if (alreadyClaimed) {
      // Same stored customer reached twice: keep one entry, not two.
      Object.assign(alreadyClaimed, planRow);
      continue;
    }
    claimed.set(outcome.customer.id, planRow);
    planRows.push(planRow);
  }

  const summary: Record<PlanStatus, number> = { new: 0, update: 0, unchanged: 0, conflict: 0, ambiguous: 0 };
  for (const r of planRows) summary[r.status] += 1;

  return { sourceRowCount: rows.length, rows: planRows, summary };
}

/* ---------------------------------------------------------------- applying */

/** The incoming rows behind a plan's branches, keyed the same way the plan keyed them. */
function branchRowsFor(row: CustomerImportPlanRow): Map<string, CustomerImportRow> {
  const map = new Map<string, CustomerImportRow>();
  const members = row.members || [];
  for (const folded of foldBranchRows(members, members.map((_, i) => i + 1))) {
    map.set(folded.key, folded.row);
  }
  return map;
}

export type ApplyResult = {
  created: number;
  updated: number;
  branchesCreated: number;
  branchesUpdated: number;
  branchesUnchanged: number;
  branchesAmbiguous: number;
  unchanged: number;
  conflicts: number;
  ambiguous: number;
  errors: string[];
  createdIds: string[];
};

/**
 * Carry out a plan.
 *
 * Only the fields the plan listed are written, so a value already held is never
 * touched — including on a row whose other fields conflict. Ambiguous rows are
 * counted and skipped: creating a customer for one would produce exactly the
 * duplicate the operator was asked to rule out.
 *
 * A failure rolls back the customers this run created, so a half-finished
 * import does not leave new records behind. Field additions to customers that
 * already existed are left in place — they are merges of information the
 * operator supplied, each independently correct, and reversing them could
 * discard data that arrived from elsewhere in between.
 */

/**
 * Create and fill in a customer's branches from an import.
 *
 * The same rules the customer itself follows: a blank incoming value is
 * silence rather than an instruction to erase, a value that disagrees with one
 * already stored is left alone and reported, and a branch that could not be
 * identified safely is skipped rather than guessed at. Re-importing the same
 * file therefore changes nothing on the second run.
 */
async function applyBranchPlan(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  branches: BranchPlanRow[],
  result: ApplyResult,
  createdBranchIds: string[],
  incomingByKey: Map<string, CustomerImportRow>
) {
  for (const branch of branches) {
    if (branch.status === "ambiguous") {
      result.branchesAmbiguous += 1;
      continue;
    }

    const key = branch.branchCode
      ? `c:${normaliseRef(branch.branchCode)}`
      : `n:${normaliseName(branch.branchName)}`;
    const row = incomingByKey.get(key);

    if (branch.status === "new") {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        customer_id: customerId,
        branch_name: branch.branchName,
        branch_code: branch.branchCode,
      };
      for (const field of BRANCH_FIELDS) {
        const value = clean((row as unknown as Record<string, unknown> | undefined)?.[field.key]);
        if (value) payload[field.column] = value;
      }
      const { data, error } = await supabase
        .from("vyron_customer_branches")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(`${branch.branchName}: ${error.message}`);
      createdBranchIds.push(String((data as { id: string }).id));
      result.branchesCreated += 1;
      continue;
    }

    if (!branch.changes.length) {
      result.branchesUnchanged += 1;
      continue;
    }

    const patch: Record<string, unknown> = {};
    for (const change of branch.changes) patch[change.field] = change.to;
    const { error } = await supabase
      .from("vyron_customer_branches")
      .update(patch)
      .eq("id", branch.matchedBranchId)
      .eq("company_id", companyId);
    if (error) throw new Error(`${branch.branchName}: ${error.message}`);
    result.branchesUpdated += 1;
  }
}

export async function applyCustomerImportPlan(
  supabase: SupabaseClient,
  companyId: string,
  plan: CustomerImportPlan,
  options: { newCustomerId?: () => string } = {}
): Promise<ApplyResult> {
  const newId = options.newCustomerId ?? (() => globalThis.crypto.randomUUID());
  const result: ApplyResult = {
    created: 0,
    updated: 0,
    branchesCreated: 0,
    branchesUpdated: 0,
    branchesUnchanged: 0,
    branchesAmbiguous: 0,
    unchanged: 0,
    conflicts: 0,
    ambiguous: 0,
    errors: [],
    createdIds: [],
  };
  const createdBranchIds: string[] = [];

  try {
    for (const row of plan.rows) {
      if (row.status === "ambiguous") {
        result.ambiguous += 1;
        continue;
      }

      if (row.status === "new") {
        const id = newId();
        const payload: Record<string, unknown> = {
          id,
          company_id: companyId,
          customer_name: clean(row.incoming.customer_name),
        };
        for (const field of MERGEABLE_FIELDS) {
          const value = clean((row.incoming as Record<string, unknown>)[field]);
          if (value) payload[field] = value;
        }
        const { error } = await supabase.from("vyron_customers").insert(payload);
        if (error) throw new Error(`${payload.customer_name}: ${error.message}`);
        result.createdIds.push(id);
        result.created += 1;
        await applyBranchPlan(supabase, companyId, id, row.branches, result, createdBranchIds, branchRowsFor(row));
        continue;
      }

      if (row.status === "conflict") result.conflicts += 1;

      await applyBranchPlan(
        supabase,
        companyId,
        String(row.matchedCustomerId),
        row.branches,
        result,
        createdBranchIds,
        branchRowsFor(row)
      );

      if (!row.changes.length) {
        result.unchanged += 1;
        continue;
      }

      const patch: Record<string, unknown> = {};
      for (const change of row.changes) patch[change.field] = change.to;
      const { error } = await supabase
        .from("vyron_customers")
        .update(patch)
        .eq("id", row.matchedCustomerId)
        .eq("company_id", companyId);
      if (error) throw new Error(`${row.matchedCustomerName}: ${error.message}`);
      result.updated += 1;
    }
  } catch (error) {
    // Branches first: a customer cannot be removed while one still points at it.
    if (createdBranchIds.length) {
      await supabase
        .from("vyron_customer_branches")
        .delete()
        .in("id", createdBranchIds)
        .eq("company_id", companyId);
    }
    if (result.createdIds.length) {
      await supabase
        .from("vyron_customers")
        .delete()
        .in("id", result.createdIds)
        .eq("company_id", companyId);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  return result;
}
