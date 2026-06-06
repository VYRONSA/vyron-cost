"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  ExternalLink,
  LogIn,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  DEVELOPER_CLIENTS_KEY,
  DEVELOPER_EDITING_CLIENT_KEY,
  DEVELOPER_SELECTED_CLIENT_KEY,
  clearActiveClient,
  readActiveClient,
  writeActiveClient,
  type ActiveClient,
} from "@/lib/vyron-developer-client";

type ClientStatus = "Live" | "Demo" | "Setup" | "Suspended";
type XeroStatus = "Connected" | "Not Connected" | "Setup Required";
export type DeveloperMode = "centre" | "clients" | "setup";

type ClientWorkspace = {
  id: string;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: ClientStatus;
  userLimit: number;
  companyLimit: number;
  storageLimit: string;
  activeUsers: number;
  contactEmail: string;
  phone: string;
  xeroStatus: XeroStatus;
  enabledModules: string[];
};

const emptyForm = {
  companyName: "",
  tradingName: "",
  packageName: "Professional",
  userLimit: 5,
  contactEmail: "",
  phone: "",
};

const defaultModules = ["Costing", "Procurement", "Inventory", "Reports"];

const initialClients: ClientWorkspace[] = [
  {
    id: "client-001",
    companyName: "Handcrafted Food Products",
    tradingName: "Handcrafted Food Products",
    packageName: "Professional Demo",
    status: "Demo",
    userLimit: 4,
    companyLimit: 1,
    storageLimit: "25 GB",
    activeUsers: 1,
    contactEmail: "admin@handcraftedfood.co.za",
    phone: "021 555 0100",
    xeroStatus: "Setup Required",
    enabledModules: [...defaultModules, "Manufacturing", "Customers"],
  },
];

function readStoredClients(): ClientWorkspace[] {
  if (typeof window === "undefined") return initialClients;
  try {
    const raw = localStorage.getItem(DEVELOPER_CLIENTS_KEY);
    if (!raw) return initialClients;
    const parsed = JSON.parse(raw) as ClientWorkspace[];
    return parsed.length ? parsed : initialClients;
  } catch {
    return initialClients;
  }
}

