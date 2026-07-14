import fs from "node:fs";
import path from "node:path";
import { BrandingRepository } from "@/lib/platform/branding/BrandingRepository";
import type { BrandingUpdateInput, CompanyBranding } from "@/lib/platform/branding/BrandingTypes";

function extensionToMime(ext: string) {
  const lower = ext.toLowerCase();
  if (lower === ".png") return "image/png";
  if (lower === ".svg") return "image/svg+xml";
  if (lower === ".jpg" || lower === ".jpeg") return "image/jpeg";
  return null;
}

async function resolveLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:")) return logoUrl;

  try {
    if (logoUrl.startsWith("/")) {
      const relative = logoUrl.replace(/^\/+/, "");
      const filePath = path.join(process.cwd(), "public", relative);
      if (!fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath);
      const mime = extensionToMime(ext);
      if (!mime) return null;
      const bytes = fs.readFileSync(filePath);
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }

    if (/^https?:\/\//i.test(logoUrl)) {
      const response = await fetch(logoUrl, { cache: "no-store" });
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("image/png") && !contentType.includes("image/jpeg") && !contentType.includes("image/svg")) {
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
    }
  } catch {
    return null;
  }

  return null;
}

export class BrandingService {
  static async getBranding(input: { workspaceId?: string | null; companyId?: string | null }): Promise<CompanyBranding> {
    if (input.workspaceId) return this.getBrandingByWorkspaceId(input.workspaceId);
    if (input.companyId) return this.getBrandingByCompanyId(input.companyId);
    throw new Error("workspaceId or companyId is required.");
  }

  static async getBrandingByWorkspaceId(workspaceId: string): Promise<CompanyBranding> {
    const branding = await BrandingRepository.getByWorkspaceId(workspaceId);
    return {
      ...branding,
      logoDataUrl: await resolveLogoDataUrl(branding.logoUrl),
    };
  }

  static async getBrandingByCompanyId(companyId: string): Promise<CompanyBranding> {
    const branding = await BrandingRepository.getByCompanyId(companyId);
    return {
      ...branding,
      logoDataUrl: await resolveLogoDataUrl(branding.logoUrl),
    };
  }

  static async updateBrandingByWorkspaceId(workspaceId: string, input: BrandingUpdateInput): Promise<CompanyBranding> {
    const branding = await BrandingRepository.updateByWorkspaceId(workspaceId, input);
    return {
      ...branding,
      logoDataUrl: await resolveLogoDataUrl(branding.logoUrl),
    };
  }
}
