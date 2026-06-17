"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import type { WorkspaceMember, WorkspaceRole } from "@/lib/vyron-saas-workspace";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  ASSIGNABLE_ROLES,
  PERMISSION_GROUPS,
  defaultPermissionsForRole,
  normalizePermissionMap,
  resolveEffectivePermissions,
} from "@/lib/vyron-workspace-permissions";

export default function ClientUserSetupClient() {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [userLimit, setUserLimit] = useState(5);
  const [activeUsers, setActiveUsers] = useState(0);
  const [canCreateUser, setCanCreateUser] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rightsUserId, setRightsUserId] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    surname: "",
    email: "",
    mobile: "",
    role: "VIEW_ONLY" as WorkspaceRole,
    method: "password" as "invite" | "password",
    password: "",
    confirmPassword: "",
  });
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/workspace/admin/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setMembers(data.members);
          setUserLimit(data.userLimit);
          setActiveUsers(data.activeUsers);
          setCanCreateUser(data.canCreateUser);
        } else {
          setMessage(data.error || "Failed to load users.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rightsMember = useMemo(
    () => members.find((member) => member.userId === rightsUserId) || null,
    [members, rightsUserId]
  );

  useEffect(() => {
    if (!rightsMember) return;
    setCustomPermissions(resolveEffectivePermissions(rightsMember.role, rightsMember.permissions));
  }, [rightsMember]);

  async function createUser() {
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

    const res = await fetch("/api/workspace/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...inviteForm,
        permissions: defaultPermissionsForRole(inviteForm.role),
        confirmPassword: inviteForm.confirmPassword,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "User creation failed.");
      return;
    }
    setInviteOpen(false);
    setInviteForm({
      firstName: "",
      surname: "",
      email: "",
      mobile: "",
      role: "VIEW_ONLY",
      method: "password",
      password: "",
      confirmPassword: "",
    });
    setMessage("User created.");
    refresh();
  }

  async function patchUser(userId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/workspace/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMessage(data.ok ? "User updated." : data.error || "Update failed.");
    if (data.ok) refresh();
  }

  async function resetPassword(userId: string) {
    if (newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    const res = await fetch(`/api/workspace/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword, confirmPassword }),
    });
    const data = await res.json();
    setMessage(data.ok ? "Password reset." : data.error || "Password reset failed.");
    if (data.ok) {
      setResetUserId(null);
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  if (loading) return <div className="text-sm font-semibold text-slate-500">Loading users…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-950">Workspace users</div>
          <div className="text-xs font-semibold text-slate-500">
            {activeUsers} of {userLimit} users active
          </div>
        </div>
        <button
          type="button"
          disabled={!canCreateUser}
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus size={16} />
          Create User
        </button>
      </div>

      {!canCreateUser ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          User limit reached for this package. Upgrade package to add more users.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">
          {message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-violet-50 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} className="border-t border-violet-50">
                <td className="px-4 py-3 font-bold">{member.firstName} {member.surname}</td>
                <td className="px-4 py-3">{member.email}</td>
                <td className="px-4 py-3">
                  {member.role === "OWNER" ? (
                    <span className="font-black text-violet-700">OWNER</span>
                  ) : (
                    <select
                      value={member.role}
                      onChange={(e) => void patchUser(member.userId, { role: e.target.value })}
                      className="rounded-lg border border-violet-100 px-2 py-1 text-xs font-bold"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">{member.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setRightsUserId(member.userId)} className="rounded-lg border border-violet-100 px-2 py-1 text-xs font-black text-violet-800">
                      Rights
                    </button>
                    {member.role !== "OWNER" ? (
                      <>
                        <button type="button" onClick={() => setResetUserId(member.userId)} className="rounded-lg border border-violet-100 px-2 py-1 text-xs font-black text-violet-800">
                          <KeyRound size={12} className="inline" /> Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchUser(member.userId, { status: member.status === "Disabled" ? "Active" : "Disabled" })}
                          className="rounded-lg border border-violet-100 px-2 py-1 text-xs font-black text-violet-800"
                        >
                          {member.status === "Disabled" ? "Enable" : "Disable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Delete ${member.email}?`)) return;
                            void fetch(`/api/workspace/admin/users/${encodeURIComponent(member.userId)}`, { method: "DELETE" })
                              .then((res) => res.json())
                              .then((data) => {
                                setMessage(data.ok ? "User deleted." : data.error);
                                if (data.ok) refresh();
                              });
                          }}
                          className="rounded-lg border border-red-100 px-2 py-1 text-xs font-black text-red-700"
                        >
                          <Trash2 size={12} className="inline" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inviteOpen ? (
        <Modal title="Create User" onClose={() => setInviteOpen(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="First Name" value={inviteForm.firstName} onChange={(v) => setInviteForm((f) => ({ ...f, firstName: v }))} />
            <Input label="Surname" value={inviteForm.surname} onChange={(v) => setInviteForm((f) => ({ ...f, surname: v }))} />
            <Input label="Email" value={inviteForm.email} onChange={(v) => setInviteForm((f) => ({ ...f, email: v }))} />
            <Input label="Mobile" value={inviteForm.mobile} onChange={(v) => setInviteForm((f) => ({ ...f, mobile: v }))} />
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Role</span>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as WorkspaceRole }))}
                className="mt-2 w-full rounded-xl border border-violet-100 px-4 py-3 text-sm font-semibold"
              >
                {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Login Method</span>
              <select
                value={inviteForm.method}
                onChange={(e) => setInviteForm((f) => ({ ...f, method: e.target.value as "invite" | "password" }))}
                className="mt-2 w-full rounded-xl border border-violet-100 px-4 py-3 text-sm font-semibold"
              >
                <option value="password">Temporary password</option>
                <option value="invite">Email invite</option>
              </select>
            </label>
            {inviteForm.method === "password" ? (
              <>
                <Input label="Password" type="password" value={inviteForm.password} onChange={(v) => setInviteForm((f) => ({ ...f, password: v }))} />
                <Input label="Confirm Password" type="password" value={inviteForm.confirmPassword} onChange={(v) => setInviteForm((f) => ({ ...f, confirmPassword: v }))} />
              </>
            ) : null}
          </div>
          <button type="button" onClick={() => void createUser()} className="mt-5 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
            Create User
          </button>
        </Modal>
      ) : null}

      {rightsMember ? (
        <Modal title={`User Rights — ${rightsMember.email}`} onClose={() => setRightsUserId(null)}>
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">{group.label}</div>
                <div className="mt-2 space-y-2">
                  {group.permissions.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(customPermissions[permission.key])}
                        disabled={rightsMember.role === "OWNER"}
                        onChange={(e) => setCustomPermissions((current) => ({ ...current, [permission.key]: e.target.checked }))}
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {rightsMember.role !== "OWNER" ? (
            <button
              type="button"
              onClick={() =>
                void patchUser(rightsMember.userId, {
                  permissions: normalizePermissionMap(customPermissions),
                })
              }
              className="mt-5 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
            >
              Save Rights
            </button>
          ) : null}
        </Modal>
      ) : null}

      {resetUserId ? (
        <Modal title="Reset Password" onClose={() => setResetUserId(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="New Password" type="password" value={newPassword} onChange={setNewPassword} />
            <Input label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          </div>
          <button type="button" onClick={() => void resetPassword(resetUserId)} className="mt-5 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
            Reset Password
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-violet-100 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-violet-100 px-3 py-1 text-xs font-black text-slate-600">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({
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
        title: "Client User Setup",
        subtitle: "Premium VYRON COST workflow for client user setup.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <label>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
            <input
              type={type}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mt-2 w-full rounded-xl border border-violet-100 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400"
            />
          </label>
    </VyronPremiumPageShell>
  );
}
