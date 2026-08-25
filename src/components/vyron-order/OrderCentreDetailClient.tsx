"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Mail, MessageSquare, Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import { STAFF_STATUS_TONE } from "@/components/vyron-order/OrderCentreClient";

const M = VYRON_MASTER;

/**
 * Staff order detail.
 *
 * Everything shown comes from the existing sales-order engine. Actions call
 * transitionCustomerSalesOrder through the API — this screen holds no state
 * machine of its own and only offers the transitions the engine will accept.
 *
 * Cost and GP appear only when the server says the signed-in staff member may
 * see them; the fields are stripped server-side, not hidden with CSS.
 */

const money = (v: number) =>
  `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
}

function formatStamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type OrderRecord = Record<string, unknown>;

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email: <Mail size={13} />,
  sms: <MessageSquare size={13} />,
  whatsapp: <MessageSquare size={13} />,
  in_app: <Bell size={13} />,
};

const DELIVERY_TONE: Record<string, string> = {
  Sent: "vyron-status vyron-status-success",
  Failed: "vyron-status vyron-status-error",
  "Not Configured": "vyron-status vyron-status-warning",
  Pending: "vyron-status vyron-status-neutral",
};

export default function OrderCentreDetailClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<{
    order: OrderRecord;
    lines: OrderRecord[];
    audit: OrderRecord[];
    actions: { action: string; label: string; permission: string }[];
    maySeeCosting: boolean;
    notifications: OrderRecord[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/vyron-order/staff/orders/${orderId}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't load that order."); return; }
      setData(body);
      setError(null);
    } catch {
      setError("We couldn't load that order.");
    }
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vyron-order/staff/orders/${orderId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) setData(body);
        else setError(body?.error || "We couldn't load that order.");
      })
      .catch(() => { if (!cancelled) setError("We couldn't load that order."); });
    return () => { cancelled = true; };
  }, [orderId]);

  async function runAction(action: string, label: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/vyron-order/staff/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't update that order."); return; }
      setNotice(`${label} — order is now ${body.status}.`);
      await load();
    } catch {
      setError("We couldn't update that order.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Link href="/order-centre" className={`${M.secondaryBtn} inline-flex h-11 items-center gap-1.5 pl-3 pr-4 text-xs font-bold uppercase tracking-[0.1em]`}>
          <ArrowLeft size={15} /> Order Centre
        </Link>
        <p role="alert" className={`${M.alertError} px-4 py-3 text-sm font-bold`}>{error}</p>
      </div>
    );
  }

  if (!data) return <p className={M.tableEmptyLight}>Loading order…</p>;

  const order = data.order;
  const status = String(order.status || "");
  const total = Number(order.total || 0);

  return (
    <div className="space-y-5">
      <Link href="/order-centre" className={`${M.secondaryBtn} inline-flex h-11 items-center gap-1.5 pl-3 pr-4 text-xs font-bold uppercase tracking-[0.1em]`}>
        <ArrowLeft size={15} /> Order Centre
      </Link>

      {notice ? (
        <p role="status" className={`${M.alertSuccess} flex items-center gap-2 px-4 py-3 text-sm font-bold`}>
          <CheckCircle2 size={16} /> {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={`${M.alertError} px-4 py-3 text-sm font-bold`}>{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className={`${M.modulePanel} p-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={`text-xl md:text-2xl ${M.heading}`}>{String(order.order_number || "")}</h1>
              <span className={STAFF_STATUS_TONE[status] || "vyron-status vyron-status-neutral"}>
                {status}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-[#334155]">{String(order.customer_name || "")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className={M.label}>Placed</p>
                <p className="mt-0.5 text-sm font-bold text-[#0F172A]">{formatStamp(String(order.created_at || ""))}</p>
              </div>
              <div>
                <p className={M.label}>Delivery</p>
                <p className="mt-0.5 text-sm font-bold text-[#0F172A]">{formatDate(order.requested_delivery_date ? String(order.requested_delivery_date) : null)}</p>
              </div>
              <div>
                <p className={M.label}>Total</p>
                <p className="mt-0.5 text-sm font-black tabular-nums text-[#0F172A]">{money(total)}</p>
              </div>
            </div>

            {order.notes ? (
              <div className={`mt-4 ${M.modulePanelNested}`}>
                <p className={M.label}>Customer note</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-[#334155]">{String(order.notes)}</p>
              </div>
            ) : null}
          </section>

          <section className={`${M.tableSurface} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className={M.tableHead}>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    {data.maySeeCosting ? (
                      <th className="px-4 py-3 text-right">Cost</th>
                    ) : null}
                    <th className="px-4 py-3 text-right">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line, i) => (
                    <tr key={`${String(line.id || i)}`} className={M.tableRow}>
                      <td className="px-4 py-3 text-sm font-bold text-[#0F172A]">{String(line.description || "")}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#334155]">{Number(line.quantity || 0)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#334155]">{money(Number(line.selling_price || 0))}</td>
                      {data.maySeeCosting ? (
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#64748B]">{money(Number(line.cost_per_unit || 0))}</td>
                      ) : null}
                      <td className="px-4 py-3 text-right text-sm font-black tabular-nums text-[#0F172A]">{money(Number(line.line_total || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1.5 border-t border-[rgba(15,23,42,0.07)] bg-[rgba(15,23,42,0.03)] px-4 py-4">
              <div className="flex justify-between text-sm font-semibold text-[#64748B]">
                <span>Subtotal</span><span className="tabular-nums">{money(Number(order.subtotal || 0))}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-[#64748B]">
                <span>VAT</span><span className="tabular-nums">{money(Number(order.vat_amount || 0))}</span>
              </div>
              <div className="flex justify-between border-t border-[rgba(15,23,42,0.07)] pt-2 text-base font-black text-[#0F172A]">
                <span>Total</span><span className="tabular-nums">{money(total)}</span>
              </div>
              {data.maySeeCosting ? (
                <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-[rgba(15,23,42,0.07)] pt-2 text-xs font-bold text-[#64748B]">
                  <span>Cost {money(Number(order.cost_value || 0))}</span>
                  <span>GP {money(Number(order.gross_profit || 0))} ({Number(order.gp_percentage || 0).toFixed(1)}%)</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className={`${M.modulePanel} p-5`}>
            <h2 className={`${M.label} text-[11px]`}>Actions</h2>
            {data.actions.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-[#64748B]">
                No further action is available while this order is {status}.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {data.actions.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction(a.action, a.label)}
                    className={`h-12 w-full text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50 ${
                      a.action === "cancel"
                        ? "inline-flex items-center justify-center gap-2 rounded-xl border border-[#BE123C]/25 bg-white/80 text-[#BE123C] shadow-[var(--vyron-elev-1)] backdrop-blur transition hover:border-[#BE123C]/40 hover:bg-[rgba(190,18,60,0.06)]"
                        : M.primaryBtn
                    }`}
                  >
                    {busy ? "Working…" : a.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={`${M.modulePanel} p-5`}>
            <h2 className={`${M.label} text-[11px]`}>Notifications</h2>
            {data.notifications.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-[#64748B]">No notifications for this order.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.notifications.map((n, i) => (
                  <li key={String(n.id || i)} className="flex items-start justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-bold text-[#334155]">
                        {CHANNEL_ICON[String(n.channel)] || null}
                        {String(n.recipient_name || "")}
                      </span>
                      <span className="mt-0.5 block truncate font-semibold text-[#94A3B8]">
                        {String(n.channel)} · {formatStamp(String(n.created_at || ""))}
                      </span>
                      {n.error ? (
                        <span className="mt-0.5 block text-[11px] font-semibold text-[#B45309]">{String(n.error)}</span>
                      ) : null}
                    </span>
                    <span className={`shrink-0 ${DELIVERY_TONE[String(n.status)] || "vyron-status vyron-status-neutral"}`}>
                      {String(n.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${M.modulePanel} p-5`}>
            <h2 className={`${M.label} flex items-center gap-2 text-[11px]`}>
              <Clock size={13} /> Audit trail
            </h2>
            {data.audit.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-[#64748B]">No events recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.audit.map((a, i) => (
                  <li key={i} className="text-xs">
                    <p className="font-black text-[#0F172A]">{String(a.event_type || "")}</p>
                    <p className="mt-0.5 font-semibold text-[#64748B]">
                      {String(a.actor || "system")}
                      {a.to_status ? ` → ${String(a.to_status)}` : ""} · {formatStamp(String(a.created_at || ""))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!data.maySeeCosting ? (
            <p className={`${M.modulePanelNested} flex items-start gap-2 px-4 py-3 text-xs font-semibold text-[#64748B]`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#94A3B8]" />
              Cost and margin are hidden for your permission level.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
