/**
 * VYRON — Platform Entitlement Service.
 *
 * Import entitlement from here, not from the implementation file:
 *
 *   import { resolveCompanyPackage } from "@/lib/platform/entitlement";
 *
 * Documentation: docs/ARCHITECTURE/ENTITLEMENT-SERVICE.md
 */
export {
  resolveCompanyPackage,
  companyHasFeature,
  resolveProductLicence,
  SYSTEM_DEFAULT_PACKAGE,
  type CompanyPackageResolution,
  type EntitlementSource,
  type ProductLicence,
  type ResolveOptions,
} from "@/lib/platform/entitlement/EntitlementService";
