"use client";

import { Building2, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { VyronBranch } from "@/lib/vyron-enterprise-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const emptyForm = {
  branch_name: "",
  branch_code: "",
  city: "",
  region: "",
  contact_email: "",
  contact_phone: "",
};

export default function BranchManagerClient({
  branches,
  companyId,
}: {
  branches: VyronBranch[];
  companyId: string;
}) {
  const [items, setItems] = useState(branches);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return items;

    return items.filter((branch) =>
      [
        branch.branch_name,
        branch.branch_code || "",
        branch.city || "",
        branch.region || "",
        branch.contact_email || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [items, search]);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addBranch() {
    if (!form.branch_name.trim()) {
      setMessage("Please enter a branch name.");
      return;
    }

    const payload = {
      company_id: companyId,
      branch_name: form.branch_name.trim(),
      branch_code: form.branch_code || null,
      city: form.city || null,
      region: form.region || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      is_active: true,
    };

    if (supabase && companyId !== "company-demo") {
      const { data, error } = await supabase.from("vyron_branches").insert(payload).select("*").single();

      if (error || !data) {
        setMessage(error?.message || "Could not create branch.");
        return;
      }

      setItems((current) => [...current, data as VyronBranch]);
    } else {
      setItems((current) => [...current, { id: crypto.randomUUID(), ...payload } as VyronBranch]);
    }

    setForm(emptyForm);
    setMessage("Branch added.");
  }

  async function deleteBranch(id: string) {
    setItems((current) => current.filter((branch) => branch.id !== id));

    if (supabase && !id.startsWith("branch")) {
      await supabase.from("vyron_branches").delete().eq("id", id);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Branch Manager",
        subtitle: "Premium VYRON COST workflow for branch manager.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 p-3 text-[#7E22CE]">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#F8FAFC]">Add Branch</h2>
                  <p className="text-sm text-slate-500">Create branches for location-level GP, wastage and pricing later.</p>
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  ["branch_name", "Branch Name"],
                  ["branch_code", "Branch Code"],
                  ["city", "City"],
                  ["region", "Region"],
                  ["contact_email", "Contact Email"],
                  ["contact_phone", "Contact Phone"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-black text-slate-600">
                    {label}
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
                      value={form[field as keyof typeof emptyForm]}
                      onChange={(event) => updateForm(field as keyof typeof emptyForm, event.target.value)}
                    />
                  </label>
                ))}

                <button
                  type="button"
                  onClick={addBranch}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-5 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]"
                >
                  <Plus size={18} />
                  Add Branch
                </button>

                {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#7E22CE]">{message}</div>}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-black text-[#F8FAFC]">Branch Network</h2>

              <div className="mt-5 rounded-[1.5rem] border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search branches..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none"
                />
              </div>

              <div className="mt-5 grid gap-4">
                {filtered.map((branch) => (
                  <div key={branch.id} className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <StatusPill tone={branch.is_active ? "emerald" : "slate"}>
                            {branch.is_active ? "Active" : "Inactive"}
                          </StatusPill>
                          <StatusPill tone="slate">{branch.branch_code || "No code"}</StatusPill>
                        </div>

                        <h3 className="mt-3 text-xl font-black text-[#F8FAFC]">{branch.branch_name}</h3>

                        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                          <MapPin size={16} />
                          {branch.city || "No city"} · {branch.region || "No region"}
                        </div>

                        <p className="mt-2 text-sm text-slate-500">{branch.contact_email || "No email"} · {branch.contact_phone || "No phone"}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteBranch(branch.id)}
                        className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