function statusClass(status: ClientStatus) {
  if (status === "Live") return "bg-emerald-100 text-emerald-800";
  if (status === "Demo") return "bg-violet-100 text-violet-800";
  if (status === "Suspended") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function xeroClass(status: XeroStatus) {
  if (status === "Connected") return "rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800";
  if (status === "Setup Required") return "rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800";
  return "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700";
}

export default function DeveloperClient({ mode = "centre" }: { mode?: DeveloperMode }) {
  const router = useRouter();
  const newClientRef = useRef<HTMLElement>(null);
  const [clients, setClients] = useState<ClientWorkspace[]>(initialClients);
  const [hydrated, setHydrated] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activeClient, setActiveClient] = useState<ActiveClient | null>(null);
  const [search, setSearch] = useState("");

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      [client.companyName, client.tradingName, client.id, client.contactEmail, client.packageName]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [clients, search]);

  const statusCounts = useMemo(
    () => ({
      total: clients.length,
      live: clients.filter((c) => c.status === "Live").length,
      demo: clients.filter((c) => c.status === "Demo").length,
      setup: clients.filter((c) => c.status === "Setup").length,
      suspended: clients.filter((c) => c.status === "Suspended").length,
    }),
    [clients]
  );

  const recentSetupClients = useMemo(
    () => clients.filter((c) => c.status === "Setup").slice(0, 3),
    [clients]
  );

  const setupNotes = useMemo(() => {
    const notes: string[] = [];
    if (statusCounts.setup > 0) {
      notes.push(`${statusCounts.setup} client workspace(s) still in Setup — complete package and contact details.`);
    }
    const xeroPending = clients.filter((c) => c.xeroStatus !== "Connected").length;
    if (xeroPending > 0) {
      notes.push(`${xeroPending} workspace(s) need Xero connection from Integrations after go-live.`);
    }
    if (activeClient) {
      notes.push(`Active session: ${activeClient.companyName} (${activeClient.status}).`);
    }
    if (notes.length === 0) {
      notes.push("All registered workspaces are configured. Use Client Setup to onboard new tenants.");
    }
    return notes;
  }, [clients, statusCounts.setup, activeClient]);

  useEffect(() => {
    setClients(readStoredClients());
    setActiveClient(readActiveClient());
    const storedSelected = sessionStorage.getItem(DEVELOPER_SELECTED_CLIENT_KEY);
    const storedEditing = sessionStorage.getItem(DEVELOPER_EDITING_CLIENT_KEY);
    if (storedSelected) setSelectedClientId(storedSelected);
    if (storedEditing) setEditingClientId(storedEditing);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(DEVELOPER_CLIENTS_KEY, JSON.stringify(clients));
  }, [clients, hydrated]);

  useEffect(() => {
    if (!editingClientId) return;
    const client = clients.find((item) => item.id === editingClientId);
    if (!client) return;
    setForm({
      companyName: client.companyName,
      tradingName: client.tradingName,
      packageName: client.packageName,
      userLimit: client.userLimit,
      contactEmail: client.contactEmail,
      phone: client.phone,
    });
  }, [editingClientId, clients]);

  function addClient() {
    if (!form.companyName.trim()) {
      alert("Please enter a company name.");
      return;
    }

    const client: ClientWorkspace = {
      id: `client-${String(clients.length + 1).padStart(3, "0")}`,
      companyName: form.companyName.trim(),
      tradingName: form.tradingName.trim() || form.companyName.trim(),
      packageName: form.packageName,
      status: "Setup",
      userLimit: Number(form.userLimit || 1),
      companyLimit: 1,
      storageLimit: "25 GB",
      activeUsers: 0,
      contactEmail: form.contactEmail.trim(),
      phone: form.phone.trim(),
      xeroStatus: "Setup Required",
      enabledModules: [...defaultModules],
    };

    setClients((current) => [client, ...current]);
    setSelectedClientId(client.id);
    setEditingClientId(null);
    sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
    setForm(emptyForm);
    setMessage(`${client.companyName} created. Finish setup checklist below.`);
  }

  function saveEditedClient() {
    if (!editingClientId) return;
    if (!form.companyName.trim()) {
      alert("Please enter a company name.");
      return;
    }

    setClients((current) =>
      current.map((client) =>
        client.id === editingClientId
          ? {
              ...client,
              companyName: form.companyName.trim(),
              tradingName: form.tradingName.trim() || form.companyName.trim(),
              packageName: form.packageName,
              userLimit: Number(form.userLimit || 1),
              contactEmail: form.contactEmail.trim(),
              phone: form.phone.trim(),
            }
          : client
      )
    );
    setEditingClientId(null);
    setForm(emptyForm);
    sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
    setMessage("Client details updated.");
  }

  function updateStatus(id: string, status: ClientStatus) {
    setClients((current) => current.map((client) => (client.id === id ? { ...client, status } : client)));
  }

  function suspendClient(id: string) {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    if (!window.confirm(`Suspend access for ${client.companyName}?`)) return;
    updateStatus(id, "Suspended");
    setMessage(`${client.companyName} suspended.`);
  }

  function clearActiveClientStorage() {
    clearActiveClient();
    setActiveClient(null);
  }

  function deleteClient(id: string) {
    if (!window.confirm("Delete this client workspace? This cannot be undone.")) return;
    setClients((current) => current.filter((client) => client.id !== id));
    if (selectedClientId === id) setSelectedClientId(null);
    if (editingClientId === id) {
      setEditingClientId(null);
      setForm(emptyForm);
      sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
    }
    if (activeClient?.id === id) clearActiveClientStorage();
    setMessage("Client workspace removed.");
  }

  function refreshClients() {
    setClients(readStoredClients());
    setMessage(`Client register refreshed at ${new Date().toLocaleString()}.`);
  }

  function deleteDemoCompany() {
    if (!window.confirm("Delete the demo company Handcrafted Food Products from the developer register?")) return;
    const demoClient = clients.find((client) => client.companyName === "Handcrafted Food Products");
    setClients((current) => current.filter((client) => client.companyName !== "Handcrafted Food Products"));
    if (selectedClientId && demoClient?.id === selectedClientId) setSelectedClientId(null);
    if (activeClient?.companyName === "Handcrafted Food Products") clearActiveClientStorage();
    setMessage("Demo company removed from register.");
  }

  function openClient(id: string) {
    setSelectedClientId(id);
    sessionStorage.setItem(DEVELOPER_SELECTED_CLIENT_KEY, id);
    setMessage(null);
  }

  function startEditClient(id: string) {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    setEditingClientId(id);
    sessionStorage.setItem(DEVELOPER_SELECTED_CLIENT_KEY, id);
    sessionStorage.setItem(DEVELOPER_EDITING_CLIENT_KEY, id);
    setSelectedClientId(id);
    setForm({
      companyName: client.companyName,
      tradingName: client.tradingName,
      packageName: client.packageName,
      userLimit: client.userLimit,
      contactEmail: client.contactEmail,
      phone: client.phone,
    });
    router.push("/developer/setup");
  }

  function loginAsClient(client: ClientWorkspace) {
    const payload: ActiveClient = {
      id: client.id,
      companyName: client.companyName,
      tradingName: client.tradingName,
      packageName: client.packageName,
      status: client.status,
    };
    writeActiveClient(payload);
    setActiveClient(payload);
    setMessage(`Logged in as ${client.companyName}.`);
  }

  const checklist = [
    { label: "Company name captured", done: Boolean(form.companyName.trim()) },
    { label: "Trading name captured", done: Boolean(form.tradingName.trim() || form.companyName.trim()) },
    { label: "Package selected", done: Boolean(form.packageName) },
    { label: "User limit set", done: Number(form.userLimit) > 0 },
    { label: "Contact email added", done: Boolean(form.contactEmail.trim()) },
    { label: "Phone number added", done: Boolean(form.phone.trim()) },
  ];

  if (mode === "centre") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Developer Centre"
          subtitle="High-level overview of VYRON COST client workspaces and platform control."
        />

        <ActionBar
          onRefresh={refreshClients}
          onDeleteDemo={deleteDemoCompany}
          extra={
            <Link
              href="/developer/setup"
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
            >
              <Plus size={16} />
              New Client
            </Link>
          }
        />

        <ActiveWorkspaceBanner activeClient={activeClient} onClear={clearActiveClientStorage} setMessage={setMessage} />
        <FlashMessage message={message} activeClient={activeClient} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Total Clients", statusCounts.total, "bg-violet-50 text-violet-800"],
            ["Live", statusCounts.live, "bg-emerald-50 text-emerald-800"],
            ["Demo", statusCounts.demo, "bg-fuchsia-50 text-fuchsia-800"],
            ["In Setup", statusCounts.setup, "bg-slate-50 text-slate-800"],
            ["Suspended", statusCounts.suspended, "bg-amber-50 text-amber-800"],
          ].map(([label, value, tone]) => (
            <div key={label} className={`rounded-[1.75rem] p-5 ${tone}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">{label}</div>
              <div className="mt-2 text-3xl font-black">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Quick Actions</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Jump to the main developer workflows.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  { href: "/developer/clients", title: "Client Directory", note: "Search and manage existing workspaces", Icon: Users },
                  { href: "/developer/setup", title: "Client Setup", note: "Create a new client workspace", Icon: Plus },
                  { href: "/dashboard", title: "Open App", note: "Return to the active VYRON COST tenant view", Icon: ExternalLink },
                  { href: "/integrations/xero", title: "Xero Setup", note: "Configure accounting integration per client", Icon: Building2 },
                ] as const
              ).map(({ href, title, note, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 transition hover:border-violet-300 hover:bg-violet-50"
                >
                  <Icon size={20} className="text-violet-700" />
                  <div className="mt-3 font-black text-slate-900">{title}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <h2 className="text-2xl font-black text-slate-900">Setup Notes</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Recent platform activity and onboarding reminders.</p>
            <ul className="mt-5 space-y-3">
              {setupNotes.map((note) => (
                <li key={note} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Client Register Summary</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Latest workspaces — open the directory for full management.</p>
            </div>
            <Link
              href="/developer/clients"
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-xs font-black text-violet-800"
            >
              View all clients
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {clients.slice(0, 5).map((client) => (
              <div
                key={client.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div>
                  <div className="font-black text-violet-700">{client.companyName}</div>
                  <div className="text-xs font-semibold text-slate-500">
                    {client.packageName} · {client.activeUsers}/{client.userLimit} users
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(client.status)}`}>
                    {client.status}
                  </span>
                  <span className={xeroClass(client.xeroStatus)}>{client.xeroStatus}</span>
                </div>
              </div>
            ))}
            {clients.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">No clients registered yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  if (mode === "clients") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client Directory"
          subtitle="Search and manage existing VYRON COST client workspaces."
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[260px] flex-1 items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm">
            <Search size={18} className="text-violet-700" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, email, package, ID…"
              className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={refreshClients}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
          <Link
            href="/developer/setup"
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
          >
            <Plus size={16} />
            Add Client
          </Link>
        </div>

        <FlashMessage message={message} activeClient={activeClient} />

        <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900">Client Register</h2>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
              {filteredClients.length} shown
            </span>
          </div>

          <ClientRegisterTable
            clients={filteredClients}
            selectedClientId={selectedClientId}
            onOpen={openClient}
            onEdit={startEditClient}
            onLogin={loginAsClient}
            onSuspend={suspendClient}
            onDelete={deleteClient}
            onStatusChange={updateStatus}
          />

          {selectedClient ? (
            <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">Selected workspace</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{selectedClient.companyName}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-600">
                    {selectedClient.contactEmail || "No contact email"} · {selectedClient.phone || "No phone"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditClient(selectedClient.id)}
                    className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white"
                  >
                    Edit in Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => loginAsClient(selectedClient)}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-black text-violet-800"
                  >
                    Login As Client
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Setup"
        subtitle={editingClientId ? "Update an existing client workspace." : "Create and onboard a new VYRON COST client workspace."}
      />

      <FlashMessage message={message} activeClient={activeClient} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section ref={newClientRef} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Plus size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">{editingClientId ? "Edit Client" : "New Client"}</h2>
              <p className="text-sm font-semibold text-slate-500">
                {editingClientId ? "Update workspace details and save back to the register." : "Add a new tenant to the platform register."}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Company Name"
              value={form.companyName}
              placeholder="Client legal company name"
              onChange={(value) => setForm((current) => ({ ...current, companyName: value }))}
            />
            <Field
              label="Trading Name"
              value={form.tradingName}
              placeholder="Trading name"
              onChange={(value) => setForm((current) => ({ ...current, tradingName: value }))}
            />
            <Field
              label="Contact Email"
              value={form.contactEmail}
              placeholder="admin@client.co.za"
              onChange={(value) => setForm((current) => ({ ...current, contactEmail: value }))}
            />
            <Field
              label="Phone"
              value={form.phone}
              placeholder="021 000 0000"
              onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
            />
            <label className="text-sm font-black text-slate-600">
              Package
              <select
                value={form.packageName}
                onChange={(event) => setForm((current) => ({ ...current, packageName: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-violet-400"
              >
                <option>Starter</option>
                <option>Professional</option>
                <option>Enterprise</option>
                <option>Demo</option>
              </select>
            </label>
            <NumberField
              label="User Limit"
              value={form.userLimit}
              onChange={(value) => setForm((current) => ({ ...current, userLimit: value }))}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={editingClientId ? saveEditedClient : addClient}
              className="rounded-2xl bg-violet-700 px-6 py-3 text-sm font-black text-white"
            >
              {editingClientId ? "Save Client" : "Create Client"}
            </button>
            {editingClientId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingClientId(null);
                  setForm(emptyForm);
                  sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
                }}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700"
              >
                Cancel Edit
              </button>
            ) : null}
            <Link
              href="/developer/clients"
              className="rounded-2xl border border-violet-200 bg-white px-6 py-3 text-sm font-black text-violet-800"
            >
              Open Directory
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-900">Setup Checklist</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Complete these items before marking the workspace Live.</p>
          <ul className="mt-5 space-y-3">
            {checklist.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                {item.done ? (
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                ) : (
                  <Circle size={18} className="shrink-0 text-slate-400" />
                )}
                {item.label}
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
            After creating the workspace, connect Xero from Integrations and assign modules from the Client Directory when the tenant goes live.
          </div>
        </section>
      </div>

      {recentSetupClients.length > 0 ? (
        <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">Recently Created</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Workspaces still in Setup — manage them from the directory.</p>
            </div>
            <Link href="/developer/clients" className="text-xs font-black text-violet-700 hover:underline">
              View directory
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {recentSetupClients.map((client) => (
              <div key={client.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="font-black text-violet-700">{client.companyName}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{client.packageName}</div>
                <button
                  type="button"
                  onClick={() => startEditClient(client.id)}
                  className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-violet-800"
                >
                  Continue setup
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <h1 className="text-3xl font-black text-slate-950 md:text-4xl">{title}</h1>
      <p className="mt-2 text-sm font-semibold text-slate-600">{subtitle}</p>
    </section>
  );
}

function ActionBar({
  onRefresh,
  onDeleteDemo,
  extra,
}: {
  onRefresh: () => void;
  onDeleteDemo: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
      >
        <RefreshCcw size={16} />
        Refresh Clients
      </button>
      {extra}
      <button
        type="button"
        onClick={onDeleteDemo}
        className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white"
      >
        <Trash2 size={16} />
        Delete Demo Company
      </button>
    </div>
  );
}

function ActiveWorkspaceBanner({
  activeClient,
  onClear,
  setMessage,
}: {
  activeClient: ActiveClient | null;
  onClear: () => void;
  setMessage: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
      <div className="text-sm font-bold text-violet-900">
        {activeClient ? (
          <>
            Active Workspace: <span className="font-black text-violet-700">{activeClient.companyName}</span>
          </>
        ) : (
          "No active client selected."
        )}
      </div>
      {activeClient ? (
        <button
          type="button"
          onClick={() => {
            onClear();
            setMessage("Active client cleared.");
          }}
          className="inline-flex items-center gap-1 rounded-xl border border-violet-300 bg-white px-4 py-2 text-xs font-black text-violet-800"
        >
          <X size={14} />
          Clear Active Client
        </button>
      ) : null}
    </div>
  );
}

function FlashMessage({
  message,
  activeClient,
}: {
  message: string | null;
  activeClient: ActiveClient | null;
}) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
      <div>{message}</div>
      {activeClient && message.startsWith("Logged in as") ? (
        <Link
          href="/dashboard"
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white"
        >
          <ExternalLink size={14} />
          Open Client Dashboard
        </Link>
      ) : null}
    </div>
  );
}

function ClientRegisterTable({
  clients,
  selectedClientId,
  onOpen,
  onEdit,
  onLogin,
  onSuspend,
  onDelete,
  onStatusChange,
}: {
  clients: ClientWorkspace[];
  selectedClientId: string | null;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onLogin: (client: ClientWorkspace) => void;
  onSuspend: (id: string) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: ClientStatus) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-100">
      <div className="grid min-w-[1080px] grid-cols-[1.4fr_1fr_0.85fr_0.55fr_1fr_380px] gap-3 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
        <div>Company</div>
        <div>Package</div>
        <div>Status</div>
        <div>Users</div>
        <div>Xero Status</div>
        <div>Actions</div>
      </div>

      {clients.length ? (
        clients.map((client) => (
          <div
            key={client.id}
            className={`grid min-w-[1080px] grid-cols-[1.4fr_1fr_0.85fr_0.55fr_1fr_380px] items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm ${
              selectedClientId === client.id ? "bg-violet-50/70" : "bg-white"
            }`}
          >
            <div>
              <div className="font-black text-violet-700">{client.companyName}</div>
              <div className="text-xs font-bold text-slate-500">
                {client.tradingName} · {client.id}
              </div>
            </div>
            <div className="font-bold text-slate-700">{client.packageName}</div>
            <div>
              <select
                value={client.status}
                onChange={(event) => onStatusChange(client.id, event.target.value as ClientStatus)}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-violet-700 outline-none focus:border-violet-400"
              >
                <option>Live</option>
                <option>Demo</option>
                <option>Setup</option>
                <option>Suspended</option>
              </select>
            </div>
            <div className="font-black text-slate-950">
              {client.activeUsers}/{client.userLimit}
            </div>
            <div>
              <span className={xeroClass(client.xeroStatus)}>{client.xeroStatus}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpen(client.id)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => onEdit(client.id)}
                className="inline-flex items-center gap-1 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-800"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onLogin(client)}
                className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800"
              >
                <LogIn size={14} />
                Login As Client
              </button>
              <button
                type="button"
                onClick={() => onSuspend(client.id)}
                className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-800"
              >
                Suspend
              </button>
              <button
                type="button"
                onClick={() => onDelete(client.id)}
                className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="border-t border-slate-100 px-5 py-10 text-center text-sm font-black text-slate-500">
          No clients match your search.
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-black text-slate-600">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none placeholder:text-slate-400 focus:border-violet-400"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-black text-slate-600">
      {label}
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
      />
    </label>
  );
}
