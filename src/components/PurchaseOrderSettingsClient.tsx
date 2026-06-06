"use client";

import { useEffect, useState } from "react";

export default function PurchaseOrderSettingsClient() {
  const [rules, setRules] = useState({
    autoApproveBelow: 5000,
    supervisorApproveBelow: 25000,
    requirePoBeforeInvoiceApproval: true,
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/purchase-orders/approval-rules")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.rules) setRules(d.rules);
      });
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/purchase-orders/approval-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    const data = await res.json();
    setMessage(data.ok ? "Settings saved." : data.error || "Save failed");
    setSaving(false);
  }

  return (
    <section className="max-w-xl rounded-[2rem] border border-violet-100 bg-white p-6">
      <h2 className="text-xl font-black">PO & Invoice Approval Thresholds</h2>
      <p className="mt-2 text-sm text-slate-500">
        &lt; R{rules.autoApproveBelow.toLocaleString()} auto-approve · R{rules.autoApproveBelow.toLocaleString()}–R
        {rules.supervisorApproveBelow.toLocaleString()} supervisor · above manager/CFO
      </p>
      <label className="mt-4 block text-xs font-black uppercase text-slate-500">
        Auto approve below (R)
        <input
          type="number"
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold"
          value={rules.autoApproveBelow}
          onChange={(e) => setRules((r) => ({ ...r, autoApproveBelow: Number(e.target.value) }))}
        />
      </label>
      <label className="mt-3 block text-xs font-black uppercase text-slate-500">
        Supervisor approval below (R)
        <input
          type="number"
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold"
          value={rules.supervisorApproveBelow}
          onChange={(e) => setRules((r) => ({ ...r, supervisorApproveBelow: Number(e.target.value) }))}
        />
      </label>
      <label className="mt-4 flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={rules.requirePoBeforeInvoiceApproval}
          onChange={(e) => setRules((r) => ({ ...r, requirePoBeforeInvoiceApproval: e.target.checked }))}
        />
        Require PO linked before invoice approval
      </label>
      {message ? <p className="mt-3 text-xs font-bold text-violet-700">{message}</p> : null}
      <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
        {saving ? "Saving…" : "Save settings"}
      </button>
    </section>
  );
}
