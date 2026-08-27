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
