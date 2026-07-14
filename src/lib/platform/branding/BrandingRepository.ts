import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import type { BrandingUpdateInput, CompanyBranding } from "@/lib/platform/branding/BrandingTypes";

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function defaultBranding(input: { workspaceId?: string | null; companyId?: string | null }): CompanyBranding {
  return {
    workspaceId: input.workspaceId || null,
    companyId: input.companyId || null,
    companyName: "VYRON Client",
    tradingName: null,
    logoUrl: null,
    logoDataUrl: null,
    palette: {
      primaryColor: "#4338CA",
      secondaryColor: "#0F172A",
      accentColor: "#7C3AED",
      darkTextColor: "#0F172A",
      lightTextColor: "#FFFFFF",
      headerBackground: "#0F172A",
      footerBackground: "#0F172A",
    },
    physicalAddress: null,
    postalAddress: null,
    city: null,
    province: null,
    country: null,
    postalCode: null,
    telephone: null,
    mobile: null,
    email: null,
    website: null,
    vatNumber: null,
    registrationNumber: null,
    taxNumber: null,
    licenseNumber: null,
  };
}

function mapBranding(
  workspace: Record<string, unknown> | null,
  company: Record<string, unknown> | null,
  workspaceId?: string | null,
  companyId?: string | null
): CompanyBranding {
  const base = defaultBranding({ workspaceId, companyId });

  const companyName = pickString(company, ["name", "company_name", "trading_name"]) || pickString(workspace, ["company_name", "trading_name"]) || base.companyName;
  const tradingName = pickString(company, ["trading_name", "name"]) || pickString(workspace, ["trading_name"]);

  return {
    ...base,
    workspaceId: workspaceId || pickString(workspace, ["id"]),
    companyId: companyId || pickString(workspace, ["company_id"]) || pickString(company, ["id"]),
    companyName,
    tradingName,
    logoUrl: pickString(company, ["logo_url", "logo", "company_logo"]) || pickString(workspace, ["logo_url", "company_logo"]),
    palette: {
      primaryColor: pickString(company, ["primary_color", "branding_primary_color"]) || base.palette.primaryColor,
      secondaryColor: pickString(company, ["secondary_color", "branding_secondary_color"]) || base.palette.secondaryColor,
      accentColor: pickString(company, ["accent_color", "branding_accent_color"]) || base.palette.accentColor,
      darkTextColor: pickString(company, ["dark_text_color", "text_dark_color"]) || base.palette.darkTextColor,
      lightTextColor: pickString(company, ["light_text_color", "text_light_color"]) || base.palette.lightTextColor,
      headerBackground: pickString(company, ["header_background_color", "header_color"]) || base.palette.headerBackground,
      footerBackground: pickString(company, ["footer_background_color", "footer_color"]) || base.palette.footerBackground,
    },
    physicalAddress: pickString(company, ["physical_address", "address"]) || pickString(workspace, ["physical_address"]),
    postalAddress: pickString(company, ["postal_address"]) || pickString(workspace, ["postal_address"]),
    city: pickString(company, ["city"]),
    province: pickString(company, ["province", "state"]),
    country: pickString(company, ["country"]),
    postalCode: pickString(company, ["postal_code", "zip_code"]),
    telephone: pickString(company, ["phone", "telephone"]) || pickString(workspace, ["phone"]),
    mobile: pickString(company, ["mobile", "cellphone"]),
    email: pickString(company, ["contact_email", "email"]) || pickString(workspace, ["contact_email"]),
    website: pickString(company, ["website", "web_url"]),
    vatNumber: pickString(company, ["vat_number"]) || pickString(workspace, ["vat_number"]),
    registrationNumber:
      pickString(company, ["registration_number", "company_registration_number"]) ||
      pickString(workspace, ["registration_number"]),
    taxNumber: pickString(company, ["tax_number"]),
    licenseNumber: pickString(company, ["license_number"]),
  };
}

function filterPayloadByKnownColumns(
  row: Record<string, unknown> | null,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!row) return {};
  const out: Record<string, unknown> = {};
  const keys = new Set(Object.keys(row));
  for (const [key, value] of Object.entries(payload)) {
    if (keys.has(key)) out[key] = value;
  }
  return out;
}

function nullOrTrim(value: string | undefined) {
  const next = String(value || "").trim();
  return next ? next : null;
}

export class BrandingRepository {
  private static admin(): SupabaseClient | null {
    if (!isSupabaseServiceRoleConfigured()) return null;
    return getSupabaseAdmin();
  }

