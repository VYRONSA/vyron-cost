"use client";

import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const templates = [
  ["Suppliers", "supplier_name,category,contact_email,invoice_email,payment_terms"],
  ["Ingredients", "ingredient_name,category,supplier_name,purchase_unit,recipe_unit,purchase_cost,previous_cost,yield_percent"],
  ["Products", "product_name,category,selling_price,target_gp,linked_bom_name"],
  ["BOMs", "bom_name,line_type,line_name,quantity,unit,unit_cost,wastage_percent,yield_qty,target_gp"],
  ["Packaging", "packaging_name,supplier_name,unit_cost,unit,category"],
  ["Purchase Orders", "po_number,supplier_name,item_name,quantity,unit,unit_cost,vat_rate"],
];

function downloadTemplate(name: string, header: string) {
  const blob = new Blob([header + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vyron-cost-${name.toLowerCase().replaceAll(" ", "-")}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportCentreClient() {
  const [uploaded, setUploaded] = useState<Record<string, string>>({});

  return (
    <VyronPremiumPageShell
      config={{
        title: "Bulk Import Centre",
        subtitle: "Premium VYRON COST workflow for bulk import centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <FileSpreadsheet size={32} className="text-[#A855F7]" />
              <h2 className="mt-5 text-3xl font-black">Bulk Import Centre</h2>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                Download templates, complete them in Excel, then upload. Files are staged for validation before importing into live costing data.
              </p>
            </div>

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {templates.map(([name, header]) => (
                <div key={name} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-black text-[#F8FAFC]">{name}</h3>
                      <p className="mt-2 text-xs font-bold leading-6 text-slate-500">{header}</p>
                    </div>
                    <FileSpreadsheet className="text-[#7E22CE]" size={28} />
                  </div>

                  <div className="mt-5 grid gap-3">
                    <button
                      type="button"
                      onClick={() => downloadTemplate(name, header)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-3 text-sm font-black text-[#4D7C0F]"
                    >
                      <Download size={17} />
                      Download template
                    </button>

                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#07110d] px-5 py-3 text-sm font-black text-[#A855F7]">
                      <UploadCloud size={17} />
                      Upload CSV
                      <input
                        type="file"
                        accept=".csv,.xlsx"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) setUploaded((current) => ({ ...current, [name]: file.name }));
                        }}
                      />
                    </label>

                    {uploaded[name] ? (
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                        Staged: {uploaded[name]}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          </section>
    </VyronPremiumPageShell>
  );
}
