"use client";

import { useEffect, useState } from "react";
import { Card, Notice, Pill, SecondaryButton, when } from "@/components/vyron-order-engine/ui";

/**
 * Channel activation.
 *
 * Every way an order can reach the business is listed here on its own, with
 * the state it is in, what it still needs before it can be activated, and what
 * it has actually done. Nothing becomes active by being configured: activation
 * is a decision recorded against a person, and the engine re-checks the
 * conditions when it is made.
 */

type Requirement = { id: string; label: string; met: boolean; detail: string };

type Channel = {
  channelType: string;
  channelKey: string;
  label: string | null;
  state: string;
  enabled: boolean;
  requirements: Requirement[];
  ready: boolean;
  blockedBy: string[];
  nextStates: string[];
  activity: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    exceptionCount: number;
    activatedAt: string | null;
    activatedBy: string | null;
    uatPassedAt: string | null;
    uatReference: string | null;
    firstLiveAt: string | null;
    firstLiveIntakeId: string | null;
  };
};

const CHANNEL_LABEL: Record<string, string> = {
  manual: "Entered by hand",
  csv: "CSV file",
  xlsx: "Excel file",
  email: "E-mail inbox",
  pdf: "PDF documents",
  web_store: "Web store",
};

const CHANNEL_NOTE: Record<string, string> = {
  manual: "A person keys the order in. No connector, provider or credential.",
  csv: "A person uploads a CSV the customer sent.",
  xlsx: "A person uploads a spreadsheet the customer sent.",
  email: "Orders arrive at a receiving address, from senders you allow.",
  pdf: "A document extractor reads attached order PDFs.",
  web_store: "Orders are taken from a web store to be fulfilled here.",
};

const STATE_LABEL: Record<string, string> = {
  DISABLED: "Disabled",
  CONFIGURED: "Configured",
  READY_FOR_UAT: "Ready for testing",
  UAT_PASSED: "Testing passed",
  READY_FOR_ACTIVATION: "Ready to activate",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

const STATE_TONE: Record<string, "slate" | "blue" | "green" | "amber" | "rose"> = {
  DISABLED: "slate",
  CONFIGURED: "blue",
  READY_FOR_UAT: "blue",
  UAT_PASSED: "blue",
  READY_FOR_ACTIVATION: "amber",
  ACTIVE: "green",
  SUSPENDED: "rose",
};

type Loaded = Channel[] | "not_enabled" | { error: string };

async function fetchChannels(): Promise<Loaded> {
  try {
    const res = await fetch("/api/order-intake/activation", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.code === "NOT_ENABLED") return "not_enabled";
    if (!res.ok || !data.ok) return { error: data.error || "Could not load channels." };
    return data.channels as Channel[];
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load channels." };
  }
}

export default function ChannelActivationCard({ canManage }: { canManage: boolean }) {
  const [channels, setChannels] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChannels().then((result) => {
      if (!cancelled) setChannels(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function move(channel: Channel, to: string) {
    let reason: string | null = null;
    let uatReference: string | null = null;
    if (to === "SUSPENDED") {
      reason = window.prompt("Why is this channel being suspended? It is recorded against the channel.") || "";
      if (!reason.trim()) return;
    }
    if (to === "UAT_PASSED") {
      uatReference = window.prompt("What proves the testing passed? (the UAT run or document reference)") || "";
      if (!uatReference.trim()) return;
    }
    if (to === "ACTIVE" && !window.confirm(`Activate ${CHANNEL_LABEL[channel.channelType] || channel.channelType}? Real customer orders will then enter the business through it.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/order-intake/activation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelType: channel.channelType, channelKey: channel.channelKey, to, reason, uatReference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not change the channel.");
      setChannels(data.channels as Channel[]);
      setMessage({ tone: "success", text: `${CHANNEL_LABEL[channel.channelType] || channel.channelType}: ${STATE_LABEL[to] || to}.` });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not change the channel." });
    } finally {
      setBusy(false);
    }
  }

  if (channels === null) return null;
  if (channels === "not_enabled") return null;
  if ("error" in channels && !Array.isArray(channels)) return <Notice tone="error">{(channels as { error: string }).error}</Notice>;

  const list = channels as Channel[];

  return (
    <Card title="Channels & activation">
      <p className="mb-3 max-w-3xl text-xs font-semibold text-slate-500">
        Each way an order can reach you is switched on by itself: one that is not working never stops the others. A channel does not become active because
        credentials exist — it must meet its conditions, be tested, and be activated by a person.
      </p>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="grid gap-2">
        {list.map((channel) => {
          const key = `${channel.channelType}:${channel.channelKey}`;
          const expanded = open === key;
          return (
            <div key={key} className="rounded-xl border border-slate-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-900">{CHANNEL_LABEL[channel.channelType] || channel.channelType}</span>
                    {channel.label || (channel.channelKey !== channel.channelType) ? (
                      <span className="text-xs font-bold text-slate-500">{channel.label || channel.channelKey}</span>
                    ) : null}
                    <Pill tone={STATE_TONE[channel.state] || "slate"}>{STATE_LABEL[channel.state] || channel.state}</Pill>
                    {channel.blockedBy.length ? <Pill tone="amber">{channel.blockedBy.length} outstanding</Pill> : null}
                    {channel.activity.exceptionCount ? <Pill tone="rose">{channel.activity.exceptionCount} in exceptions</Pill> : null}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {CHANNEL_NOTE[channel.channelType] || ""}
                    {channel.activity.lastSuccessAt ? ` · last order ${when(channel.activity.lastSuccessAt)}` : " · no order received yet"}
                    {channel.activity.lastFailureAt ? ` · last failure ${when(channel.activity.lastFailureAt)}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SecondaryButton onClick={() => setOpen(expanded ? null : key)}>{expanded ? "Hide" : "Details"}</SecondaryButton>
                  {canManage
                    ? channel.nextStates.map((to) => (
                        <SecondaryButton key={to} onClick={() => move(channel, to)} disabled={busy} tone={to === "SUSPENDED" || to === "DISABLED" ? "rose" : "slate"}>
                          {STATE_LABEL[to] || to}
                        </SecondaryButton>
                      ))
                    : null}
                </div>
              </div>
              {expanded ? (
                <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                  <div className="grid gap-1">
                    {channel.requirements.map((requirement) => (
                      <div key={requirement.id} className="flex items-start gap-2 text-xs">
                        <span className={requirement.met ? "font-black text-emerald-600" : "font-black text-amber-600"}>{requirement.met ? "✓" : "•"}</span>
                        <span>
                          <span className="font-bold text-slate-800">{requirement.label}</span>
                          <span className="ml-1 font-semibold text-slate-500">{requirement.detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {channel.activity.uatPassedAt ? `Testing passed ${when(channel.activity.uatPassedAt)}${channel.activity.uatReference ? ` (${channel.activity.uatReference})` : ""}. ` : ""}
                    {channel.activity.activatedAt ? `Activated ${when(channel.activity.activatedAt)} by ${channel.activity.activatedBy}. ` : ""}
                    {channel.activity.firstLiveAt ? `First live order ${when(channel.activity.firstLiveAt)}. ` : ""}
                    {channel.activity.lastFailureReason ? `Last failure: ${channel.activity.lastFailureReason}` : ""}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
