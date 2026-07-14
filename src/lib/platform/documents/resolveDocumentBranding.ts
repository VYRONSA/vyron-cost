import { BrandingService } from "@/lib/platform/branding/BrandingService";
import type { CompanyBranding } from "@/lib/platform/branding/BrandingTypes";
import type { DocumentPdfBranding } from "@/lib/platform/documents/vyron-document-pdf-engine";

/** Pure mapping from the Branding Designer's data model to what the Document Engine consumes. */
export function toDocumentPdfBranding(branding: CompanyBranding): DocumentPdfBranding {
  return {
    companyName: branding.companyName,
    tradingName: branding.tradingName,
    logoDataUrl: branding.logoDataUrl,
    logoPosition: branding.logoPosition,
    logoPositionX: branding.logoPositionX,
    logoPositionY: branding.logoPositionY,
    logoSizePreset: branding.logoSizePreset,
    logoWidth: branding.logoWidth,
    logoHeight: branding.logoHeight,
    logoMaintainAspectRatio: branding.logoMaintainAspectRatio,
    palette: branding.palette,
    vatNumber: branding.vatNumber,
    registrationNumber: branding.registrationNumber,
    address: [branding.physicalAddress, branding.city, branding.province, branding.postalCode, branding.country]
      .filter(Boolean)
      .join(", ") || null,
    postalAddress: branding.postalAddress,
    telephone: branding.telephone,
    email: branding.email,
    website: branding.website,
    footerText: branding.footerText,
    termsAndConditions: branding.termsAndConditions,
    authorisationFooterText: branding.authorisationFooterText,
  };
}

export async function resolveDocumentBranding(companyId: string): Promise<DocumentPdfBranding> {
  const branding = await BrandingService.getBrandingByCompanyId(companyId);
  return toDocumentPdfBranding(branding);
}
