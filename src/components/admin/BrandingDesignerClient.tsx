"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminPermissions } from "@/hooks/useModulePermissions";
import type { CompanyBranding, LogoPosition, LogoSizePreset } from "@/lib/platform/branding";
import { PREVIEW_DOCUMENT_TYPES, type PreviewDocumentType } from "@/lib/platform/documents/buildPreviewDocumentModel";

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
  { value: "custom", label: "Custom" },
];

const PALETTE_PRESETS: { name: string; primary: string; secondary: string; accent: string; text: string; background: string }[] = [
  { name: "VYRON Indigo", primary: "#4338CA", secondary: "#0F172A", accent: "#7C3AED", text: "#0F172A", background: "#0F172A" },
  { name: "Slate Professional", primary: "#1E293B", secondary: "#334155", accent: "#0EA5E9", text: "#0F172A", background: "#1E293B" },
  { name: "Emerald Fresh", primary: "#065F46", secondary: "#064E3B", accent: "#10B981", text: "#0F172A", background: "#065F46" },
  { name: "Burgundy Classic", primary: "#7F1D1D", secondary: "#450A0A", accent: "#DC2626", text: "#0F172A", background: "#7F1D1D" },
  { name: "Charcoal & Gold", primary: "#111827", secondary: "#1F2937", accent: "#D97706", text: "#0F172A", background: "#111827" },
];

const emptyBranding: CompanyBranding = {
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
  footerText: null,
  termsAndConditions: null,
  authorisationFooterText: null,
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400";
const labelClass = "block text-xs font-black uppercase tracking-[0.1em] text-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={labelClass}>
      {label}
      {children}
    </label>
  );
}

