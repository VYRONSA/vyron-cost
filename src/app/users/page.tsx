import { ShieldCheck, UserPlus, Users } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import StatusPill from "@/components/StatusPill";
import VyronCostShell from "@/components/VyronCostShell";
import { getUsers, statusTone } from "@/lib/vyron-cost-data";

export default async function UsersPage() {
  const users = await getUsers();
  const admins = users.filter((user) => user.role === "Owner" || user.role.includes("Manager")).length;

  return (
    <VyronCostShell hidePageHeader title="Users & Roles"
      subtitle="Control user access, branch permissions, approval levels and enterprise management roles."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-3">
        <MetricCard title="Active Users" value={String(users.length)} note="Current company users" icon={Users} />
        <MetricCard title="Approval Roles" value={String(admins)} note="Can approve costing changes" icon={ShieldCheck} />
        <MetricCard title="Invite Flow" value="Ready" note="Auth integration follows" icon={UserPlus} dark />
      </section>

      <section className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#07110d]">User Access Register</h2>
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-100">
          <div className="grid grid-cols-4 bg-[#0b1210] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div>Status</div>
          </div>
          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-4 items-center border-t border-slate-100 px-5 py-5 text-sm">
              <div className="font-black text-[#07110d]">{user.full_name}</div>
              <div className="font-bold text-slate-600">{user.email}</div>
              <div>{user.role}</div>
              <div><StatusPill tone={statusTone(user.status)}>{user.status}</StatusPill></div>
            </div>
          ))}
        </div>
      </section>
    </VyronCostShell>
  );
}
