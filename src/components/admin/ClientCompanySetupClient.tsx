"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceCompanyProfile } from "@/lib/vyron-saas-workspace";
import { useAdminPermissions } from "@/hooks/useModulePermissions";
import { VYRON_BTN } from "@/components/vyron-ui";
import type { CompanyBranding, LogoPosition, LogoSizePreset } from "@/lib/platform/branding";
import LogoUploadCard, { type LogoToast } from "@/components/admin/LogoUploadCard";
import { PREVIEW_DOCUMENT_TYPES, type PreviewDocumentType } from "@/lib/platform/documents/buildPreviewDocumentModel";
import {
  EMPTY_ADDRESS,
  VAT_STATUSES,
  VAT_STATUS_LABELS,
  composeAddress,
  evaluateInvoiceReadiness,
  validateVatNumber,
  vatStatusWarning,
  type StructuredAddress,
} from "@/lib/vyron-tax-profile";

// min-h-[44px] keeps every control at a comfortable touch target on a phone.
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-xl border bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const LOGO_POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: "top_left", label: "Top Left" },
  { value: "top_center", label: "Top Centre" },
  { value: "top_right", label: "Top Right" },
  { value: "full_width_header", label: "Full Width Header" },
  { value: "watermark", label: "Watermark" },
  { value: "footer", label: "Footer" },
  { value: "custom", label: "Custom Position" },
];

const LOGO_SIZES: { value: LogoSizePreset; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "custom", label: "Custom Width / Height" },
];

const emptyProfile: WorkspaceCompanyProfile = {
  workspaceId: "",
  companyName: "",
  tradingName: "",
  vatNumber: "",
  registrationNumber: "",
  contactEmail: "",
  phone: "",
  physicalAddress: "",
  postalAddress: "",
  defaultVatRate: 15,
  vatStatus: "Unknown",
  incomeTaxNumber: "",
  website: "",
  remittanceEmail: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankBranchCode: "",
  bankAccountType: "",
  bankPaymentReference: "",
  physical: { ...EMPTY_ADDRESS },
  postal: { ...EMPTY_ADDRESS },
  xeroStatus: "Not Connected",
  packageName: "Professional",
  userLimit: 5,
  activeModules: [],
  status: "Setup",
};

/**
 * Accepts an empty address — not every company supplies one — and rejects only a
 * value that is present and cannot be an address.
 */
function emailProblem(value: string, label: string): string {
  const email = String(value || "").trim();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "" : `${label} is not a valid email address.`;
}

const ADDRESS_FIELDS: { key: keyof StructuredAddress; label: string; wide?: boolean }[] = [
  { key: "line1", label: "Address Line 1", wide: true },
  { key: "line2", label: "Address Line 2", wide: true },
  { key: "suburb", label: "Suburb" },
  { key: "city", label: "City" },
  { key: "province", label: "Province" },
  { key: "postalCode", label: "Postal Code" },
  { key: "country", label: "Country" },
];

