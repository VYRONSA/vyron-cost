import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import type { BrandingUpdateInput, CompanyBranding, LogoPosition, LogoSizePreset } from "@/lib/platform/branding/BrandingTypes";

const LOGO_POSITIONS: LogoPosition[] = [
  "top_left",
  "top_center",
  "top_right",
  "full_width_header",
  "watermark",
  "footer",
  "custom",
];
const LOGO_SIZE_PRESETS: LogoSizePreset[] = ["small", "medium", "large", "custom"];

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

function pickNumber(source: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: string[], fallback: boolean): boolean {
  if (!source) return fallback;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

function pickEnum<T extends string>(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
  allowed: T[],
  fallback: T
): T {
  const raw = pickString(source, keys);
  return raw && (allowed as string[]).includes(raw) ? (raw as T) : fallback;
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
    logoPosition: "top_left",
    logoPositionX: null,
    logoPositionY: null,
    logoSizePreset: "medium",
    logoWidth: null,
    logoHeight: null,
    logoMaintainAspectRatio: true,
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
    footerText: null,
    termsAndConditions: null,
    authorisationFooterText: null,
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
    logoPosition: pickEnum(company, ["logo_position"], LOGO_POSITIONS, base.logoPosition),
    logoPositionX: pickNumber(company, ["logo_position_x"]),
    logoPositionY: pickNumber(company, ["logo_position_y"]),
    logoSizePreset: pickEnum(company, ["logo_size_preset"], LOGO_SIZE_PRESETS, base.logoSizePreset),
    logoWidth: pickNumber(company, ["logo_width"]),
    logoHeight: pickNumber(company, ["logo_height"]),
    logoMaintainAspectRatio: pickBoolean(company, ["logo_maintain_aspect_ratio"], true),
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
    footerText: pickString(company, ["footer_text"]),
    termsAndConditions: pickString(company, ["terms_and_conditions"]),
    authorisationFooterText: pickString(company, ["authorisation_footer_text"]),
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
      ...(input.companyName !== undefined ? { company_name: nullOrTrim(input.companyName) } : {}),
      ...(input.tradingName !== undefined ? { trading_name: nullOrTrim(input.tradingName) } : {}),
      ...(input.vatNumber !== undefined ? { vat_number: nullOrTrim(input.vatNumber) } : {}),
      ...(input.registrationNumber !== undefined ? { registration_number: nullOrTrim(input.registrationNumber) } : {}),
      ...(input.email !== undefined ? { contact_email: nullOrTrim(input.email) } : {}),
      ...(input.telephone !== undefined ? { phone: nullOrTrim(input.telephone) } : {}),
      ...(input.physicalAddress !== undefined ? { physical_address: nullOrTrim(input.physicalAddress) } : {}),
      ...(input.postalAddress !== undefined ? { postal_address: nullOrTrim(input.postalAddress) } : {}),
      updated_at: new Date().toISOString(),
    });

    if (Object.keys(workspacePayload).length) {
      const { error } = await supabase.from("vyron_workspaces").update(workspacePayload).eq("id", workspaceId);
      if (error) throw new Error(error.message);
    }

    if (companyId) {
      // Only fields the caller actually provided are written — omitted fields must not be
      // reset to null, since callers like the logo upload route send a single field (e.g.
      // { logoUrl }) and updating the row must never blank out unrelated required columns.
      const companyPayload = filterPayloadByKnownColumns(company, {
        ...(input.companyName !== undefined ? { name: nullOrTrim(input.companyName) } : {}),
        ...(input.tradingName !== undefined ? { trading_name: nullOrTrim(input.tradingName) } : {}),
        ...(input.logoUrl !== undefined ? { logo_url: nullOrTrim(input.logoUrl) } : {}),
        ...(input.logoPosition !== undefined ? { logo_position: input.logoPosition } : {}),
        ...(input.logoPositionX !== undefined ? { logo_position_x: input.logoPositionX } : {}),
        ...(input.logoPositionY !== undefined ? { logo_position_y: input.logoPositionY } : {}),
        ...(input.logoSizePreset !== undefined ? { logo_size_preset: input.logoSizePreset } : {}),
        ...(input.logoWidth !== undefined ? { logo_width: input.logoWidth } : {}),
        ...(input.logoHeight !== undefined ? { logo_height: input.logoHeight } : {}),
        ...(input.logoMaintainAspectRatio !== undefined
          ? { logo_maintain_aspect_ratio: input.logoMaintainAspectRatio }
          : {}),
        ...(input.primaryColor !== undefined ? { primary_color: nullOrTrim(input.primaryColor) } : {}),
        ...(input.secondaryColor !== undefined ? { secondary_color: nullOrTrim(input.secondaryColor) } : {}),
        ...(input.accentColor !== undefined ? { accent_color: nullOrTrim(input.accentColor) } : {}),
        ...(input.darkTextColor !== undefined ? { dark_text_color: nullOrTrim(input.darkTextColor) } : {}),
        ...(input.lightTextColor !== undefined ? { light_text_color: nullOrTrim(input.lightTextColor) } : {}),
        ...(input.headerBackground !== undefined
          ? { header_background_color: nullOrTrim(input.headerBackground) }
          : {}),
        ...(input.footerBackground !== undefined
          ? { footer_background_color: nullOrTrim(input.footerBackground) }
          : {}),
        ...(input.physicalAddress !== undefined ? { physical_address: nullOrTrim(input.physicalAddress) } : {}),
        ...(input.postalAddress !== undefined ? { postal_address: nullOrTrim(input.postalAddress) } : {}),
        ...(input.city !== undefined ? { city: nullOrTrim(input.city) } : {}),
        ...(input.province !== undefined ? { province: nullOrTrim(input.province) } : {}),
        ...(input.country !== undefined ? { country: nullOrTrim(input.country) } : {}),
        ...(input.postalCode !== undefined ? { postal_code: nullOrTrim(input.postalCode) } : {}),
        ...(input.telephone !== undefined ? { phone: nullOrTrim(input.telephone) } : {}),
        ...(input.mobile !== undefined ? { mobile: nullOrTrim(input.mobile) } : {}),
        ...(input.email !== undefined ? { contact_email: nullOrTrim(input.email) } : {}),
        ...(input.website !== undefined ? { website: nullOrTrim(input.website) } : {}),
        ...(input.vatNumber !== undefined ? { vat_number: nullOrTrim(input.vatNumber) } : {}),
        ...(input.registrationNumber !== undefined
          ? { registration_number: nullOrTrim(input.registrationNumber) }
          : {}),
        ...(input.taxNumber !== undefined ? { tax_number: nullOrTrim(input.taxNumber) } : {}),
        ...(input.licenseNumber !== undefined ? { license_number: nullOrTrim(input.licenseNumber) } : {}),
        ...(input.footerText !== undefined ? { footer_text: nullOrTrim(input.footerText) } : {}),
        ...(input.termsAndConditions !== undefined
          ? { terms_and_conditions: nullOrTrim(input.termsAndConditions) }
          : {}),
        ...(input.authorisationFooterText !== undefined
          ? { authorisation_footer_text: nullOrTrim(input.authorisationFooterText) }
          : {}),
        updated_at: new Date().toISOString(),
      });

      if (Object.keys(companyPayload).length) {
        const { error } = await supabase.from("vyron_cost_companies").update(companyPayload).eq("id", companyId);
        if (error) throw new Error(error.message);
      }
    }

    return this.getByWorkspaceId(workspaceId);
  }
}
