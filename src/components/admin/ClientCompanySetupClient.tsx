"use client";

import { useEffect, useState } from "react";
import type { WorkspaceCompanyProfile } from "@/lib/vyron-saas-workspace";
import { useAdminPermissions } from "@/hooks/useModulePermissions";
import { VYRON_BTN } from "@/components/vyron-ui";

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
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/workspace/admin/company")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setProfile(data.profile);
        else setMessage(data.error || "Failed to load company profile.");
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

  if (loading) return <div className="text-sm font-semibold text-slate-500">Loading company profile…</div>;

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
          {message}
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

      {canCompany ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={`${VYRON_BTN.primary} disabled:opacity-60`}
        >
          {saving ? "Saving…" : "Save Company Details"}
        </button>
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