  static async getByWorkspaceId(workspaceId: string): Promise<CompanyBranding> {
    const supabase = this.admin();
    if (!supabase) return defaultBranding({ workspaceId, companyId: null });

    const { data: workspaceData } = await supabase.from("vyron_workspaces").select("*").eq("id", workspaceId).maybeSingle();
    const workspace = safeRecord(workspaceData);
    const companyId = pickString(workspace, ["company_id"]);

    let company: Record<string, unknown> | null = null;
    if (companyId) {
      const { data: companyData } = await supabase.from("vyron_cost_companies").select("*").eq("id", companyId).maybeSingle();
      company = safeRecord(companyData);
    }

    return mapBranding(workspace, company, workspaceId, companyId);
  }

  static async getByCompanyId(companyId: string): Promise<CompanyBranding> {
    const supabase = this.admin();
    if (!supabase) return defaultBranding({ workspaceId: null, companyId });

    const { data: companyData } = await supabase.from("vyron_cost_companies").select("*").eq("id", companyId).maybeSingle();
    const company = safeRecord(companyData);

    const { data: workspaceData } = await supabase
      .from("vyron_workspaces")
      .select("*")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();
    const workspace = safeRecord(workspaceData);

    return mapBranding(workspace, company, pickString(workspace, ["id"]), companyId);
  }

  static async updateByWorkspaceId(workspaceId: string, input: BrandingUpdateInput): Promise<CompanyBranding> {
    const supabase = this.admin();
    if (!supabase) return defaultBranding({ workspaceId, companyId: null });

    const { data: workspaceData } = await supabase.from("vyron_workspaces").select("*").eq("id", workspaceId).maybeSingle();
    const workspace = safeRecord(workspaceData);
    if (!workspace) throw new Error("Workspace not found.");

    const companyId = pickString(workspace, ["company_id"]);
    const { data: companyData } = companyId
      ? await supabase.from("vyron_cost_companies").select("*").eq("id", companyId).maybeSingle()
      : { data: null };
    const company = safeRecord(companyData);

    const workspacePayload = filterPayloadByKnownColumns(workspace, {
      company_name: nullOrTrim(input.companyName),
      trading_name: nullOrTrim(input.tradingName),
      vat_number: nullOrTrim(input.vatNumber),
      registration_number: nullOrTrim(input.registrationNumber),
      contact_email: nullOrTrim(input.email),
      phone: nullOrTrim(input.telephone),
      physical_address: nullOrTrim(input.physicalAddress),
      postal_address: nullOrTrim(input.postalAddress),
      updated_at: new Date().toISOString(),
    });

    if (Object.keys(workspacePayload).length) {
      await supabase.from("vyron_workspaces").update(workspacePayload).eq("id", workspaceId);
    }

    if (companyId) {
      const companyPayload = filterPayloadByKnownColumns(company, {
        name: nullOrTrim(input.companyName),
        trading_name: nullOrTrim(input.tradingName),
        logo_url: nullOrTrim(input.logoUrl),
        primary_color: nullOrTrim(input.primaryColor),
        secondary_color: nullOrTrim(input.secondaryColor),
        accent_color: nullOrTrim(input.accentColor),
        dark_text_color: nullOrTrim(input.darkTextColor),
        light_text_color: nullOrTrim(input.lightTextColor),
        header_background_color: nullOrTrim(input.headerBackground),
        footer_background_color: nullOrTrim(input.footerBackground),
        physical_address: nullOrTrim(input.physicalAddress),
        postal_address: nullOrTrim(input.postalAddress),
        city: nullOrTrim(input.city),
        province: nullOrTrim(input.province),
        country: nullOrTrim(input.country),
        postal_code: nullOrTrim(input.postalCode),
        phone: nullOrTrim(input.telephone),
        mobile: nullOrTrim(input.mobile),
        contact_email: nullOrTrim(input.email),
        website: nullOrTrim(input.website),
        vat_number: nullOrTrim(input.vatNumber),
        registration_number: nullOrTrim(input.registrationNumber),
        tax_number: nullOrTrim(input.taxNumber),
        license_number: nullOrTrim(input.licenseNumber),
        updated_at: new Date().toISOString(),
      });

      if (Object.keys(companyPayload).length) {
        await supabase.from("vyron_cost_companies").update(companyPayload).eq("id", companyId);
      }
    }

    return this.getByWorkspaceId(workspaceId);
  }
}
