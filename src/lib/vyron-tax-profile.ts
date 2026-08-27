/**
 * Shared tax / legal profile rules for the company issuing a document and the
 * customer receiving it.
 *
 * The rules here come from the VAT Act s20(4)–(5) as published by SARS: a full
 * tax invoice must carry the supplier's name, address and VAT registration
 * number, and the recipient's name, address and VAT number *where the recipient
 * is a registered vendor*. Nothing in this file calculates VAT — it only decides
 * whether the details needed to raise a compliant invoice have been captured.
 */

export const VAT_STATUSES = ["Registered", "Not Registered", "Unknown"] as const;
export type VatStatus = (typeof VAT_STATUSES)[number];

export const VAT_STATUS_LABELS: Record<VatStatus, string> = {
  Registered: "VAT Registered",
  "Not Registered": "Not VAT Registered",
  Unknown: "Unknown — Not Provided",
};

/**
 * A stored value is only trusted if it is one of the three known states.
 * Anything else — a legacy blank, an unexpected import value — resolves to
 * Unknown rather than being guessed into a definite answer.
 */
export function normaliseVatStatus(value: unknown): VatStatus {
  const raw = String(value ?? "").trim();
  const match = VAT_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  return match ?? "Unknown";
}

/**
 * A South African VAT registration number is 10 digits and begins with 4.
 * Spaces and dashes are how people actually type them, so they are stripped
 * before checking rather than rejected.
 */
export function normaliseVatNumber(value: unknown) {
  return String(value ?? "").replace(/[\s-]/g, "").trim();
}

export function isValidSaVatNumber(value: unknown) {
  return /^4\d{9}$/.test(normaliseVatNumber(value));
}

/**
 * Returns an error message, or "" when acceptable.
 *
 * An empty VAT number is always acceptable here — a business that is not
 * registered has none, and existing records were captured before this field
 * existed. Only a number that is present and malformed is rejected.
 */
export function validateVatNumber(value: unknown) {
  const vat = normaliseVatNumber(value);
  if (!vat) return "";
  if (!isValidSaVatNumber(vat)) {
    return "A South African VAT number is 10 digits starting with 4.";
  }
  return "";
}

/**
 * Refusing to save because a VAT number is missing would lock people out of
 * their own records, so this never blocks a save. It is a warning surfaced next
 * to the field, and later the reason an invoice cannot be issued as a full tax
 * invoice.
 */
export function vatStatusWarning(status: VatStatus, vatNumber: unknown): string {
  const vat = normaliseVatNumber(vatNumber);
  if (status === "Registered" && !vat) {
    return "Marked VAT registered but no VAT number captured. A full tax invoice must show it.";
  }
  if (status === "Not Registered" && vat) {
    return "Marked not VAT registered but a VAT number is captured. One of the two is wrong.";
  }
  if (status === "Unknown" && vat) {
    return "A VAT number is captured but registration has not been confirmed. Registration is never assumed from a number alone.";
  }
  return "";
}

/** SARS thresholds, in rand, on the consideration (VAT-inclusive) for a supply. */
export const FULL_TAX_INVOICE_THRESHOLD = 5000;
export const NO_TAX_INVOICE_THRESHOLD = 50;

export type SupplierTaxIdentity = {
  companyName: string;
  vatStatus: VatStatus;
  vatNumber: string;
  physicalAddress: string;
};

export type RecipientTaxIdentity = {
  customerName: string;
  vatStatus: VatStatus;
  vatNumber: string;
  billingAddress: string;
};

/**
 * What is still missing before a compliant tax invoice can be raised at this
 * value. Read-only: this reports, it does not block anything today.
 */
export function missingTaxInvoiceDetails(
  supplier: SupplierTaxIdentity,
  recipient: RecipientTaxIdentity | null,
  consideration: number
): string[] {
  const missing: string[] = [];
  if (consideration <= NO_TAX_INVOICE_THRESHOLD) return missing;

  if (!supplier.companyName.trim()) missing.push("Supplier name");
  if (!supplier.physicalAddress.trim()) missing.push("Supplier address");
  if (supplier.vatStatus === "Registered" && !normaliseVatNumber(supplier.vatNumber)) {
    missing.push("Supplier VAT number");
  }

  // Below the threshold an abridged invoice is permitted, and s20(5) does not
  // require the recipient's name, address or VAT number at all.
  if (consideration <= FULL_TAX_INVOICE_THRESHOLD) return missing;

  if (!recipient) {
    missing.push("Recipient details");
    return missing;
  }
  if (!recipient.customerName.trim()) missing.push("Recipient name");
  if (!recipient.billingAddress.trim()) missing.push("Recipient address");
  if (recipient.vatStatus === "Registered" && !normaliseVatNumber(recipient.vatNumber)) {
    missing.push("Recipient VAT number");
  }
  return missing;
}

/* ------------------------------------------- company invoice readiness */

/**
 * The company's own tax/legal profile, as Company Setup captures it.
 *
 * This is the supplier side of SupplierTaxIdentity plus the fields Company Setup
 * is responsible for. It is deliberately the same shape the invoice validator
 * consumes, so the readiness card and the issue gate cannot drift apart.
 */
export type CompanyTaxProfile = {
  companyName: string;
  tradingName: string;
  registrationNumber: string;
  vatStatus: VatStatus;
  vatNumber: string;
  physicalAddress: string;
  defaultVatRate: number | null;
};

export type ReadinessLevel = "tax-invoice" | "invoice" | "incomplete";

