"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Archive,
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  ExternalLink,
  KeyRound,
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
  type ClientLoginDisplayStatus,
} from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { bootstrapWorkspaceSession, writeWorkspaceSession } from "@/lib/vyron-workspace-session";

type ClientStatus = "Active" | "Setup" | "Demo" | "Suspended" | "Archived";
type XeroStatus = "Connected" | "Not Connected" | "Setup Required";
type OwnerLoginStatus = "active" | "invited" | "pending_activation" | "disabled";
type DirectoryView = "active" | "archived" | "all";
type StatusFilter = ClientStatus | "All";
export type DeveloperMode = "centre" | "clients" | "setup";

type ServerWorkspaceStatus = {
  ok: boolean;
  hasActiveClientCookie: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  companyLinked: boolean;
  xeroWorkspaceReady: boolean;
};

const PACKAGE_OPTIONS = ["Starter", "Professional", "Enterprise", "Demo", "Professional Demo"] as const;

type WorkspaceOwner = {
  firstName: string;
  surname: string;
  email: string;
  mobile: string;
  loginMethod: "invite" | "password";
  loginStatus: OwnerLoginStatus;
};

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
  owner?: WorkspaceOwner;
  ownerUserId?: string | null;
  companyId?: string | null;
};

const emptyForm = {
  companyName: "",
  tradingName: "",
  packageName: "Professional",
  userLimit: 5,
  contactEmail: "",
  phone: "",
};

const emptyAdminForm = {
  firstName: "",
  surname: "",
  email: "",
  mobile: "",
  loginMethod: "password" as "invite" | "password",
  password: "",
  confirmPassword: "",
};

const defaultModules = ["Costing", "Procurement", "Inventory", "Reports"];

const initialClients: ClientWorkspace[] = [];

function normalizeStatus(status: string): ClientStatus {
  if (status === "Live") return "Active";
  if (status === "Active" || status === "Setup" || status === "Demo" || status === "Suspended" || status === "Archived") {
    return status;
  }
  return "Setup";
}

function normalizeClient(client: ClientWorkspace): ClientWorkspace {
  const normalized: ClientWorkspace = {
    ...client,
    status: normalizeStatus(client.status),
    owner: client.owner || {
      firstName: "",
      surname: "",
      email: client.contactEmail || "",
      mobile: client.phone || "",
      loginMethod: "password",
      loginStatus: "pending_activation",
    },
  };
  return normalized;
}

function mapApiClientStatus(status: string): ClientStatus {
  return normalizeStatus(status);
}

function ownerDisplayName(owner?: WorkspaceOwner) {
  if (!owner) return "—";
  const name = `${owner.firstName} ${owner.surname}`.trim();
  return name || owner.email || "—";
}

function clientLoginDisplayStatus(client: ClientWorkspace): ClientLoginDisplayStatus {
  if (client.owner?.loginStatus === "disabled") return "disabled_login";
  if (client.ownerUserId && (client.owner?.loginStatus === "active" || client.owner?.loginStatus === "invited")) {
    return "active_login";
  }
  return "no_login_created";
}

function clientLoginDisplayLabel(status: ClientLoginDisplayStatus) {
  if (status === "active_login") return "LOGIN ACTIVE";
  if (status === "disabled_login") return "DISABLED LOGIN";
  return "NO LOGIN CREATED";
}

function mapWorkspaceToClient(ws: Record<string, unknown>): ClientWorkspace {
  const owner = (ws.owner || {}) as WorkspaceOwner;
  const status = mapApiClientStatus(String(ws.status || "Setup"));
  const ownerUserId = ws.ownerUserId ? String(ws.ownerUserId) : null;
  return {
    id: String(ws.id),
    companyName: String(ws.companyName || ""),
    tradingName: String(ws.tradingName || ws.companyName || ""),
    packageName: String(ws.packageName || "Professional"),
    status,
    userLimit: Number(ws.userLimit || 5),
    companyLimit: 1,
    storageLimit: "25 GB",
    activeUsers: Number(ws.activeUsers || 0),
    contactEmail: String(ws.contactEmail || owner.email || ""),
    phone: String(ws.phone || ""),
    xeroStatus: "Setup Required",
    enabledModules: [...defaultModules],
    ownerUserId,
    companyId: ws.companyId ? String(ws.companyId) : null,
    owner: {
      firstName: String(owner.firstName || ""),
      surname: String(owner.surname || ""),
      email: String(owner.email || ws.contactEmail || ""),
      mobile: String(owner.mobile || ""),
      loginMethod: owner.loginMethod || "password",
      loginStatus: owner.loginStatus || "pending_activation",
    },
  };
}

async function fetchWorkspaceClient(clientId: string): Promise<ClientWorkspace | null> {
  const response = await fetch(`/api/developer/clients/${encodeURIComponent(clientId)}`);
  const data = await response.json();
  if (!data.ok || !data.workspace) return null;
  return mapWorkspaceToClient(data.workspace as Record<string, unknown>);
}

function clientLoginDisplayClass(status: ClientLoginDisplayStatus) {
  if (status === "active_login") return "rounded-full bg-[#A855F7]/12 px-3 py-1 text-xs font-black text-[#4D7C0F]";
  if (status === "disabled_login") return "rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800";
  return "rounded-full bg-[var(--vyron-warning-bg)] px-3 py-1 text-xs font-black text-[var(--vyron-warning-fg)]";
}

function readStoredClients(): ClientWorkspace[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(DEVELOPER_CLIENTS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as ClientWorkspace[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeClient)
      .filter((client) => client.status !== "Archived");
  } catch {
    return [];
  }
}

