"use client";

import { useEffect, useState } from "react";
import type { WorkspaceCompanyProfile } from "@/lib/vyron-saas-workspace";
import { useAdminPermissions } from "@/hooks/useModulePermissions";
import { VYRON_BTN } from "@/components/vyron-ui";
import type { CompanyBranding } from "@/lib/platform/branding";

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
  xeroStatus: "Not Connected",
  packageName: "Professional",
  userLimit: 5,
  activeModules: [],
  status: "Setup",
};

export default function ClientCompanySetupClient() {
  const { canCompany } = useAdminPermissions();
  const [profile, setProfile] = useState<WorkspaceCompanyProfile>(emptyProfile);
  const [branding, setBranding] = useState<CompanyBranding>({
    workspaceId: null,
    companyId: null,
    companyName: "",
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
  });
  const [message, setMessage] = useState<string | null>(null);
  const [brandingMessage, setBrandingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);

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

  if (loading) return <div className="text-sm font-semibold text-slate-500">Loading company profile…</div>;

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
          {message}
        </div>
      ) : null}

      {brandingMessage ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
          {brandingMessage}
        </div>
      ) : null}

      <section className="grid gap-5 rounded-[2rem] border border-violet-100 bg-white p-7 shadow-sm md:grid-cols-2">
        <Field label="Company Name" value={profile.companyName} onChange={(v) => setProfile((p) => ({ ...p, companyName: v }))} />
        <Field label="Trading Name" value={profile.tradingName} onChange={(v) => setProfile((p) => ({ ...p, tradingName: v }))} />
        <Field label="VAT Number" value={profile.vatNumber} onChange={(v) => setProfile((p) => ({ ...p, vatNumber: v }))} />
        <Field label="Registration Number" value={profile.registrationNumber} onChange={(v) => setProfile((p) => ({ ...p, registrationNumber: v }))} />
        <Field label="Contact Email" value={profile.contactEmail} onChange={(v) => setProfile((p) => ({ ...p, contactEmail: v }))} />
        <Field label="Phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} />
        <Field label="Physical Address" value={profile.physicalAddress} onChange={(v) => setProfile((p) => ({ ...p, physicalAddress: v }))} className="md:col-span-2" />
        <Field label="Postal Address" value={profile.postalAddress} onChange={(v) => setProfile((p) => ({ ...p, postalAddress: v }))} className="md:col-span-2" />
        <Field
          label="Default VAT Rate (%)"
          value={String(profile.defaultVatRate)}
          onChange={(v) => setProfile((p) => ({ ...p, defaultVatRate: Number(v) || 0 }))}
          type="number"
        />
        <ReadOnlyField label="Xero Status" value={profile.xeroStatus} />
        <ReadOnlyField label="Package" value={profile.packageName} />
        <ReadOnlyField label="User Limit" value={String(profile.userLimit)} />
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
        <Field
          label="Company Logo URL"
          value={String(branding.logoUrl || "")}
          onChange={(v) => setBranding((b) => ({ ...b, logoUrl: v }))}
          className="md:col-span-2"
        />
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
}) {
  return (
    <label className={className}>
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400"
      />
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
