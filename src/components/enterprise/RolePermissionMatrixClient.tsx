"use client";

import { Fragment } from "react";
import type { RolePermissionMatrix } from "@/lib/vyron-enterprise-permissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const ACTIONS = ["view", "create", "edit", "approve", "delete", "export", "override"] as const;

export default function RolePermissionMatrixClient({ matrix }: { matrix: RolePermissionMatrix[] }) {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Role Permission Matrix",
        subtitle: "Premium VYRON COST workflow for role permission matrix.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="overflow-x-auto rounded-[2rem] bg-white shadow-sm">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-left text-[10px] font-black uppercase tracking-wider text-[#A855F7]">
                  <th className="p-4">Role / Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="p-4 text-center capitalize">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((role) => (
                  <Fragment key={role.roleKey}>
                    <tr className="bg-violet-50">
                      <td colSpan={8} className="p-3 font-black text-violet-900">
                        {role.roleName}
                      </td>
                    </tr>
                    {role.permissions.map((mod) => (
                      <tr key={`${role.roleKey}-${mod.moduleKey}`} className="border-t border-slate-100">
                        <td className="p-3 pl-6 font-bold text-slate-700">{mod.moduleLabel}</td>
                        {ACTIONS.map((action) => (
                          <td key={action} className="p-3 text-center">
                            {mod[action] ? (
                              <span className="inline-block h-3 w-3 rounded-full border border-[#A855F7]/25 bg-[#A855F7]/100" />
                            ) : (
                              <span className="inline-block h-3 w-3 rounded-full bg-slate-200" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>
    </VyronPremiumPageShell>
  );
}