function buildOwnerFromAdmin(admin: typeof emptyAdminForm, loginStatus: OwnerLoginStatus): WorkspaceOwner {
  return {
    firstName: admin.firstName.trim(),
    surname: admin.surname.trim(),
    email: admin.email.trim(),
    mobile: admin.mobile.trim(),
    loginMethod: admin.loginMethod,
    loginStatus,
  };
}

function toActiveClientPayload(client: ClientWorkspace, extra?: Partial<ActiveClient>): ActiveClient {
  const base: ActiveClient = {
    id: client.id,
    companyName: client.companyName,
    tradingName: client.tradingName,
    packageName: client.packageName,
    status: client.status,
    companyId: client.companyId ?? null,
    demoMode: isDemoWorkspace({
      id: client.id,
      companyName: client.companyName,
      tradingName: client.tradingName,
      packageName: client.packageName,
      status: client.status,
      companyId: client.companyId,
      demoMode: client.status === "Demo" ? true : undefined,
    }),
    ownerUserId: client.ownerUserId ?? null,
    ownerEmail: client.owner?.email,
    userLimit: client.userLimit,
    contactEmail: client.contactEmail,
    phone: client.phone,
    xeroStatus: client.xeroStatus,
  };
  return { ...base, ...extra };
}

function buildLocalClient(
  form: typeof emptyForm,
  admin: typeof emptyAdminForm,
  clients: ClientWorkspace[],
  id?: string
): ClientWorkspace {
  const nextIndex = clients.length + 1;
  return {
    id: id || `client-${String(nextIndex).padStart(3, "0")}`,
    companyName: form.companyName.trim(),
    tradingName: form.tradingName.trim() || form.companyName.trim(),
    packageName: form.packageName,
    status: "Setup",
    userLimit: Number(form.userLimit || 5),
    companyLimit: 1,
    storageLimit: "25 GB",
    activeUsers: 0,
    contactEmail: form.contactEmail.trim() || admin.email.trim(),
    phone: form.phone.trim(),
    xeroStatus: "Setup Required",
    enabledModules: [...defaultModules],
    owner: buildOwnerFromAdmin(admin, "pending_activation"),
  };
}