/**
 * A missing item, keyed so the UI can focus the field that fixes it.
 *
 * `label` is the short headline Company Setup lists. `detail` is a complete
 * sentence that stands on its own, because the invoice issue gate surfaces it
 * verbatim as the reason an invoice was refused.
 */
export type ReadinessGap = {
  field: string;
  label: string;
  detail: string;
};

export type InvoiceReadiness = {
  level: ReadinessLevel;
  headline: string;
  explanation: string;
  gaps: ReadinessGap[];
  /** Facts worth showing once the profile is good, in display order. */
  confirmed: { label: string; value: string }[];
};

/**
 * The supplier-side requirements for issuing any invoice at all.
 *
 * THE SINGLE SOURCE OF TRUTH. validateInvoiceForIssue in vyron-invoice-tax.ts
 * calls this for its supplier checks rather than restating them, so the Company
 * Setup readiness card and the Stage 4 issue gate can never disagree about why
 * an invoice is blocked.
 */
export function supplierProfileGaps(profile: CompanyTaxProfile): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];

  if (!profile.companyName.trim()) {
    gaps.push({
      field: "companyName",
      label: "Legal company name missing",
      detail: "Your company name is not set. Add it in Company Setup before issuing invoices.",
    });
  }

  if (!profile.physicalAddress.trim()) {
    gaps.push({
      field: "physicalLine1",
      label: "Physical address missing",
      detail: "Your company's physical address is not set. A tax invoice must show it (VAT Act s20(4)).",
    });
  }

  if (profile.vatStatus === "Unknown") {
    gaps.push({
      field: "vatStatus",
      label: "VAT registration status not confirmed",
      detail:
        "Your company's VAT registration status is Unknown. Confirm whether it is a registered VAT vendor — registration is never assumed from a VAT number alone, so until this is set no tax invoice can be issued.",
    });
  }

  if (profile.vatStatus === "Registered" && !isValidSaVatNumber(profile.vatNumber)) {
    gaps.push({
      field: "vatNumber",
      label: normaliseVatNumber(profile.vatNumber) ? "VAT number is not valid" : "VAT number missing",
      detail:
        "Your company is marked VAT registered but has no valid VAT number. A tax invoice cannot be issued without it — set it in Company Setup. A South African VAT number is 10 digits starting with 4.",
    });
  }

  /*
   * A rate is not defaulted to 15 here or anywhere else. South Africa's standard
   * rate is 15% today, but a rate is a setting, and quietly assuming one would
   * put an unverified number on a tax invoice.
   */
  if (profile.defaultVatRate === null || !Number.isFinite(profile.defaultVatRate) || profile.defaultVatRate < 0) {
    gaps.push({
      field: "defaultVatRate",
      label: "Default VAT rate not set",
      detail: "No default VAT rate is configured for this company. Set it in Company Setup — a rate is never assumed.",
    });
  }

  return gaps;
}

/**
 * What this company can currently issue, and why.
 *
 * Three outcomes, matching the three VAT statuses:
 *  - Registered with a complete profile  -> tax invoices
 *  - Not Registered with a complete profile -> invoices, never tax invoices
 *  - anything incomplete, or Unknown     -> nothing can be issued
 */
export function evaluateInvoiceReadiness(profile: CompanyTaxProfile): InvoiceReadiness {
  const gaps = supplierProfileGaps(profile);

  if (gaps.length) {
    return {
      level: "incomplete",
      headline: "Invoice Setup Incomplete",
      explanation:
        "Invoices cannot be issued until the details below are captured. Nothing is assumed on your behalf.",
      gaps,
      confirmed: [],
    };
  }

  const rate = `${Number(profile.defaultVatRate).toFixed(2)}%`;

  if (profile.vatStatus === "Registered") {
    return {
      level: "tax-invoice",
      headline: "Ready to Issue Tax Invoices",
      explanation:
        "This company is a registered VAT vendor with a complete tax profile. Invoices will be issued as tax invoices, showing the VAT number below.",
      gaps: [],
      confirmed: [
        { label: "VAT Status", value: "VAT Registered" },
        { label: "VAT Number", value: normaliseVatNumber(profile.vatNumber) },
        { label: "Registration Number", value: profile.registrationNumber.trim() || "Not provided" },
        { label: "Physical Address", value: profile.physicalAddress.trim() },
        { label: "Default VAT Rate", value: rate },
      ],
    };
  }

  return {
    level: "invoice",
    headline: "Ready to Issue Invoices",
    explanation:
      "This company is not registered for VAT, so documents will be issued as invoices, not tax invoices. No VAT is charged and no VAT number is presented on them.",
    gaps: [],
    confirmed: [
      { label: "VAT Status", value: "Not VAT Registered" },
      { label: "Registration Number", value: profile.registrationNumber.trim() || "Not provided" },
      { label: "Physical Address", value: profile.physicalAddress.trim() },
    ],
  };
}

/* ----------------------------------------------------------- addresses */

export type StructuredAddress = {
  line1: string;
  line2: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export const EMPTY_ADDRESS: StructuredAddress = {
  line1: "",
  line2: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
};

export function addressHasContent(address: StructuredAddress) {
  return Object.values(address).some((part) => String(part || "").trim());
}

/**
 * Compose the parts into the single canonical address string invoices read.
 *
 * City and postal code share a line, the way a South African address is written.
 * Empty parts are dropped rather than leaving stray commas.
 */
export function composeAddress(address: StructuredAddress): string {
  const cityLine = [address.city, address.postalCode].map((p) => String(p || "").trim()).filter(Boolean).join(" ");
  return [address.line1, address.line2, address.suburb, cityLine, address.province, address.country]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
}