export default function ClientCompanySetupClient() {
  const { canCompany } = useAdminPermissions();
  const [profile, setProfile] = useState<WorkspaceCompanyProfile>(emptyProfile);
  /*
   * "Same as physical" copies into the postal fields in local state only. What
   * was there is stashed so unticking restores it, and nothing reaches the
   * database until the user actually saves.
   */
  const [postalSameAsPhysical, setPostalSameAsPhysical] = useState(false);
  const [stashedPostal, setStashedPostal] = useState<StructuredAddress | null>(null);
  const [branding, setBranding] = useState<CompanyBranding>({
    workspaceId: null,
    companyId: null,
    companyName: "",
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
      accentColor: "#1D6BFF",
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
  });
  const [message, setMessage] = useState<string | null>(null);
  const [brandingMessage, setBrandingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [toast, setToast] = useState<LogoToast | null>(null);
  const [previewType, setPreviewType] = useState<PreviewDocumentType>("purchase_order");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(next: LogoToast) {
    setToast(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

  // Reuses the existing branding preview route (PDF renderer) — no new preview implementation.
  const runPreview = useCallback(async (type: PreviewDocumentType, current: CompanyBranding) => {
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/workspace/admin/company/branding/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: type,
          branding: {
            companyName: current.companyName,
            tradingName: current.tradingName,
            logoUrl: current.logoUrl,
            logoPosition: current.logoPosition,
            logoPositionX: current.logoPositionX,
            logoPositionY: current.logoPositionY,
            logoSizePreset: current.logoSizePreset,
            logoWidth: current.logoWidth,
            logoHeight: current.logoHeight,
            logoMaintainAspectRatio: current.logoMaintainAspectRatio,
            primaryColor: current.palette.primaryColor,
            secondaryColor: current.palette.secondaryColor,
            accentColor: current.palette.accentColor,
            darkTextColor: current.palette.darkTextColor,
            lightTextColor: current.palette.lightTextColor,
            headerBackground: current.palette.headerBackground,
            footerBackground: current.palette.footerBackground,
            physicalAddress: current.physicalAddress,
            postalAddress: current.postalAddress,
            telephone: current.telephone,
            email: current.email,
            website: current.website,
            vatNumber: current.vatNumber,
            registrationNumber: current.registrationNumber,
            footerText: current.footerText,
            termsAndConditions: current.termsAndConditions,
            authorisationFooterText: current.authorisationFooterText,
          },
        }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => void runPreview(previewType, branding), 400);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding, previewType, loading]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/workspace/admin/company").then((res) => res.json()),
      fetch("/api/workspace/admin/company/branding").then((res) => res.json()),
    ])
      .then(([companyData, brandingData]) => {
        if (companyData.ok) setProfile(companyData.profile);
        else setMessage(companyData.error || "Failed to load company profile.");

        if (brandingData.ok) setBranding(brandingData.branding as CompanyBranding);
        else setBrandingMessage(brandingData.error || "Failed to load branding profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!canCompany) {
      setMessage("You do not have permission to edit company setup.");
      return;
    }
    /*
     * No PATCH is sent while client-side validation fails. The server validates
     * again and remains the authority — this only avoids a round trip that is
     * certain to be refused, and keeps the message next to the field.
     */
    const vatError = validateVatNumber(profile.vatNumber);
    if (vatError) {
      setMessage(vatError);
      return;
    }
    const emailError =
      emailProblem(profile.contactEmail, "Contact email") || emailProblem(profile.remittanceEmail, "Remittance email");
    if (emailError) {
      setMessage(emailError);
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/workspace/admin/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: profile.companyName,
        tradingName: profile.tradingName,
        vatNumber: profile.vatNumber,
        registrationNumber: profile.registrationNumber,
        contactEmail: profile.contactEmail,
        phone: profile.phone,
        physicalAddress: profile.physicalAddress,
        postalAddress: profile.postalAddress,
        defaultVatRate: profile.defaultVatRate,
        vatStatus: profile.vatStatus,
        incomeTaxNumber: profile.incomeTaxNumber,
        website: profile.website,
        remittanceEmail: profile.remittanceEmail,
        bankName: profile.bankName,
        bankAccountName: profile.bankAccountName,
        bankAccountNumber: profile.bankAccountNumber,
        bankBranchCode: profile.bankBranchCode,
        bankAccountType: profile.bankAccountType,
        bankPaymentReference: profile.bankPaymentReference,
        physical: profile.physical,
        postal: profile.postal,
      }),
    });
    const data = await res.json();
    setSaving(false);
    setMessage(data.ok ? "Company details saved." : data.error || "Save failed.");
    if (data.ok) setProfile(data.profile);
  }

  async function saveBranding() {
    if (!canCompany) {
      setBrandingMessage("You do not have permission to edit company branding.");
      return;
    }

    setBrandingSaving(true);
    setBrandingMessage(null);
    const res = await fetch("/api/workspace/admin/company/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: branding.companyName,
        tradingName: branding.tradingName,
        logoUrl: branding.logoUrl,
        logoPosition: branding.logoPosition,
        logoPositionX: branding.logoPositionX,
        logoPositionY: branding.logoPositionY,
        logoSizePreset: branding.logoSizePreset,
        logoWidth: branding.logoWidth,
        logoHeight: branding.logoHeight,
        logoMaintainAspectRatio: branding.logoMaintainAspectRatio,
        primaryColor: branding.palette.primaryColor,
        secondaryColor: branding.palette.secondaryColor,
        accentColor: branding.palette.accentColor,
        darkTextColor: branding.palette.darkTextColor,
        lightTextColor: branding.palette.lightTextColor,
        headerBackground: branding.palette.headerBackground,
        footerBackground: branding.palette.footerBackground,
        physicalAddress: branding.physicalAddress,
        postalAddress: branding.postalAddress,
        city: branding.city,
        province: branding.province,
        country: branding.country,
        postalCode: branding.postalCode,
        telephone: branding.telephone,
        mobile: branding.mobile,
        email: branding.email,
        website: branding.website,
        vatNumber: branding.vatNumber,
        registrationNumber: branding.registrationNumber,
        taxNumber: branding.taxNumber,
        licenseNumber: branding.licenseNumber,
      }),
    });

    const data = await res.json();
    setBrandingSaving(false);
    setBrandingMessage(data.ok ? "Branding details saved." : data.error || "Branding save failed.");
    if (data.ok) setBranding(data.branding as CompanyBranding);
  }

  /*
   * The readiness card and the Stage 4 invoice issue gate call the same function,
   * so what this screen says is missing is exactly what will block an invoice.
   */
  const readiness = useMemo(
    () =>
      evaluateInvoiceReadiness({
        companyName: profile.companyName,
        tradingName: profile.tradingName,
        registrationNumber: profile.registrationNumber,
        vatStatus: profile.vatStatus,
        vatNumber: profile.vatNumber,
        // Reflects what is on screen now, including edits not yet saved.
        physicalAddress: composeAddress(profile.physical) || profile.physicalAddress,
        defaultVatRate: profile.defaultVatRate,
      }),
    [profile]
  );

  function patchAddress(which: "physical" | "postal", key: keyof StructuredAddress, value: string) {
    setProfile((current) => {
      const next = { ...current, [which]: { ...current[which], [key]: value } };
      // While the boxes are ticked the postal address tracks the physical one.
      if (which === "physical" && postalSameAsPhysical) next.postal = { ...next.physical };
      return next;
    });
  }

  function togglePostalSame(checked: boolean) {
    setPostalSameAsPhysical(checked);
    if (checked) {
      setStashedPostal(profile.postal);
      setProfile((current) => ({ ...current, postal: { ...current.physical } }));
      return;
    }
    // Nothing was persisted, so the previous postal address comes straight back.
    if (stashedPostal) setProfile((current) => ({ ...current, postal: stashedPostal }));
    setStashedPostal(null);
  }

  function focusField(field: string) {
    const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  if (loading) return <div className="text-sm font-semibold text-slate-500">Loading company profile…</div>;

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          role="status"
          className={`fixed right-6 top-6 z-50 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-xl ${
            toast.type === "success" ? "bg-violet-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-bold text-[var(--vyron-success-fg)]">
          {message}
        </div>
      ) : null}

      {brandingMessage ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
          {brandingMessage}
        </div>
      ) : null}

      <section
        role="status"
        className={`rounded-[2rem] border p-6 shadow-sm ${
          readiness.level === "tax-invoice"
            ? "border-emerald-200 bg-emerald-50"
            : readiness.level === "invoice"
              ? "border-sky-200 bg-sky-50"
              : "border-amber-300 bg-amber-50"
        }`}
      >
        <div className="flex flex-wrap items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            {readiness.level === "tax-invoice" ? "\u{1F7E2}" : readiness.level === "invoice" ? "\u{1F535}" : "\u{1F7E0}"}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className={`text-lg font-black ${
                readiness.level === "tax-invoice"
                  ? "text-emerald-900"
                  : readiness.level === "invoice"
                    ? "text-sky-900"
                    : "text-amber-900"
              }`}
            >
              {readiness.headline}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">{readiness.explanation}</p>

            {readiness.gaps.length ? (
              <ul className="mt-4 space-y-2">
                {readiness.gaps.map((gap) => (
                  <li key={gap.field}>
                    <button
                      type="button"
                      onClick={() => focusField(gap.field)}
                      className="w-full min-h-[44px] rounded-2xl border border-amber-300 bg-white px-4 py-3 text-left transition hover:border-amber-500"
                    >
                      <span className="block text-sm font-black text-amber-900">{gap.label}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-slate-600">{gap.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {readiness.confirmed.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white bg-white/70 px-4 py-3">
                    <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{item.label}</dt>
                    <dd className="mt-1 whitespace-pre-line text-sm font-bold text-slate-900">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-black text-slate-950">Tax &amp; Legal Profile</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Company identity as it appears on invoices and to SARS.
          </p>
        </div>
        <Field label="Legal Company Name" dataField="companyName" value={profile.companyName} onChange={(v) => setProfile((p) => ({ ...p, companyName: v }))} hint="The registered name of the legal entity." />
        <Field label="Trading Name" dataField="tradingName" value={profile.tradingName} onChange={(v) => setProfile((p) => ({ ...p, tradingName: v }))} hint="Only where it differs from the legal name." />
        <Field
          label="Company Registration Number"
          dataField="registrationNumber"
          value={profile.registrationNumber}
          onChange={(v) => setProfile((p) => ({ ...p, registrationNumber: v }))}
          hint="Business identification. Not a SARS tax-invoice requirement."
        />
        <Field
          label="Income Tax Number"
          dataField="incomeTaxNumber"
          value={profile.incomeTaxNumber}
          onChange={(v) => setProfile((p) => ({ ...p, incomeTaxNumber: v }))}
          hint="Business identification. Not a SARS tax-invoice requirement."
        />
        <Field label="Website" dataField="website" value={profile.website} onChange={(v) => setProfile((p) => ({ ...p, website: v }))} className="md:col-span-2" />
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-black text-slate-950">VAT</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Registration is never inferred from a VAT number, and no rate is assumed.
          </p>
        </div>
        <SelectField
          label="VAT Registration Status"
          dataField="vatStatus"
          value={profile.vatStatus}
          options={VAT_STATUSES.map((status) => ({ value: status, label: VAT_STATUS_LABELS[status] }))}
          onChange={(v) => setProfile((p) => ({ ...p, vatStatus: v as typeof p.vatStatus }))}
          hint="Unknown means no tax invoice can be issued."
        />
        <Field
          label="VAT Number"
          dataField="vatNumber"
          value={profile.vatNumber}
          onChange={(v) => setProfile((p) => ({ ...p, vatNumber: v }))}
          error={validateVatNumber(profile.vatNumber)}
          warning={vatStatusWarning(profile.vatStatus, profile.vatNumber)}
          hint="Required on a tax invoice — VAT Act s20(4)."
        />
        <Field
          label="Default VAT Rate (%)"
          dataField="defaultVatRate"
          value={profile.defaultVatRate === null ? "" : String(profile.defaultVatRate)}
          onChange={(v) => setProfile((p) => ({ ...p, defaultVatRate: v.trim() === "" ? null : Number(v) }))}
          type="number"
          hint="The rate this company charges. Not defaulted for you."
        />
        {profile.vatStatus === "Not Registered" && profile.vatNumber.trim() ? (
          <p className="md:col-span-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-900">
            This company is marked not VAT registered, so the number above will not be presented as an active VAT
            number on any invoice.
          </p>
        ) : null}
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-black text-slate-950">Physical Address</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Printed on every tax invoice — VAT Act s20(4).
          </p>
        </div>
        {ADDRESS_FIELDS.map((field) => (
          <Field
            key={`physical-${field.key}`}
            label={field.label}
            dataField={field.key === "line1" ? "physicalLine1" : undefined}
            value={profile.physical[field.key]}
            onChange={(v) => patchAddress("physical", field.key, v)}
            className={field.wide ? "md:col-span-2" : undefined}
          />
        ))}
        {profile.physicalAddress && !composeAddress(profile.physical) ? (
          <div className="md:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Currently on invoices
            </span>
            <p className="mt-2 whitespace-pre-line rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
              {profile.physicalAddress}
            </p>
            <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">
              Captured before this form had separate fields. Fill the fields above to replace it; it is kept until you do.
            </span>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-black text-slate-950">Postal Address</h2>
          <label className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-2.5">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={postalSameAsPhysical}
              onChange={(e) => togglePostalSame(e.target.checked)}
            />
            <span className="text-sm font-black text-slate-700">Same as physical address</span>
          </label>
          {postalSameAsPhysical ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Copied on screen only. Nothing is written until you save, and unticking restores what was there.
            </p>
          ) : null}
        </div>
        {ADDRESS_FIELDS.map((field) => (
          <Field
            key={`postal-${field.key}`}
            label={field.label}
            value={profile.postal[field.key]}
            onChange={(v) => patchAddress("postal", field.key, v)}
            className={field.wide ? "md:col-span-2" : undefined}
            disabled={postalSameAsPhysical}
          />
        ))}
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-black text-slate-950">Contact Details</h2>
        </div>
        <Field label="Phone" dataField="phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} />
        <Field
          label="Contact Email"
          dataField="contactEmail"
          value={profile.contactEmail}
          onChange={(v) => setProfile((p) => ({ ...p, contactEmail: v }))}
          error={emailProblem(profile.contactEmail, "Contact email")}
        />
        <Field
          label="Remittance Email"
          dataField="remittanceEmail"
          value={profile.remittanceEmail}
          onChange={(v) => setProfile((p) => ({ ...p, remittanceEmail: v }))}
          error={emailProblem(profile.remittanceEmail, "Remittance email")}
          hint="Where customers send proof of payment."
          className="md:col-span-2"
        />
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-3">
        <ReadOnlyField label="Xero Status" value={profile.xeroStatus} />
        <ReadOnlyField label="Package" value={profile.packageName} />
        <ReadOnlyField label="User Limit" value={String(profile.userLimit)} />
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-black text-slate-950">Banking Details</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Printed on invoices so customers know where to pay. SARS does not require these on a tax invoice, and they
            are shown nowhere else in VYRON COST.
          </p>
        </div>
        <Field label="Bank Name" value={profile.bankName} onChange={(v) => setProfile((p) => ({ ...p, bankName: v }))} />
        <Field label="Account Name" value={profile.bankAccountName} onChange={(v) => setProfile((p) => ({ ...p, bankAccountName: v }))} />
        <Field label="Account Number" value={profile.bankAccountNumber} onChange={(v) => setProfile((p) => ({ ...p, bankAccountNumber: v }))} />
        <Field label="Branch Code" value={profile.bankBranchCode} onChange={(v) => setProfile((p) => ({ ...p, bankBranchCode: v }))} />
        <Field label="Account Type" value={profile.bankAccountType} onChange={(v) => setProfile((p) => ({ ...p, bankAccountType: v }))} />
        <Field
          label="Payment / Reference Instructions"
          value={profile.bankPaymentReference}
          onChange={(v) => setProfile((p) => ({ ...p, bankPaymentReference: v }))}
          className="md:col-span-2"
          hint="Shown with the banking block on an invoice, e.g. what reference to quote."
        />
      </section>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Active Modules</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Modules included in your package. Contact VYRON to upgrade.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.activeModules.map((module) => (
            <span key={module} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">
              {module}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-black text-slate-950">Company Branding</h2>

        <LogoUploadCard branding={branding} canEdit={canCompany} onBrandingChange={setBranding} onToast={showToast} />

        <div className="md:col-span-2">
          <h3 className="text-sm font-black text-slate-950">Brand Studio</h3>

          <div className="mt-3">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Logo Position</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LOGO_POSITIONS.map((pos) => (
                <label
                  key={pos.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                    branding.logoPosition === pos.value
                      ? "border-violet-400 bg-violet-50 text-violet-900"
                      : "border-violet-100 text-slate-600 hover:border-violet-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="logoPosition"
                    disabled={!canCompany}
                    checked={branding.logoPosition === pos.value}
                    onChange={() => setBranding((b) => ({ ...b, logoPosition: pos.value }))}
                    className="accent-violet-600"
                  />
                  {pos.label}
                </label>
              ))}
            </div>
          </div>

          {branding.logoPosition === "custom" ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field
                label="Position X (mm)"
                type="number"
                value={branding.logoPositionX == null ? "" : String(branding.logoPositionX)}
                onChange={(v) => setBranding((b) => ({ ...b, logoPositionX: v ? Number(v) : null }))}
              />
              <Field
                label="Position Y (mm)"
                type="number"
                value={branding.logoPositionY == null ? "" : String(branding.logoPositionY)}
                onChange={(v) => setBranding((b) => ({ ...b, logoPositionY: v ? Number(v) : null }))}
              />
            </div>
          ) : null}

          <div className="mt-5">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Logo Size</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {LOGO_SIZES.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  disabled={!canCompany}
                  onClick={() => setBranding((b) => ({ ...b, logoSizePreset: size.value }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                    branding.logoSizePreset === size.value
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {branding.logoSizePreset === "custom" ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field
                label="Custom Width (mm)"
                type="number"
                value={branding.logoWidth == null ? "" : String(branding.logoWidth)}
                onChange={(v) => setBranding((b) => ({ ...b, logoWidth: v ? Number(v) : null }))}
              />
              <Field
                label="Custom Height (mm)"
                type="number"
                value={branding.logoHeight == null ? "" : String(branding.logoHeight)}
                onChange={(v) => setBranding((b) => ({ ...b, logoHeight: v ? Number(v) : null }))}
              />
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!canCompany}
              onClick={() => setBranding((b) => ({ ...b, logoMaintainAspectRatio: true }))}
              className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                branding.logoMaintainAspectRatio ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Maintain Aspect Ratio
            </button>
            <button
              type="button"
              disabled={!canCompany}
              onClick={() => setBranding((b) => ({ ...b, logoMaintainAspectRatio: false }))}
              className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                !branding.logoMaintainAspectRatio ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Stretch
            </button>
          </div>
        </div>

        <Field
          label="Primary Colour"
          value={branding.palette.primaryColor}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, primaryColor: v } }))}
        />
        <Field
          label="Secondary Colour"
          value={branding.palette.secondaryColor}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, secondaryColor: v } }))}
        />
        <Field
          label="Accent Colour"
          value={branding.palette.accentColor}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, accentColor: v } }))}
        />
        <Field
          label="Dark Text"
          value={branding.palette.darkTextColor}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, darkTextColor: v } }))}
        />
        <Field
          label="Light Text"
          value={branding.palette.lightTextColor}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, lightTextColor: v } }))}
        />
        <Field
          label="Header Background"
          value={branding.palette.headerBackground}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, headerBackground: v } }))}
        />
        <Field
          label="Footer Background"
          value={branding.palette.footerBackground}
          onChange={(v) => setBranding((b) => ({ ...b, palette: { ...b.palette, footerBackground: v } }))}
        />
        <Field
          label="Mobile"
          value={String(branding.mobile || "")}
          onChange={(v) => setBranding((b) => ({ ...b, mobile: v }))}
        />
        <Field
          label="Website"
          value={String(branding.website || "")}
          onChange={(v) => setBranding((b) => ({ ...b, website: v }))}
        />
        <Field
          label="City"
          value={String(branding.city || "")}
          onChange={(v) => setBranding((b) => ({ ...b, city: v }))}
        />
        <Field
          label="Province"
          value={String(branding.province || "")}
          onChange={(v) => setBranding((b) => ({ ...b, province: v }))}
        />
        <Field
          label="Country"
          value={String(branding.country || "")}
          onChange={(v) => setBranding((b) => ({ ...b, country: v }))}
        />
        <Field
          label="Postal Code"
          value={String(branding.postalCode || "")}
          onChange={(v) => setBranding((b) => ({ ...b, postalCode: v }))}
        />
        <Field
          label="Tax Number"
          value={String(branding.taxNumber || "")}
          onChange={(v) => setBranding((b) => ({ ...b, taxNumber: v }))}
        />
        <Field
          label="License Number"
          value={String(branding.licenseNumber || "")}
          onChange={(v) => setBranding((b) => ({ ...b, licenseNumber: v }))}
        />
      </section>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">Live Preview</h2>
          {previewLoading ? <span className="text-xs font-bold text-slate-400">Updating…</span> : null}
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">See how your logo and branding will appear on generated documents.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PREVIEW_DOCUMENT_TYPES.map((doc) => (
            <button
              key={doc.value}
              type="button"
              onClick={() => setPreviewType(doc.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                previewType === doc.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {doc.label}
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" style={{ height: "70vh" }}>
          {previewUrl ? (
            <iframe title="Document branding preview" src={previewUrl} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">Generating preview…</div>
          )}
        </div>
      </section>

      {canCompany ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={`${VYRON_BTN.primary} disabled:opacity-60`}
          >
            {saving ? "Saving…" : "Save Company Details"}
          </button>
          <button
            type="button"
            onClick={() => void saveBranding()}
            disabled={brandingSaving}
            className={`${VYRON_BTN.secondary} disabled:opacity-60`}
          >
            {brandingSaving ? "Saving…" : "Save Branding"}
          </button>
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-500">You have view-only access to company setup.</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
  type = "text",
  hint,
  error,
  warning,
  dataField,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
  hint?: string;
  /** Lets the readiness card scroll to and focus the field that fixes a gap. */
  dataField?: string;
  disabled?: boolean;
  /** Malformed input. The save is blocked while this is set. */
  error?: string;
  /** Inconsistent but still savable — the user may simply not know yet. */
  warning?: string;
}) {
  return (
    <label className={className}>
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        data-field={dataField}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS + (error ? " border-red-300" : " border-violet-100")}
      />
      {error ? <span className="mt-1.5 block text-[11px] font-bold text-red-600">{error}</span> : null}
      {!error && warning ? (
        <span className="mt-1.5 block text-[11px] font-bold text-amber-700">{warning}</span>
      ) : null}
      {!error && !warning && hint ? (
        <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  className,
  hint,
  dataField,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  hint?: string;
  dataField?: string;
}) {
  return (
    <label className={className}>
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        value={value}
        data-field={dataField}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS + " border-violet-100"}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">{hint}</span> : null}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label>
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{value}</div>
    </label>
  );
}