function statusClass(status: ClientStatus) {
  if (status === "Active") return "bg-[#A855F7]/12 text-[#4D7C0F]";
  if (status === "Demo") return "bg-violet-100 text-violet-800";
  if (status === "Suspended") return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  if (status === "Archived") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function validateAdminForm(admin: typeof emptyAdminForm, requirePassword = false) {
  if (!admin.firstName.trim() || !admin.surname.trim()) {
    alert("Please enter the primary administrator first name and surname.");
    return false;
  }
  if (!admin.email.trim()) {
    alert("Please enter the primary administrator email.");
    return false;
  }
  if (requirePassword || admin.password.length > 0 || admin.confirmPassword.length > 0) {
    if (admin.loginMethod === "password") {
      if (admin.password.length < 8) {
        alert("Password must be at least 8 characters.");
        return false;
      }
      if (admin.password !== admin.confirmPassword) {
        alert("Passwords do not match.");
        return false;
      }
    }
  }
  return true;
}

function xeroClass(status: XeroStatus) {
  if (status === "Connected") return "rounded-full bg-[#A855F7]/12 px-3 py-1 text-xs font-black text-[#4D7C0F]";
  if (status === "Setup Required") return "rounded-full bg-[var(--vyron-warning-bg)] px-3 py-1 text-xs font-black text-[var(--vyron-warning-fg)]";
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
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [saving, setSaving] = useState(false);
  const [activeClient, setActiveClient] = useState<ActiveClient | null>(null);
  const [search, setSearch] = useState("");
  const [directoryView, setDirectoryView] = useState<DirectoryView>("active");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [packageFilter, setPackageFilter] = useState<string>("All");
  const [manageLoginClientId, setManageLoginClientId] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState(emptyAdminForm);
  const [loginSaving, setLoginSaving] = useState(false);
  const [usesApiRegistry, setUsesApiRegistry] = useState(false);
  const [directoryActionId, setDirectoryActionId] = useState<string | null>(null);
  const [serverWorkspaceStatus, setServerWorkspaceStatus] = useState<ServerWorkspaceStatus | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const manageLoginClient = clients.find((client) => client.id === manageLoginClientId) ?? null;

  const packageOptions = useMemo(() => {
    const fromClients = clients.map((client) => client.packageName).filter(Boolean);
    return Array.from(new Set([...PACKAGE_OPTIONS, ...fromClients]));
  }, [clients]);

  const filteredClients = useMemo(() => {
    let list = clients;

    if (directoryView === "active") list = list.filter((client) => client.status !== "Archived");
    else if (directoryView === "archived") list = list.filter((client) => client.status === "Archived");

    if (statusFilter !== "All") list = list.filter((client) => client.status === statusFilter);
    if (packageFilter !== "All") list = list.filter((client) => client.packageName === packageFilter);

    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((client) =>
        [
          client.companyName,
          client.tradingName,
          client.id,
          client.contactEmail,
          client.packageName,
          client.owner?.firstName,
          client.owner?.surname,
          client.owner?.email,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }
    return list;
  }, [clients, search, directoryView, statusFilter, packageFilter]);

  const statusCounts = useMemo(
    () => ({
      total: clients.filter((c) => c.status !== "Archived").length,
      active: clients.filter((c) => c.status === "Active").length,
      demo: clients.filter((c) => c.status === "Demo").length,
      setup: clients.filter((c) => c.status === "Setup").length,
      suspended: clients.filter((c) => c.status === "Suspended").length,
      archived: clients.filter((c) => c.status === "Archived").length,
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

  async function reloadClientsFromApi() {
    const response = await fetch("/api/developer/clients", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await response.json().catch(() => null);

    // A lapsed platform session returns 401 {ok:false}. Treating that as "no
    // clients" renders an empty directory that is indistinguishable from real
    // data — send the operator back to sign in instead of showing 0.
    if (response.status === 401) {
      window.location.href = `/developer-login?next=${encodeURIComponent(
        "/developer/clients"
      )}&error=${encodeURIComponent("Developer session expired. Please sign in again.")}`;
      return true;
    }

    if (response.status === 403) {
      throw new Error("You do not have permission to access Developer Centre.");
    }

    // Any other failure must surface, not silently collapse to an empty list.
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Client directory request failed (HTTP ${response.status}).`);
    }

    if (data.ok && Array.isArray(data.workspaces)) {
      setDirectoryError(null);
      const mapped = data.workspaces.map((ws: Record<string, unknown>) => mapWorkspaceToClient(ws));

      setClients(mapped);
      setUsesApiRegistry(true);

      try {
        localStorage.removeItem(DEVELOPER_CLIENTS_KEY);
      } catch {
        // Ignore local cleanup failure.
      }

      return true;
    }

    return false;
  }

  useEffect(() => {
    async function hydrateClients() {
      const stored = readStoredClients();
      try {
        const loaded = await reloadClientsFromApi();
        if (!loaded) {
          setClients(stored);
          setUsesApiRegistry(false);
        }
      } catch (error) {
        // Never let a transport or server failure masquerade as an empty
        // directory. Surface it and keep whatever list we last held.
        setDirectoryError(
          error instanceof Error ? error.message : "Could not load the client directory."
        );
        if (stored.length) {
          setClients(stored);
          setUsesApiRegistry(false);
        }
      }

      setActiveClient(readActiveClient());
      const storedSelected = sessionStorage.getItem(DEVELOPER_SELECTED_CLIENT_KEY);
      const storedEditing = sessionStorage.getItem(DEVELOPER_EDITING_CLIENT_KEY);
      if (storedSelected) setSelectedClientId(storedSelected);
      if (storedEditing) setEditingClientId(storedEditing);
      setHydrated(true);
    }

    void hydrateClients();
  }, []);

  useEffect(() => {
    if (mode !== "clients") return;

    fetch("/api/workspace/status", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (data?.ok) {
          setServerWorkspaceStatus(data as ServerWorkspaceStatus);
        }
      })
      .catch(() => {
        setServerWorkspaceStatus(null);
      });
  }, [mode, selectedClientId, activeClient]);

  useEffect(() => {
    if (!hydrated || usesApiRegistry) return;
    localStorage.setItem(DEVELOPER_CLIENTS_KEY, JSON.stringify(clients));
  }, [clients, hydrated, usesApiRegistry]);

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
    if (client.owner) {
      setAdminForm({
        firstName: client.owner.firstName,
        surname: client.owner.surname,
        email: client.owner.email,
        mobile: client.owner.mobile,
        loginMethod: client.owner.loginMethod,
        password: "",
        confirmPassword: "",
      });
    } else {
      setAdminForm(emptyAdminForm);
    }
  }, [editingClientId, clients]);

  useEffect(() => {
    if (!manageLoginClient?.owner) {
      setLoginForm(emptyAdminForm);
      return;
    }
    setLoginForm({
      firstName: manageLoginClient.owner.firstName,
      surname: manageLoginClient.owner.surname,
      email: manageLoginClient.owner.email,
      mobile: manageLoginClient.owner.mobile,
      loginMethod: manageLoginClient.owner.loginMethod,
      password: "",
      confirmPassword: "",
    });
  }, [manageLoginClient]);

  function finishClientCreate(client: ClientWorkspace, successMessage: string) {
    setUsesApiRegistry(true);
    setClients((current) => [client, ...current]);
    setSelectedClientId(client.id);
    setEditingClientId(null);
    sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
    setForm(emptyForm);
    setAdminForm(emptyAdminForm);
    setMessage(successMessage);
  }

  function updateClientOwner(
    clientId: string,
    owner: WorkspaceOwner,
    successMessage: string,
    ownerUserId?: string | null
  ) {
    setClients((current) =>
      current.map((client) =>
        client.id === clientId
          ? {
              ...client,
              owner,
              ownerUserId: ownerUserId !== undefined ? ownerUserId : client.ownerUserId,
              contactEmail: owner.email || client.contactEmail,
              activeUsers: clientLoginDisplayStatus({ ...client, owner, ownerUserId }) === "active_login" ? 1 : client.activeUsers,
            }
          : client
      )
    );
    setMessage(successMessage);
  }

  async function persistOwnerLogin(
    clientId: string,
    admin: typeof emptyAdminForm,
    action: "save" | "invite" | "password" | "disable" | "enable"
  ) {
    const res = await fetch(`/api/developer/clients/${encodeURIComponent(clientId)}/owner`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        admin: {
          firstName: admin.firstName.trim(),
          surname: admin.surname.trim(),
          email: admin.email.trim(),
          mobile: admin.mobile.trim(),
        },
        loginSetup: {
          method: admin.loginMethod,
          password: action === "password" ? admin.password || undefined : undefined,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.ownerDetails) {
      throw new Error(data.error || "Owner login update failed.");
    }

    updateClientOwner(
      clientId,
      {
        firstName: data.ownerDetails.firstName,
        surname: data.ownerDetails.surname,
        email: data.ownerDetails.email,
        mobile: data.ownerDetails.mobile,
        loginMethod: data.ownerDetails.loginMethod,
        loginStatus: data.ownerDetails.loginStatus,
      },
      data.message || "Owner login updated.",
      data.ownerUserId ?? null
    );

    const refreshed = await fetchWorkspaceClient(clientId);
    if (refreshed) {
      setClients((current) => current.map((client) => (client.id === clientId ? refreshed : client)));
    }
  }

  function openManageLogin(id: string) {
    setManageLoginClientId(id);
    setSelectedClientId(id);
    sessionStorage.setItem(DEVELOPER_SELECTED_CLIENT_KEY, id);
    setMessage(null);
  }

  function closeManageLogin() {
    setManageLoginClientId(null);
    setLoginForm(emptyAdminForm);
  }

  async function saveManageLoginDetails() {
    if (!manageLoginClientId || !validateAdminForm(loginForm)) return;
    setLoginSaving(true);
    setMessage(null);
    try {
      await persistOwnerLogin(manageLoginClientId, loginForm, "save");
      setLoginForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Owner login save failed.");
    } finally {
      setLoginSaving(false);
    }
  }

  async function sendManageLoginReset() {
    if (!manageLoginClientId || !validateAdminForm(loginForm)) return;
    setLoginForm((current) => ({ ...current, loginMethod: "invite" }));
    setLoginSaving(true);
    setMessage(null);
    try {
      await persistOwnerLogin(manageLoginClientId, { ...loginForm, loginMethod: "invite" }, "invite");
      setLoginForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation failed.");
    } finally {
      setLoginSaving(false);
    }
  }

  async function setManageLoginPassword() {
    if (!manageLoginClientId) return;
    const passwordForm = { ...loginForm, loginMethod: "password" as const };
    if (!validateAdminForm(passwordForm, true)) return;
    setLoginSaving(true);
    setMessage(null);
    try {
      await persistOwnerLogin(manageLoginClientId, passwordForm, "password");
      setLoginForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password setup failed.");
    } finally {
      setLoginSaving(false);
    }
  }

  async function disableManageLogin() {
    if (!manageLoginClientId || !validateAdminForm(loginForm)) return;
    setLoginSaving(true);
    setMessage(null);
    try {
      await persistOwnerLogin(manageLoginClientId, loginForm, "disable");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disable login failed.");
    } finally {
      setLoginSaving(false);
    }
  }

  async function enableManageLogin() {
    if (!manageLoginClientId || !validateAdminForm(loginForm)) return;
    setLoginSaving(true);
    setMessage(null);
    try {
      await persistOwnerLogin(manageLoginClientId, loginForm, "enable");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enable login failed.");
    } finally {
      setLoginSaving(false);
    }
  }

  async function createClientWithOwner() {
    if (!form.companyName.trim()) {
      alert("Please enter a company name.");
      return;
    }
    if (!validateAdminForm(adminForm, adminForm.loginMethod === "password")) return;

    setSaving(true);
    setMessage(null);
    const payload = {
      companyName: form.companyName.trim(),
      tradingName: form.tradingName.trim() || form.companyName.trim(),
      packageName: form.packageName,
      userLimit: Number(form.userLimit || 5),
      contactEmail: form.contactEmail.trim(),
      phone: form.phone.trim(),
      admin: {
        firstName: adminForm.firstName.trim(),
        surname: adminForm.surname.trim(),
        email: adminForm.email.trim(),
        mobile: adminForm.mobile.trim(),
      },
      loginSetup: {
        method: adminForm.loginMethod,
        password: adminForm.loginMethod === "password" ? adminForm.password : undefined,
      },
    };

    try {
      const res = await fetch("/api/developer/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.ok && data.workspace) {
        const ws = data.workspace;
        const ownerDetails = data.ownerDetails || ws.owner;
        const loginStatus: OwnerLoginStatus = ownerDetails?.loginStatus || "pending_activation";
        const ownerUserId = ws.ownerUserId || data.owner?.userId || null;
        const client: ClientWorkspace = {
          id: ws.id,
          companyName: ws.companyName,
          tradingName: ws.tradingName,
          packageName: ws.packageName,
          status: mapApiClientStatus(ws.status),
          userLimit: ws.userLimit,
          companyLimit: 1,
          storageLimit: "25 GB",
          activeUsers: data.authProvisioned ? 1 : 0,
          contactEmail: ws.contactEmail || adminForm.email.trim(),
          phone: ws.phone || form.phone.trim(),
          xeroStatus: "Setup Required",
          enabledModules: [...defaultModules],
          ownerUserId,
          companyId: ws.companyId || null,
          owner: ownerDetails
            ? {
                firstName: ownerDetails.firstName,
                surname: ownerDetails.surname,
                email: ownerDetails.email,
                mobile: ownerDetails.mobile,
                loginMethod: ownerDetails.loginMethod,
                loginStatus,
              }
            : buildOwnerFromAdmin(adminForm, loginStatus),
        };
        finishClientCreate(
          client,
          data.authProvisioned
            ? data.message || `${client.companyName} created with ACTIVE LOGIN.`
            : data.message || `${client.companyName} created. NO LOGIN CREATED — check Manage Login.`
        );
        return;
      }

      setMessage(data.error || "Client creation failed. Check Supabase configuration and try again.");
    } catch {
      setMessage("Network error while creating client. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEditedClient() {
    if (!editingClientId) return;
    if (!form.companyName.trim()) {
      alert("Please enter a company name.");
      return;
    }
    if (!validateAdminForm(adminForm, adminForm.password.length > 0)) return;

    const existing = clients.find((client) => client.id === editingClientId);
    const loginStatus: OwnerLoginStatus =
      adminForm.password.length >= 8
        ? "pending_activation"
        : existing?.owner?.loginStatus || "pending_activation";
    const owner = buildOwnerFromAdmin(adminForm, loginStatus);

    setClients((current) =>
      current.map((client) =>
        client.id === editingClientId
          ? {
              ...client,
              companyName: form.companyName.trim(),
              tradingName: form.tradingName.trim() || form.companyName.trim(),
              packageName: form.packageName,
              userLimit: Number(form.userLimit || 1),
              contactEmail: form.contactEmail.trim() || owner.email,
              phone: form.phone.trim(),
              owner,
            }
          : client
      )
    );

    try {
      if (adminForm.password.length >= 8) {
        await persistOwnerLogin(editingClientId, adminForm, "password");
      } else {
        await persistOwnerLogin(editingClientId, adminForm, "save");
      }
      setEditingClientId(null);
      setForm(emptyForm);
      setAdminForm(emptyAdminForm);
      sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Client workspace update failed.");
    }
  }

  function clearActiveClientStorage() {
    clearActiveClient();
    setActiveClient(null);
  }

  function clearClientSelection(id: string) {
    if (selectedClientId === id) setSelectedClientId(null);
    if (editingClientId === id) {
      setEditingClientId(null);
      setForm(emptyForm);
      sessionStorage.removeItem(DEVELOPER_EDITING_CLIENT_KEY);
    }
    if (manageLoginClientId === id) closeManageLogin();
    if (activeClient?.id === id) clearActiveClientStorage();
  }

  async function archiveClient(id: string) {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    if (!window.confirm("Archive this client workspace?")) return;

    if (!usesApiRegistry || id.startsWith("client-")) {
      setClients((current) =>
        current.map((item) => (item.id === id ? { ...item, status: "Archived" as ClientStatus } : item))
      );
      clearClientSelection(id);
      setMessage(`${client.companyName} archived locally.`);
      return;
    }

    setDirectoryActionId(id);
    try {
      const response = await fetch(`/api/developer/clients/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", archivedBy: "developer" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Archive failed.");
      }
      clearClientSelection(id);
      await reloadClientsFromApi();
      setMessage(data.message || `${client.companyName} archived.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Archive failed.");
    } finally {
      setDirectoryActionId(null);
    }
  }

  async function deleteClient(id: string) {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    if (!window.confirm("Permanently delete this client workspace? This cannot be undone.")) return;

    if (!usesApiRegistry || id.startsWith("client-")) {
      setClients((current) => current.filter((item) => item.id !== id));
      clearClientSelection(id);
      setMessage(`${client.companyName} removed from local register.`);
      return;
    }

    setDirectoryActionId(id);
    try {
      const response = await fetch(`/api/developer/clients/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Delete failed.");
      }
      clearClientSelection(id);
      await reloadClientsFromApi();
      if (data.mode === "archived") {
        setMessage(
          data.message ||
            `${client.companyName} could not be deleted and was archived because linked data exists.`
        );
      } else {
        setMessage(data.message || `${client.companyName} permanently deleted.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDirectoryActionId(null);
    }
  }

  async function refreshClients() {
    if (usesApiRegistry) {
      const loaded = await reloadClientsFromApi();
      setMessage(
        loaded
          ? `Client register refreshed from database at ${new Date().toLocaleString()}.`
          : "Could not refresh client register from database."
      );
      return;
    }
    setClients(readStoredClients());
    setMessage(`Client register refreshed at ${new Date().toLocaleString()}.`);
  }

  function deleteDemoCompany() {
    const demoClient = clients.find((client) => client.companyName === "Handcrafted Food Products");

    if (!demoClient) {
      setMessage("No demo company exists in the client register.");
      return;
    }

    if (!window.confirm("Delete the demo company Handcrafted Food Products from the developer register?")) return;

    setClients((current) => current.filter((client) => client.companyName !== "Handcrafted Food Products"));

    try {
      localStorage.removeItem(DEVELOPER_CLIENTS_KEY);
    } catch {
      // Ignore local cleanup failure.
    }

    if (selectedClientId && demoClient.id === selectedClientId) setSelectedClientId(null);
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
    if (client.owner) {
      setAdminForm({
        firstName: client.owner.firstName,
        surname: client.owner.surname,
        email: client.owner.email,
        mobile: client.owner.mobile,
        loginMethod: client.owner.loginMethod,
        password: "",
        confirmPassword: "",
      });
    }
    router.push("/developer/setup");
  }

  async function loginAsClient(client: ClientWorkspace) {
    if (client.status === "Archived") {
      alert("Archived clients cannot be used for Login As Client.");
      return;
    }
    if (clientLoginDisplayStatus(client) === "disabled_login") {
      alert("Owner login is disabled. Enable login from Manage Login first.");
      return;
    }

    setMessage(`Entering ${client.companyName}…`);
    window.location.href = `/api/developer/clients/${encodeURIComponent(client.id)}/login-as`;
  }

  const checklist = [
    { label: "Company name captured", done: Boolean(form.companyName.trim()) },
    { label: "Trading name captured", done: Boolean(form.tradingName.trim() || form.companyName.trim()) },
    { label: "Package selected", done: Boolean(form.packageName) },
    { label: "User limit set", done: Number(form.userLimit) > 0 },
    { label: "Primary admin named", done: Boolean(adminForm.firstName.trim() && adminForm.surname.trim()) },
    { label: "Primary admin email", done: Boolean(adminForm.email.trim()) },
    { label: "Login setup configured", done: adminForm.loginMethod === "invite" || adminForm.password.length >= 8 },
    { label: "Contact email added", done: Boolean(form.contactEmail.trim()) },
    { label: "Phone number added", done: Boolean(form.phone.trim()) },
  ];

  if (mode === "centre") {
    return (
      <div className="w-full max-w-full min-w-0 space-y-6 overflow-x-hidden">
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
              className="inline-flex items-center gap-2 rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              New Client
            </Link>
          }
        />

        <ActiveWorkspaceBanner activeClient={activeClient} onClear={clearActiveClientStorage} setMessage={setMessage} />
        <FlashMessage message={message} activeClient={activeClient} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Active Clients", statusCounts.total, "bg-violet-50 text-violet-800"],
            ["Live", statusCounts.active, "bg-[#A855F7]/10 text-[#4D7C0F]"],
            ["Demo", statusCounts.demo, "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"],
            ["In Setup", statusCounts.setup, "bg-slate-50 text-slate-800"],
            ["Suspended", statusCounts.suspended, "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"],
            ["Archived", statusCounts.archived, "bg-slate-100 text-slate-700"],
          ].map(([label, value, tone]) => (
            <div key={label} className={`rounded-[1.75rem] p-5 ${tone}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">{label}</div>
              <div className="mt-2 text-3xl font-black">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid w-full max-w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="w-full max-w-full min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
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

          <div className="w-full max-w-full min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
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
            {clients.filter((client) => client.status !== "Archived").slice(0, 5).map((client) => (
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
      <div className="w-full max-w-full min-w-0 space-y-6 overflow-x-hidden">
        <PageHeader
          title="Client Directory"
          subtitle="Search and manage existing VYRON COST client workspaces."
        />

        {directoryError ? (
          <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
            <p className="text-sm font-black text-rose-900">Client directory could not be refreshed</p>
            <p className="mt-1 text-sm font-semibold text-rose-700">{directoryError}</p>
            <p className="mt-1 text-xs font-semibold text-rose-600">
              Showing the last known list. This is not an empty directory.
            </p>
          </div>
        ) : null}

        <div className="w-full max-w-full min-w-0 rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-violet-100 bg-slate-50 px-4 py-3 sm:min-w-[240px]">
              <Search size={18} className="text-violet-700" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, email, package, ID…"
                className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
              />
            </div>
            <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="mt-1 block w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 sm:min-w-[140px]"
              >
                <option value="All">All</option>
                <option value="Active">Active</option>
                <option value="Setup">Setup</option>
                <option value="Demo">Demo</option>
                <option value="Suspended">Suspended</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Package
              <select
                value={packageFilter}
                onChange={(event) => setPackageFilter(event.target.value)}
                className="mt-1 block w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 sm:min-w-[160px]"
              >
                <option value="All">All</option>
                {packageOptions.map((pkg) => (
                  <option key={pkg} value={pkg}>
                    {pkg}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={refreshClients}
              className="inline-flex items-center gap-2 self-end rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
            <Link
              href="/developer/setup"
              className="inline-flex items-center gap-2 self-end rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              Add Client
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["active", "Active"],
                ["archived", "Archived"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDirectoryView(value)}
                className={`rounded-xl px-4 py-2 text-xs font-black ${
                  directoryView === value
                    ? "vyron-grad-surface text-white"
                    : "bg-violet-50 text-violet-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <FlashMessage message={message} activeClient={activeClient} />

        <section className="w-full max-w-full min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900">
              {directoryView === "archived" ? "Archived Clients" : "Client Register"}
            </h2>
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
            onManageLogin={openManageLogin}
            onArchive={archiveClient}
            onDelete={deleteClient}
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
                  {selectedClient.owner ? (
                    <div className="mt-3 rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">
                        Primary administrator
                      </div>
                      <div className="mt-1 font-black text-slate-900">{ownerDisplayName(selectedClient.owner)}</div>
                      <div className="mt-1 font-semibold text-slate-600">
                        {selectedClient.owner.email}
                        {selectedClient.owner.mobile ? ` · ${selectedClient.owner.mobile}` : ""}
                      </div>
                      <div className="mt-2">
                        <span className={clientLoginDisplayClass(clientLoginDisplayStatus(selectedClient))}>
                          {clientLoginDisplayLabel(clientLoginDisplayStatus(selectedClient))}
                        </span>
                        <div className="mt-2 text-xs font-semibold text-slate-500">
                          Workspace ID: {selectedClient.id}
                          <br />
                          Auth User ID: {selectedClient.ownerUserId || "—"}
                          <br />
                          Owner Email: {selectedClient.owner.email}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">
                      Workspace session debug
                    </div>
                    <dl className="mt-2 space-y-1">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Local selected workspace ID</dt>
                        <dd className="font-black text-slate-900">{selectedClient.id}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Server cookie workspace ID</dt>
                        <dd className="font-black text-slate-900">{serverWorkspaceStatus?.workspaceId || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Server company linked</dt>
                        <dd className="font-black text-slate-900">
                          {serverWorkspaceStatus?.companyLinked ? "Yes" : "No"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Xero workspace visible</dt>
                        <dd className="font-black text-slate-900">
                          {serverWorkspaceStatus?.xeroWorkspaceReady ? "Yes" : "No"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openManageLogin(selectedClient.id)}
                    className="rounded-xl vyron-grad-surface px-4 py-2 text-xs font-semibold text-white"
                  >
                    Manage Login
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditClient(selectedClient.id)}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-black text-violet-800"
                  >
                    Edit in Setup
                  </button>
                  {selectedClient.status !== "Archived" ? (
                    <button
                      type="button"
                      onClick={() => loginAsClient(selectedClient)}
                      className="rounded-xl bg-white px-4 py-2 text-xs font-black text-violet-800"
                    >
                      Login As Client
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {manageLoginClient ? (
          <ManageLoginModal
            client={manageLoginClient}
            loginForm={loginForm}
            setLoginForm={setLoginForm}
            saving={loginSaving}
            onClose={closeManageLogin}
            onSave={() => void saveManageLoginDetails()}
            onSendReset={() => void sendManageLoginReset()}
            onSetPassword={() => void setManageLoginPassword()}
            onDisable={() => void disableManageLogin()}
            onEnable={() => void enableManageLogin()}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-6 overflow-x-hidden">
      <PageHeader
        title="Client Setup"
        subtitle={editingClientId ? "Update an existing client workspace." : "Create and onboard a new VYRON COST client workspace."}
      />

      <FlashMessage message={message} activeClient={activeClient} />

      <div className="grid w-full max-w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section ref={newClientRef} className="w-full max-w-full min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
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

          <div className="mt-2 border-b border-slate-100 pb-2">
            <h3 className="text-lg font-black text-slate-900">Client Details</h3>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
          </div>

          <AdministratorSection
            adminForm={adminForm}
            setAdminForm={setAdminForm}
            editing={Boolean(editingClientId)}
          />

          <LoginSetupSection
            adminForm={adminForm}
            setAdminForm={setAdminForm}
            radioName={editingClientId ? "editLoginSetup" : "loginSetup"}
            inviteLabel={editingClientId ? "Send Password Reset / Invitation" : "Option 1: Send Invitation Email"}
            passwordLabel={editingClientId ? "Create New Temporary Password" : "Option 2: Create Temporary Password"}
          />

          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="text-lg font-black text-slate-900">Package &amp; Limits</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-black text-slate-600">
                Package
                <select
                  value={form.packageName}
                  onChange={(event) => setForm((current) => ({ ...current, packageName: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-violet-400"
                >
                  {PACKAGE_OPTIONS.map((pkg) => (
                    <option key={pkg} value={pkg}>
                      {pkg}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="User Limit"
                value={form.userLimit}
                onChange={(value) => setForm((current) => ({ ...current, userLimit: value }))}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void (editingClientId ? saveEditedClient() : createClientWithOwner())}
              disabled={saving}
              className="rounded-2xl bg-violet-700 px-6 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
            >
              {saving ? "Saving…" : editingClientId ? "Save Client" : "Save Client"}
            </button>
            {editingClientId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingClientId(null);
                  setForm(emptyForm);
                  setAdminForm(emptyAdminForm);
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

        <section className="w-full max-w-full min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <h2 className="text-2xl font-black text-slate-900">Setup Checklist</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Complete these items before marking the workspace Live.</p>
          <ul className="mt-5 space-y-3">
            {checklist.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                {item.done ? (
                  <CheckCircle2 size={18} className="shrink-0 text-[#84CC16]" />
                ) : (
                  <Circle size={18} className="shrink-0 text-slate-400" />
                )}
                {item.label}
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-3 text-xs font-semibold text-[var(--vyron-warning-fg)]">
            Save Client creates the workspace, auth user, profile, OWNER membership and login credentials. Then connect Xero from Integrations when the tenant goes live.
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
    <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-bold text-[var(--vyron-success-fg)]">
      <div>{message}</div>
      {activeClient && message.startsWith("Logged in as") ? (
        <Link
          href="/dashboard"
          className="mt-3 inline-flex items-center gap-2 rounded-xl vyron-grad-surface px-4 py-2 text-xs font-semibold text-white"
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
  onManageLogin,
  onArchive,
  onDelete,
}: {
  clients: ClientWorkspace[];
  selectedClientId: string | null;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onLogin: (client: ClientWorkspace) => void;
  onManageLogin: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-3xl border border-slate-100">
      <div className="grid min-w-[1180px] grid-cols-[1fr_1fr_0.75fr_0.7fr_0.55fr_0.75fr_420px] gap-3 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
        <div>Company</div>
        <div>Primary Admin</div>
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
            className={`grid min-w-[1180px] grid-cols-[1fr_1fr_0.75fr_0.7fr_0.55fr_0.75fr_420px] items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm ${
              selectedClientId === client.id ? "bg-violet-50/70" : "bg-white"
            }`}
          >
            <div>
              <div className="font-black text-violet-700">{client.companyName}</div>
              <div className="text-xs font-bold text-slate-500">
                {client.tradingName} · {client.id}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-800">{ownerDisplayName(client.owner)}</div>
              <div className="text-xs font-semibold text-slate-500">{client.owner?.email || "—"}</div>
              <div className="mt-1">
                <span className={clientLoginDisplayClass(clientLoginDisplayStatus(client))}>
                  {clientLoginDisplayLabel(clientLoginDisplayStatus(client))}
                </span>
              </div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">
                WS: {client.id.slice(0, 12)}{client.id.length > 12 ? "…" : ""}
                <br />
                Auth: {client.ownerUserId ? `${client.ownerUserId.slice(0, 8)}…` : "—"}
              </div>
            </div>
            <div className="font-bold text-slate-700">{client.packageName}</div>
            <div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusClass(client.status)}`}>
                {client.status}
              </span>
            </div>
            <div className="font-black text-slate-950">
              {client.activeUsers}/{client.userLimit}
            </div>
            <div>
              <span className={xeroClass(client.xeroStatus)}>{client.xeroStatus}</span>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
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
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-800"
              >
                <Pencil size={14} />
                Edit
              </button>
              {client.status !== "Archived" ? (
                <button
                  type="button"
                  onClick={() => onLogin(client)}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800"
                >
                  <LogIn size={14} />
                  Login As Client
                </button>
              ) : (
                <span className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-black text-slate-500">
                  Login disabled
                </span>
              )}
              <button
                type="button"
                onClick={() => onManageLogin(client.id)}
                className="inline-flex items-center justify-center gap-1 rounded-xl vyron-grad-surface px-3 py-2 text-xs font-semibold text-white"
              >
                <KeyRound size={14} />
                Manage Login
              </button>
              {client.status !== "Archived" ? (
                <button
                  type="button"
                  onClick={() => onArchive(client.id)}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[var(--vyron-warning-bg)] px-3 py-2 text-xs font-black text-[var(--vyron-warning-fg)]"
                >
                  <Archive size={14} />
                  Archive
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDelete(client.id)}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
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

function AdministratorSection({
  adminForm,
  setAdminForm,
  editing,
}: {
  adminForm: typeof emptyAdminForm;
  setAdminForm: Dispatch<SetStateAction<typeof emptyAdminForm>>;
  editing: boolean;
}) {
  return (
    <div className="mt-8 border-t border-slate-100 pt-6">
      <h3 className="text-lg font-black text-slate-900">Primary Administrator</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">
        {editing
          ? "Update the workspace owner details and login credentials."
          : "Workspace owner — receives OWNER role when auth is provisioned."}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field
          label="First Name"
          value={adminForm.firstName}
          placeholder="Jane"
          onChange={(value) => setAdminForm((current) => ({ ...current, firstName: value }))}
        />
        <Field
          label="Surname"
          value={adminForm.surname}
          placeholder="Smith"
          onChange={(value) => setAdminForm((current) => ({ ...current, surname: value }))}
        />
        <Field
          label="Email Address"
          value={adminForm.email}
          placeholder="owner@client.co.za"
          onChange={(value) => setAdminForm((current) => ({ ...current, email: value }))}
        />
        <Field
          label="Mobile Number"
          value={adminForm.mobile}
          placeholder="082 000 0000"
          onChange={(value) => setAdminForm((current) => ({ ...current, mobile: value }))}
        />
      </div>
    </div>
  );
}

function LoginSetupSection({
  adminForm,
  setAdminForm,
  radioName,
  inviteLabel,
  passwordLabel,
}: {
  adminForm: typeof emptyAdminForm;
  setAdminForm: Dispatch<SetStateAction<typeof emptyAdminForm>>;
  radioName: string;
  inviteLabel: string;
  passwordLabel: string;
}) {
  return (
    <div className="mt-8 border-t border-slate-100 pt-6">
      <h3 className="text-lg font-black text-slate-900">Login Setup</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <input
            type="radio"
            name={radioName}
            checked={adminForm.loginMethod === "invite"}
            onChange={() => setAdminForm((current) => ({ ...current, loginMethod: "invite" }))}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-black text-slate-900">{inviteLabel}</span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              Sends a secure invite or reset link to the administrator.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <input
            type="radio"
            name={radioName}
            checked={adminForm.loginMethod === "password"}
            onChange={() => setAdminForm((current) => ({ ...current, loginMethod: "password" }))}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-black text-slate-900">{passwordLabel}</span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              Set a temporary password the owner can use at /login.
            </span>
          </span>
        </label>
      </div>
      {adminForm.loginMethod === "password" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label="Password"
            value={adminForm.password}
            placeholder="Minimum 8 characters"
            type="password"
            onChange={(value) => setAdminForm((current) => ({ ...current, password: value }))}
          />
          <Field
            label="Confirm Password"
            value={adminForm.confirmPassword}
            placeholder="Re-enter password"
            type="password"
            onChange={(value) => setAdminForm((current) => ({ ...current, confirmPassword: value }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function ManageLoginModal({
  client,
  loginForm,
  setLoginForm,
  saving,
  onClose,
  onSave,
  onSendReset,
  onSetPassword,
  onDisable,
  onEnable,
}: {
  client: ClientWorkspace;
  loginForm: typeof emptyAdminForm;
  setLoginForm: Dispatch<SetStateAction<typeof emptyAdminForm>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onSendReset: () => void;
  onSetPassword: () => void;
  onDisable: () => void;
  onEnable: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">Manage Login</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{client.companyName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{client.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <span className={clientLoginDisplayClass(clientLoginDisplayStatus(client))}>
            {clientLoginDisplayLabel(clientLoginDisplayStatus(client))}
          </span>
          <div className="text-xs font-semibold text-slate-500">
            Workspace ID: {client.id}
            <br />
            Auth User ID: {client.ownerUserId || "—"}
            <br />
            Owner Email: {client.owner?.email || "—"}
          </div>
        </div>

        <div className="mt-6">
          <AdministratorSection adminForm={loginForm} setAdminForm={setLoginForm} editing />
        </div>

        <LoginSetupSection
          adminForm={loginForm}
          setAdminForm={setLoginForm}
          radioName="manageLoginSetup"
          inviteLabel="Send Password Reset / Invitation"
          passwordLabel="Create New Temporary Password"
        />

        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Login Details"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSendReset}
            className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-800 disabled:opacity-60"
          >
            Send Reset Link
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSetPassword}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 disabled:opacity-60"
          >
            Set Temporary Password
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDisable}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-800 disabled:opacity-60"
          >
            Disable Login
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onEnable}
            className="rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/10 px-5 py-3 text-sm font-black text-[#4D7C0F] disabled:opacity-60"
          >
            Enable Login
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm font-black text-slate-600">
      {label}
      <input
        type={type}
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
