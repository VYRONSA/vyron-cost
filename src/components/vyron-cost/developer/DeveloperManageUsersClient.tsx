"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Mail, Trash2, UserPlus } from "lucide-react";
import type { WorkspaceMember, WorkspaceRole } from "@/lib/vyron-saas-workspace";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MANAGER", "USER"];

type WorkspaceSummary = {
  id: string;
  companyName: string;
  tradingName: string;
  userLimit: number;
  activeUsers: number;
};

export default function DeveloperManageUsersClient({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    surname: "",
    email: "",
    mobile: "",
    role: "USER" as WorkspaceRole,
    method: "invite" as "invite" | "password",
    password: "",
    confirmPassword: "",
  });

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}`).then((r) => r.json()),
      fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}/users`).then((r) => r.json()),
    ])
      .then(([ws, users]) => {
        if (ws.ok) setWorkspace(ws.workspace);
        if (users.ok) setMembers(users.members);
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function inviteUser() {
    if (!inviteForm.firstName.trim() || !inviteForm.surname.trim() || !inviteForm.email.trim()) {
      setMessage("First name, surname and email are required.");
      return;
    }
    if (inviteForm.method === "password") {
      if (inviteForm.password.length < 8) {
        setMessage("Password must be at least 8 characters.");
        return;
      }
      if (inviteForm.password !== inviteForm.confirmPassword) {
        setMessage("Passwords do not match.");
        return;
      }
    }

    const res = await fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: inviteForm.firstName.trim(),
        surname: inviteForm.surname.trim(),
        email: inviteForm.email.trim(),
        mobile: inviteForm.mobile.trim(),
        role: inviteForm.role,
        method: inviteForm.method,
        password: inviteForm.method === "password" ? inviteForm.password : undefined,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Invite failed.");
      return;
    }
    setInviteOpen(false);
    setInviteForm({
      firstName: "",
      surname: "",
      email: "",
      mobile: "",
      role: "USER",
      method: "invite",
      password: "",
      confirmPassword: "",
    });
    setMessage(inviteForm.method === "invite" ? "Invitation sent." : "User created with temporary password.");
    refresh();
  }

  async function changeRole(userId: string, role: WorkspaceRole) {
    const res = await fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    setMessage(data.ok ? "Role updated." : data.error || "Role update failed.");
    if (data.ok) refresh();
  }

  async function disableUser(userId: string) {
    const res = await fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Disabled" }),
    });
    const data = await res.json();
    setMessage(data.ok ? "User disabled." : data.error || "Disable failed.");
    if (data.ok) refresh();
  }

  async function enableUser(userId: string) {
    const res = await fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Active" }),
    });
    const data = await res.json();
    setMessage(data.ok ? "User enabled." : data.error || "Enable failed.");
    if (data.ok) refresh();
  }

  async function deleteUser(userId: string) {
    if (!window.confirm("Delete this user from the workspace?")) return;
    const res = await fetch(`/api/developer/clients/${encodeURIComponent(workspaceId)}/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setMessage(data.ok ? "User deleted." : data.error || "Delete failed.");
    if (data.ok) refresh();
  }

  async function resetPassword(userId: string) {
    if (newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    const res = await fetch(
      `/api/developer/clients/${encodeURIComponent(workspaceId)}/users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      }
    );
    const data = await res.json();
    setMessage(data.ok ? "Password reset." : data.error || "Reset failed.");
    if (data.ok) {
      setResetUserId(null);
      setNewPassword("");
      refresh();
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <Link href="/developer/clients" className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
          <ArrowLeft size={16} />
          Back to Client Directory
        </Link>
        <h1 className="mt-4 text-3xl font-black text-slate-950">Manage Users</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          {workspace?.companyName || workspaceName}
          {workspace ? ` · ${workspace.activeUsers}/${workspace.userLimit} users` : ""}
        </p>
      </section>

      {message ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">{message}</div>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-slate-900">Workspace users</h2>
          <button
            type="button"
            onClick={() => setInviteOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white"
          >
            <UserPlus size={16} />
            Invite User
          </button>
        </div>

        {inviteOpen ? (
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-violet-700">Invite User</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="First Name" value={inviteForm.firstName} onChange={(v) => setInviteForm((c) => ({ ...c, firstName: v }))} />
              <Field label="Surname" value={inviteForm.surname} onChange={(v) => setInviteForm((c) => ({ ...c, surname: v }))} />
              <Field label="Email" value={inviteForm.email} onChange={(v) => setInviteForm((c) => ({ ...c, email: v }))} />
              <Field label="Mobile" value={inviteForm.mobile} onChange={(v) => setInviteForm((c) => ({ ...c, mobile: v }))} />
              <label className="text-sm font-black text-slate-600">
                Role
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((c) => ({ ...c, role: e.target.value as WorkspaceRole }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none"
                >
                  {ROLES.filter((r) => r !== "OWNER").map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-black text-slate-600">
                Login setup
                <select
                  value={inviteForm.method}
                  onChange={(e) => setInviteForm((c) => ({ ...c, method: e.target.value as "invite" | "password" }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none"
                >
                  <option value="invite">Send Invitation Email</option>
                  <option value="password">Create Temporary Password</option>
                </select>
              </label>
              {inviteForm.method === "password" ? (
                <>
                  <Field label="Password" type="password" value={inviteForm.password} onChange={(v) => setInviteForm((c) => ({ ...c, password: v }))} />
                  <Field label="Confirm Password" type="password" value={inviteForm.confirmPassword} onChange={(v) => setInviteForm((c) => ({ ...c, confirmPassword: v }))} />
                </>
              ) : null}
            </div>
            <button type="button" onClick={() => void inviteUser()} className="mt-4 rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
              Send Invite
            </button>
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-100">
          {loading ? (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Loading users…</div>
          ) : members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">No users in this workspace yet.</div>
          ) : (
            <>
              <div className="grid min-w-[960px] grid-cols-[1.2fr_1fr_0.7fr_0.7fr_320px] gap-3 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <div>Name</div>
                <div>Email</div>
                <div>Role</div>
                <div>Status</div>
                <div>Actions</div>
              </div>
              {members.map((member) => (
                <div
                  key={member.membershipId}
                  className="grid min-w-[960px] grid-cols-[1.2fr_1fr_0.7fr_0.7fr_320px] items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm"
                >
                  <div>
                    <div className="font-black text-slate-900">
                      {member.firstName} {member.surname}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">{member.mobile || "No mobile"}</div>
                  </div>
                  <div className="font-semibold text-slate-700">{member.email}</div>
                  <div>
                    {member.role === "OWNER" ? (
                      <span className="font-black text-violet-700">OWNER</span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(e) => void changeRole(member.userId, e.target.value as WorkspaceRole)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-violet-700 outline-none"
                      >
                        {ROLES.filter((r) => r !== "OWNER").map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="font-bold text-slate-700">{member.status}</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setResetUserId(member.userId)}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                    >
                      <KeyRound size={14} />
                      Reset
                    </button>
                    {member.status === "Disabled" ? (
                      <button type="button" onClick={() => void enableUser(member.userId)} className="rounded-xl border border-[#A855F7]/25 bg-[#A855F7]/12 px-3 py-2 text-xs font-black text-[#4D7C0F]">
                        Enable
                      </button>
                    ) : member.role !== "OWNER" ? (
                      <button type="button" onClick={() => void disableUser(member.userId)} className="rounded-xl bg-fuchsia-100 px-3 py-2 text-xs font-black text-fuchsia-800">
                        Disable
                      </button>
                    ) : null}
                    {member.role !== "OWNER" ? (
                      <button
                        type="button"
                        onClick={() => void deleteUser(member.userId)}
                        className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    ) : null}
                  </div>
                  {resetUserId === member.userId ? (
                    <div className="col-span-full mt-2 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
                      <button type="button" onClick={() => void resetPassword(member.userId)} className="rounded-xl vyron-grad-surface px-4 py-3 text-xs font-semibold text-white">
                        Save Password
                      </button>
                      <button type="button" onClick={() => setResetUserId(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700">
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
        <Mail size={14} className="mr-1 inline text-violet-600" />
        Invitation emails use Supabase Auth when service role is configured. Temporary passwords allow immediate login at /login.
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Developer Manage Users",
        subtitle: "Premium VYRON COST workflow for developer manage users.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <label className="text-sm font-black text-slate-600">
            {label}
            <input
              type={type}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
            />
          </label>
    </VyronPremiumPageShell>
  );
}
