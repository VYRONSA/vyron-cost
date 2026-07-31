"use client";

import { CheckCircle2, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { VyronCostAlert } from "@/lib/vyron-enterprise-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function tone(severity: string): "red" | "amber" | "emerald" | "slate" {
  const value = severity.toLowerCase();
  if (value.includes("critical") || value.includes("high")) return "red";
  if (value.includes("medium")) return "amber";
  if (value.includes("low")) return "emerald";
  return "slate";
}

export default function AlertsCentreClient({
  initialAlerts,
}: {
  initialAlerts: VyronCostAlert[];
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return alerts;

    return alerts.filter((alert) =>
      [
        alert.severity,
        alert.alert_type || "",
        alert.alert_title || "",
        alert.alert_message || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [alerts, search]);

  function markRead(id: string) {
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, is_read: true } : alert
      )
    );
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Alerts Centre",
        subtitle: "Premium VYRON COST workflow for alerts centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3">
                <Search size={20} className="text-[#7E22CE]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search alerts by severity, type, message or title..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A855F7]">
                  {filtered.length} alerts
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {filtered.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-[2rem] border p-6 shadow-[0_10px_35px_rgba(15,23,42,0.06)] ${
                    alert.is_read
                      ? "border-white bg-white"
                      : "border-[#A855F7]/25 bg-white shadow-black/10"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                        <ShieldAlert size={24} />
                      </div>

                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          <StatusPill tone={tone(alert.severity)}>{alert.severity}</StatusPill>
                          <StatusPill tone="slate">{alert.alert_type || "System Alert"}</StatusPill>
                          <StatusPill tone={alert.is_read ? "emerald" : "amber"}>
                            {alert.is_read ? "Read" : "Unread"}
                          </StatusPill>
                        </div>

                        <h2 className="text-xl font-black text-[#F8FAFC]">
                          {alert.alert_title || "Untitled alert"}
                        </h2>

                        <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-500">
                          {alert.alert_message || "No alert message captured."}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => markRead(alert.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-3 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]"
                    >
                      <CheckCircle2 size={18} />
                      Mark Read
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
