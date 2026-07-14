import { BrandingService } from "@/lib/platform/branding/BrandingService";
import type { DocumentPdfBranding } from "@/lib/platform/documents/vyron-document-pdf-engine";

export async function resolveDocumentBranding(companyId: string): Promise<DocumentPdfBranding> {
  const branding = await BrandingService.getBrandingByCompanyId(companyId);
  return {
    companyName: branding.companyName,
    tradingName: branding.tradingName,
    logoDataUrl: branding.logoDataUrl,
    vatNumber: branding.vatNumber,
    registrationNumber: branding.registrationNumber,
    address: [branding.physicalAddress, branding.city, branding.province, branding.postalCode, branding.country]
      .filter(Boolean)
      .join(", ") || null,
    postalAddress: branding.postalAddress,
    telephone: branding.telephone,
    email: branding.email,
    website: branding.website,
  };
}
