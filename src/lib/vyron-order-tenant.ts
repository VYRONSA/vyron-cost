import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * VYRON ORDER — tenant discovery.
 *
 * A customer arriving at the portal has no VYRON COST session, so the tenant
 * has to come from somewhere the customer can carry: their ordering link.
 *
 * The slug in that link identifies the TENANT and nothing else. It is public by
 * design — printed on a card, sent over WhatsApp — and it is not a credential:
 * knowing it lets you see the sign-in screen for that supplier, exactly as
 * knowing a shop's address lets you stand at the door. Every read behind it
 * still requires the customer's PIN.
 *
 * The slug never becomes the authority for a signed-in session. After sign-in
 * the tenant is read from the stored portal identity, as it always was; the
 * slug is only cross-checked against it so a link for one supplier cannot be
 * used to sign in to another.
 */

export type PortalTenant = {
  companyId: string;
  slug: string;
  displayName: string;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function normaliseSlug(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * Resolve an ordering link to a tenant.
 *
 * Returns null for an unknown slug, a disabled tenant and a malformed slug
 * alike. The caller turns all three into the same 404, so this cannot be used
 * to probe which suppliers exist.
 */
export async function resolvePortalTenant(
  supabase: SupabaseClient,
  slug: string
): Promise<PortalTenant | null> {
  const candidate = String(slug || "").trim().toLowerCase();
  if (!isValidSlug(candidate)) return null;

  const { data, error } = await supabase
    .from("vyron_customer_portal_tenants")
    .select("company_id, slug, display_name")
    .eq("slug", candidate)
    .eq("status", "Active")
    .maybeSingle();
  if (error || !data) return null;

  return {
    companyId: String(data.company_id),
    slug: String(data.slug),
    displayName: String(data.display_name),
  };
}

/** The tenant record for a company, for the staff-side access screen. */
export async function getPortalTenantForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<(PortalTenant & { status: string }) | null> {
  const { data } = await supabase
    .from("vyron_customer_portal_tenants")
    .select("company_id, slug, display_name, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  return {
    companyId: String(data.company_id),
    slug: String(data.slug),
    displayName: String(data.display_name),
    status: String(data.status),
  };
}

/**
 * Create or update a tenant's ordering link.
 *
 * Staff-side only, and scoped to the company already in context — there is no
 * company input, so this cannot mint a link pointing at another tenant.
 */
export async function setPortalTenant(
  supabase: SupabaseClient,
  companyId: string,
  input: { slug: string; displayName: string; status?: "Active" | "Disabled" }
): Promise<PortalTenant> {
  const slug = normaliseSlug(input.slug);
  if (!isValidSlug(slug)) {
    throw new Error("An ordering link must be 3 to 48 characters, using letters, numbers and hyphens.");
  }
  const displayName = String(input.displayName || "").trim();
  if (!displayName) throw new Error("Enter the name customers should see.");

  // A slug already taken by a different tenant is refused rather than moved.
  const { data: clash } = await supabase
    .from("vyron_customer_portal_tenants")
    .select("company_id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash && String(clash.company_id) !== companyId) {
    throw new Error("That ordering link is already in use.");
  }

  const { data: existing } = await supabase
    .from("vyron_customer_portal_tenants")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();

  const payload = {
    company_id: companyId,
    slug,
    display_name: displayName,
    status: input.status || "Active",
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("vyron_customer_portal_tenants")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("vyron_customer_portal_tenants").insert(payload);
    if (error) throw new Error(error.message);
  }

  return { companyId, slug, displayName };
}