export default function BrandingDesignerClient() {
  const { canCompany } = useAdminPermissions();
  const [branding, setBranding] = useState<CompanyBranding>(emptyBranding);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewDocumentType>("purchase_order");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/admin/company/branding")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setBranding(data.branding as CompanyBranding);
        else setMessage(data.error || "Failed to load branding profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof CompanyBranding>(key: K, value: CompanyBranding[K]) {
    setBranding((current) => ({ ...current, [key]: value }));
  }

  function setPalette(key: keyof CompanyBranding["palette"], value: string) {
    setBranding((current) => ({ ...current, palette: { ...current.palette, [key]: value } }));
  }

  function applyPreset(preset: (typeof PALETTE_PRESETS)[number]) {
    setBranding((current) => ({
      ...current,
      palette: {
        ...current.palette,
        primaryColor: preset.primary,
        secondaryColor: preset.secondary,
        accentColor: preset.accent,
        darkTextColor: preset.text,
        headerBackground: preset.background,
      },
    }));
  }

  const runPreview = useCallback(
    async (type: PreviewDocumentType, current: CompanyBranding) => {
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
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (loading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runPreview(previewType, branding), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding, previewType, loading]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function uploadLogo(file: File) {
    if (!canCompany) {
      setMessage("You do not have permission to edit company branding.");
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/workspace/admin/company/branding/logo", { method: "POST", body: formData });
      const data = await response.json();
      if (!data.ok) {
        setMessage(data.error || "Logo upload failed.");
        return;
      }
      setBranding(data.branding as CompanyBranding);
      setMessage(
        data.svgRasterized === false
          ? "Logo uploaded. Note: SVG could not be converted for PDF embedding in this environment — PNG/JPG is recommended."
          : "Logo uploaded."
      );
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!canCompany) {
      setMessage("You do not have permission to edit company branding.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/workspace/admin/company/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: branding.companyName,
        tradingName: branding.tradingName,
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
        telephone: branding.telephone,
        email: branding.email,
        website: branding.website,
        vatNumber: branding.vatNumber,
        registrationNumber: branding.registrationNumber,
        footerText: branding.footerText,
        termsAndConditions: branding.termsAndConditions,
        authorisationFooterText: branding.authorisationFooterText,
      }),
    });
    const data = await response.json();
    setSaving(false);
    setMessage(data.ok ? "Branding saved. Every document and report will use these settings." : data.error || "Save failed.");
    if (data.ok) setBranding(data.branding as CompanyBranding);
  }

  const logoThumbnail = useMemo(() => branding.logoDataUrl || branding.logoUrl, [branding.logoDataUrl, branding.logoUrl]);

  if (loading) return <p className="text-sm font-bold text-slate-500">Loading branding profile…</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        {!canCompany ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            You have read-only access. Changes cannot be saved.
          </div>
        ) : null}
        {message ? <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">Company Identity</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Company Name">
              <input disabled={!canCompany} className={inputClass} value={branding.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field label="Trading Name">
              <input disabled={!canCompany} className={inputClass} value={branding.tradingName || ""} onChange={(e) => set("tradingName", e.target.value)} />
            </Field>
            <Field label="Website">
              <input disabled={!canCompany} className={inputClass} value={branding.website || ""} onChange={(e) => set("website", e.target.value)} placeholder="https://www.example.co.za" />
            </Field>
            <Field label="Email">
              <input disabled={!canCompany} type="email" className={inputClass} value={branding.email || ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Telephone">
              <input disabled={!canCompany} className={inputClass} value={branding.telephone || ""} onChange={(e) => set("telephone", e.target.value)} />
            </Field>
            <Field label="VAT Number">
              <input disabled={!canCompany} className={inputClass} value={branding.vatNumber || ""} onChange={(e) => set("vatNumber", e.target.value)} />
            </Field>
            <Field label="Registration Number">
              <input disabled={!canCompany} className={inputClass} value={branding.registrationNumber || ""} onChange={(e) => set("registrationNumber", e.target.value)} />
            </Field>
            <div />
            <Field label="Physical Address">
              <textarea disabled={!canCompany} className={`${inputClass} min-h-20`} value={branding.physicalAddress || ""} onChange={(e) => set("physicalAddress", e.target.value)} />
            </Field>
            <Field label="Postal Address">
              <textarea disabled={!canCompany} className={`${inputClass} min-h-20`} value={branding.postalAddress || ""} onChange={(e) => set("postalAddress", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">Logo</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
              {logoThumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoThumbnail} alt="Company logo" className="max-h-16 max-w-16 object-contain" />
              ) : (
                <span className="text-xs font-bold text-slate-400">No logo</span>
              )}
            </div>
            <div>
              <button
                type="button"
                disabled={!canCompany || uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload Logo"}
              </button>
              <p className="mt-1.5 text-xs font-semibold text-slate-500">PNG, JPG or SVG · up to 2MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="mt-5">
            <span className={labelClass}>Logo Position</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {LOGO_POSITIONS.map((pos) => (
                <button
                  key={pos.value}
                  type="button"
                  disabled={!canCompany}
                  onClick={() => set("logoPosition", pos.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                    branding.logoPosition === pos.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {branding.logoPosition === "custom" ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Position X (mm)">
                <input disabled={!canCompany} type="number" className={inputClass} value={branding.logoPositionX ?? ""} onChange={(e) => set("logoPositionX", e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <Field label="Position Y (mm)">
                <input disabled={!canCompany} type="number" className={inputClass} value={branding.logoPositionY ?? ""} onChange={(e) => set("logoPositionY", e.target.value ? Number(e.target.value) : null)} />
              </Field>
            </div>
          ) : null}

          <div className="mt-5">
            <span className={labelClass}>Logo Size</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {LOGO_SIZES.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  disabled={!canCompany}
                  onClick={() => set("logoSizePreset", size.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                    branding.logoSizePreset === size.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {branding.logoSizePreset === "custom" ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Custom Width (mm)">
                <input disabled={!canCompany} type="number" className={inputClass} value={branding.logoWidth ?? ""} onChange={(e) => set("logoWidth", e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <Field label="Custom Height (mm)">
                <input disabled={!canCompany} type="number" className={inputClass} value={branding.logoHeight ?? ""} onChange={(e) => set("logoHeight", e.target.value ? Number(e.target.value) : null)} />
              </Field>
            </div>
          ) : null}

          <label className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
            <input
              disabled={!canCompany}
              type="checkbox"
              checked={branding.logoMaintainAspectRatio}
              onChange={(e) => set("logoMaintainAspectRatio", e.target.checked)}
            />
            Maintain Aspect Ratio (uncheck to Stretch)
          </label>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">Colour Palette</h2>
          <div className="mt-4">
            <span className={labelClass}>Brand Palette Selector</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PALETTE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={!canCompany}
                  onClick={() => applyPreset(preset)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-400"
                >
                  <span className="flex -space-x-1">
                    <span className="h-3.5 w-3.5 rounded-full border border-white" style={{ backgroundColor: preset.primary }} />
                    <span className="h-3.5 w-3.5 rounded-full border border-white" style={{ backgroundColor: preset.accent }} />
                  </span>
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <ColorField label="Primary Colour" disabled={!canCompany} value={branding.palette.primaryColor} onChange={(v) => setPalette("primaryColor", v)} />
            <ColorField label="Secondary Colour" disabled={!canCompany} value={branding.palette.secondaryColor} onChange={(v) => setPalette("secondaryColor", v)} />
            <ColorField label="Accent Colour" disabled={!canCompany} value={branding.palette.accentColor} onChange={(v) => setPalette("accentColor", v)} />
            <ColorField label="Text Colour" disabled={!canCompany} value={branding.palette.darkTextColor} onChange={(v) => setPalette("darkTextColor", v)} />
            <ColorField label="Background Colour" disabled={!canCompany} value={branding.palette.headerBackground} onChange={(v) => setPalette("headerBackground", v)} />
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">Document Text</h2>
          <div className="mt-4 space-y-4">
            <Field label="Footer Text">
              <input disabled={!canCompany} className={inputClass} value={branding.footerText || ""} onChange={(e) => set("footerText", e.target.value)} />
            </Field>
            <Field label="Terms & Conditions">
              <textarea disabled={!canCompany} className={`${inputClass} min-h-24`} value={branding.termsAndConditions || ""} onChange={(e) => set("termsAndConditions", e.target.value)} />
            </Field>
            <Field label="Authorisation Footer">
              <textarea disabled={!canCompany} className={`${inputClass} min-h-20`} value={branding.authorisationFooterText || ""} onChange={(e) => set("authorisationFooterText", e.target.value)} />
            </Field>
          </div>
        </section>

        <button
          type="button"
          disabled={!canCompany || saving}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Branding"}
        </button>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">Live Preview</h2>
            {previewLoading ? <span className="text-xs font-bold text-slate-400">Updating…</span> : null}
          </div>
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
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <input
          disabled={disabled}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border-none bg-transparent p-0"
        />
        <span className="text-xs font-bold text-slate-500">{value.toUpperCase()}</span>
      </div>
    </label>
  );
}
