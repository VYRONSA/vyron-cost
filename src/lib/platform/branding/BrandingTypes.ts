export type BrandingPalette = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  darkTextColor: string;
  lightTextColor: string;
  headerBackground: string;
  footerBackground: string;
};

export type LogoPosition =
  | "top_left"
  | "top_center"
  | "top_right"
  | "full_width_header"
  | "watermark"
  | "footer"
  | "custom";

export type LogoSizePreset = "small" | "medium" | "large" | "custom";

export type CompanyBranding = {
  workspaceId: string | null;
  companyId: string | null;
  companyName: string;
  tradingName: string | null;
  logoUrl: string | null;
  logoDataUrl: string | null;
  logoPosition: LogoPosition;
  logoPositionX: number | null;
  logoPositionY: number | null;
  logoSizePreset: LogoSizePreset;
  logoWidth: number | null;
  logoHeight: number | null;
  logoMaintainAspectRatio: boolean;
  palette: BrandingPalette;
  physicalAddress: string | null;
  postalAddress: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  postalCode: string | null;
  telephone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  licenseNumber: string | null;
  footerText: string | null;
  termsAndConditions: string | null;
  authorisationFooterText: string | null;
};

export type BrandingUpdateInput = Partial<{
  companyName: string;
  tradingName: string;
  logoUrl: string;
  logoPosition: LogoPosition;
  logoPositionX: number | null;
  logoPositionY: number | null;
  logoSizePreset: LogoSizePreset;
  logoWidth: number | null;
  logoHeight: number | null;
  logoMaintainAspectRatio: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  darkTextColor: string;
  lightTextColor: string;
  headerBackground: string;
  footerBackground: string;
  physicalAddress: string;
  postalAddress: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  telephone: string;
  mobile: string;
  email: string;
  website: string;
  vatNumber: string;
  registrationNumber: string;
  taxNumber: string;
  licenseNumber: string;
  footerText: string;
  termsAndConditions: string;
  authorisationFooterText: string;
}>;
