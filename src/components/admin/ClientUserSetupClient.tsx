"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Trash2, UserPlus, X, Check } from "lucide-react";
import type { WorkspaceMember, WorkspaceRole } from "@/lib/vyron-saas-workspace";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import {
  ALL_PERMISSION_KEYS,
  ASSIGNABLE_ROLES,
  PERMISSION_GROUPS,
  defaultPermissionsForRole,
  normalizePermissionMap,
  resolveEffectivePermissions,
} from "@/lib/vyron-workspace-permissions";

const M = VYRON_MASTER;

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
    status: "Active" as "Active" | "Disabled",
  });
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
  /* Permissions for the user being created, seeded from the role's own defaults. */
  const [invitePermissions, setInvitePermissions] = useState<Record<string, boolean>>(
    () => defaultPermissionsForRole("VIEW_ONLY")
  );
  const [creating, setCreating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

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

  /** Validation the administrator sees before anything is sent. */
  function inviteProblems() {
    const problems: Record<string, string> = {};
    if (!inviteForm.firstName.trim()) problems.firstName = "First name is required.";
    if (!inviteForm.surname.trim()) problems.surname = "Surname is required.";
    const email = inviteForm.email.trim();
    if (!email) problems.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.email = "Enter a valid email address.";
    if (!inviteForm.role) problems.role = "Choose a role.";
    if (inviteForm.method === "password") {
      if (inviteForm.password.length < 8) problems.password = "At least 8 characters.";
      if (inviteForm.confirmPassword !== inviteForm.password) problems.confirmPassword = "Passwords do not match.";
    }
    return problems;
  }

  const inviteIssues = inviteProblems();

  function resetInviteForm() {
    setInviteForm({
      firstName: "",
      surname: "",
      email: "",
      mobile: "",
      role: "VIEW_ONLY",
      method: "password",
      password: "",
      confirmPassword: "",
      status: "Active",
    });
    setInvitePermissions(defaultPermissionsForRole("VIEW_ONLY"));
    setInviteError(null);
    setShowProblems(false);
  }

  /**
   * Put the first problem in front of the person who pressed the button.
   *
   * The form scrolls, and the button sits in a fixed footer, so an
   * administrator working in the permissions at the bottom cannot see a message
   * placed at the top — the button simply looked dead. The offending field is
   * scrolled to and focused, and the message is also shown beside the button.
   */
  function revealProblem(problems: Record<string, string>) {
    const first = Object.keys(problems)[0];
    if (!first) return;
    const field = document.getElementById(`invite-${first}`);
    if (field) {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      (field as HTMLInputElement).focus({ preventScroll: true });
    }
  }

  async function createUser() {
    if (creating) return;
    const problems = inviteProblems();
    if (Object.keys(problems).length) {
      setShowProblems(true);
      setInviteError(Object.values(problems)[0]);
      revealProblem(problems);
      return;
    }
    setShowProblems(false);

    setCreating(true);
    setInviteError(null);
    try {
      /*
       * The workspace is never sent: the server takes it from the membership it
       * verified for this administrator. The role and the permissions on screen
       * are what get saved.
       */
      const res = await fetch("/api/workspace/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: inviteForm.firstName.trim(),
          surname: inviteForm.surname.trim(),
          email: inviteForm.email.trim(),
          mobile: inviteForm.mobile.trim(),
          role: inviteForm.role,
          method: inviteForm.method,
          password: inviteForm.password,
          confirmPassword: inviteForm.confirmPassword,
          status: inviteForm.status,
          permissions: normalizePermissionMap(invitePermissions),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // The administrator sees what the server actually said.
        setInviteError(String(data?.error || `User creation failed (HTTP ${res.status}).`));
        return;
      }
      const created = String(data.member?.email || inviteForm.email.trim());
      setInviteOpen(false);
      resetInviteForm();
      setMessage(`User created. ${created} can now sign in.`);
      refresh();
    } catch {
      setInviteError("We could not reach the server. Nothing was created — try again.");
    } finally {
      setCreating(false);
    }
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
        <div className="rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-3 text-sm font-bold text-[var(--vyron-warning-fg)]">
          User limit reached for this package. Upgrade package to add more users.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-bold text-[var(--vyron-success-fg)]">
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
        <Modal
          wide
          title="Create User"
          subtitle="Create a staff user and assign their workspace role and permissions."
          onClose={() => { setInviteOpen(false); resetInviteForm(); }}
          footer={
            <div className="space-y-3">
              {/* Beside the button, because that is where the eye is. */}
              {inviteError ? (
                <p role="alert" className={`${M.alertError} px-4 py-2.5 text-sm font-bold`}>{inviteError}</p>
              ) : null}
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setInviteOpen(false); resetInviteForm(); }}
                className={`${M.secondaryBtn} h-12 px-5 text-xs font-bold uppercase tracking-[0.1em] sm:min-w-[8rem]`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createUser()}
                disabled={creating}
                className={`${M.primaryBtn} h-12 px-6 text-xs uppercase tracking-[0.1em] disabled:opacity-50 sm:min-w-[11rem]`}
              >
                {creating ? "Creating…" : "Create User"}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <Section title="User details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="invite-firstName"
                  label="First name"
                  value={inviteForm.firstName}
                  onChange={(v) => setInviteForm((f) => ({ ...f, firstName: v }))}
                  autoComplete="given-name"
                  error={showProblems ? inviteIssues.firstName : null}
                />
                <Input
                  id="invite-surname"
                  label="Surname"
                  value={inviteForm.surname}
                  onChange={(v) => setInviteForm((f) => ({ ...f, surname: v }))}
                  autoComplete="family-name"
                  error={showProblems ? inviteIssues.surname : null}
                />
                <Input
                  id="invite-email"
                  label="Email address"
                  type="email"
                  inputMode="email"
                  placeholder="name@company.co.za"
                  value={inviteForm.email}
                  onChange={(v) => setInviteForm((f) => ({ ...f, email: v }))}
                  autoComplete="email"
                  hint="They sign in with this address."
                  error={showProblems ? inviteIssues.email : null}
                />
                <Input
                  label="Mobile number"
                  type="tel"
                  inputMode="tel"
                  placeholder="082 000 0000"
                  value={inviteForm.mobile}
                  onChange={(v) => setInviteForm((f) => ({ ...f, mobile: v }))}
                  autoComplete="tel"
                  hint="Optional."
                />
              </div>
            </Section>

            <Section title="Access" note="The role sets a starting point; the permissions below are what the server enforces.">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className={M.label}>Role</span>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => {
                      const role = e.target.value as WorkspaceRole;
                      setInviteForm((f) => ({ ...f, role }));
                      // Moving role re-seeds the tick boxes from that role's own defaults.
                      setInvitePermissions(defaultPermissionsForRole(role));
                    }}
                    className={`${M.select} mt-1.5 h-12 w-full`}
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className={M.label}>User status</span>
                  <select
                    value={inviteForm.status}
                    onChange={(e) => setInviteForm((f) => ({ ...f, status: e.target.value as "Active" | "Disabled" }))}
                    className={`${M.select} mt-1.5 h-12 w-full`}
                  >
                    <option value="Active">Active — can sign in</option>
                    <option value="Disabled">Disabled — cannot sign in yet</option>
                  </select>
                </label>
                <label className="block min-w-0 sm:col-span-2">
                  <span className={M.label}>How they get in</span>
                  <select
                    value={inviteForm.method}
                    onChange={(e) => setInviteForm((f) => ({ ...f, method: e.target.value as "invite" | "password" }))}
                    className={`${M.select} mt-1.5 h-12 w-full`}
                  >
                    <option value="password">Set a password now</option>
                    <option value="invite">Email them an invite</option>
                  </select>
                </label>
              </div>
            </Section>

            {inviteForm.method === "password" ? (
              <Section title="Login password" note="At least 8 characters. Give it to them directly — it is not shown again.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    id="invite-password"
                    label="Password"
                    type="password"
                    value={inviteForm.password}
                    onChange={(v) => setInviteForm((f) => ({ ...f, password: v }))}
                    autoComplete="new-password"
                    error={inviteForm.password && inviteForm.password.length < 8 ? "At least 8 characters." : null}
                  />
                  <Input
                    id="invite-confirmPassword"
                    label="Confirm password"
                    type="password"
                    value={inviteForm.confirmPassword}
                    onChange={(v) => setInviteForm((f) => ({ ...f, confirmPassword: v }))}
                    autoComplete="new-password"
                    error={inviteForm.confirmPassword && inviteForm.confirmPassword !== inviteForm.password ? "Passwords do not match." : null}
                  />
                </div>
              </Section>
            ) : null}

            <Section
              title="Permissions"
              note={`${Object.values(invitePermissions).filter(Boolean).length} of ${ALL_PERMISSION_KEYS.length} granted. These are saved against the membership and are what the server checks.`}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {PERMISSION_GROUPS.map((group) => {
                  const granted = group.permissions.filter((permission) => invitePermissions[permission.key]).length;
                  const all = granted === group.permissions.length;
                  return (
                    <div key={group.label} className="min-w-0 rounded-xl border border-[rgba(15,23,42,0.07)] bg-white p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-black text-[#0F172A]">{group.label}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setInvitePermissions((current) => {
                              const next = { ...current };
                              for (const permission of group.permissions) next[permission.key] = !all;
                              return next;
                            })
                          }
                          className="inline-flex h-11 shrink-0 items-center rounded-lg px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#4F46E5] transition hover:bg-[var(--vyron-brand-wash)]"
                        >
                          {all ? "None" : "All"}
                        </button>
                      </div>
                      <p className="mt-0.5 text-[11px] font-semibold text-[#94A3B8]">
                        {granted} of {group.permissions.length}
                      </p>
                      <div className="mt-2.5 space-y-1">
                        {group.permissions.map((permission) => {
                          const on = Boolean(invitePermissions[permission.key]);
                          return (
                            <label
                              key={permission.key}
                              className={`flex min-h-[2.25rem] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${
                                on ? "bg-[var(--vyron-brand-wash)]" : "hover:bg-[rgba(15,23,42,0.03)]"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                  on
                                    ? "border-transparent vyron-grad-surface text-white"
                                    : "border-[rgba(15,23,42,0.18)] bg-white"
                                }`}
                              >
                                {on ? <Check size={13} strokeWidth={3} /> : null}
                              </span>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={on}
                                onChange={(e) =>
                                  setInvitePermissions((current) => ({ ...current, [permission.key]: e.target.checked }))
                                }
                              />
                              <span className={`min-w-0 text-xs ${on ? "font-bold text-[#0F172A]" : "font-medium text-[#334155]"}`}>
                                {permission.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
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
              className="mt-5 rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white"
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
          <button type="button" onClick={() => void resetPassword(resetUserId)} className="mt-5 rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
            Reset Password
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * A VYRON modal.
 *
 * The header and footer stay put and only the body scrolls, so the primary
 * action is reachable without scrolling past the form. On a phone it becomes a
 * full-height sheet rather than a card floating in the middle of the screen.
 */
function Modal({
  title,
  subtitle,
  children,
  onClose,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  /*
   * Rendered on <body>.
   *
   * The workspace shell establishes its own stacking context, so a modal left
   * inside it sits behind the fixed sidebar however high its z-index is — which
   * is why the form appeared with its left edge sliced off. A portal takes it
   * out of that context entirely.
   */
  // Only ever rendered from a click, so the document is always there by then.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-[rgba(7,17,31,0.45)] backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[rgba(15,23,42,0.07)] bg-white shadow-[var(--vyron-elev-4)] sm:max-h-[90vh] sm:rounded-2xl ${
          wide ? "sm:max-w-4xl" : "sm:max-w-2xl"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.07)] px-5 py-4 md:px-6">
          <div className="min-w-0">
            <h3 className={`text-lg ${M.heading}`}>{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-sm font-medium text-[#64748B]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[#0F172A]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-[rgba(15,23,42,0.07)] bg-[rgba(15,23,42,0.02)] px-5 py-4 md:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** A titled block inside a modal, so a long form reads as sections. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[rgba(15,23,42,0.07)] bg-[rgba(15,23,42,0.02)] p-4 md:p-5">
      <h4 className={`${M.label} text-[11px]`}>{title}</h4>
      {note ? <p className="mt-1 text-xs font-medium text-[#64748B]">{note}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  error,
  autoComplete,
  inputMode,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  id?: string;
}) {
  /*
   * A field is a label and an input.
   *
   * This previously wrapped every single field in VyronPremiumPageShell — a
   * full marketing page with its own heading and formula cards — so a six-field
   * form rendered six marketing pages inside the modal, two to a row. That is
   * what produced the duplicated panels and the one-character-per-line columns.
   */
  return (
    <label className="block min-w-0">
      <span className={M.label}>{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        className={`${M.input} mt-1.5 h-12 py-0 ${error ? "border-[#BE123C] focus:border-[#BE123C] focus:ring-[#BE123C]/12" : ""}`}
      />
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-[#BE123C]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs font-medium text-[#64748B]">{hint}</span>
      ) : null}
    </label>
  );
}
