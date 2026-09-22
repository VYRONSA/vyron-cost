import type { Metadata } from "next";
import { VoloraWordmark } from "@/components/vyron-ui/VyronLogo";
import VyronOrderPortalClient from "@/components/vyron-order/VyronOrderPortalClient";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getPortalTenantForCompany } from "@/lib/vyron-order-tenant";
import { greetingFor } from "@/lib/vyron-order-greeting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Ordering · VOLORA" },
  description: "Customer ordering for VOLORA.",
};

/**
 * VYRON ORDER without a supplier link.
 *
 * Customers reach the portal at /order/<their supplier's link>. This bare page
 * deliberately does NOT list the suppliers that use VYRON ORDER — that would be
 * a directory of every tenant on the platform, available to anyone. It shows a
 * short explanation instead.
 *
 * The one exception is staff already signed in to VYRON COST: for them the page
 * opens their own workspace's portal, so the internal preview still works from
 * inside the product. That path is authorised by the existing workspace
 * session, not by anything a customer can supply.
 *
 * The portal is deliberately outside VyronCostAiShell. That shell is the
 * internal admin surface; a customer ordering from a phone should see none of
 * it. The portal still uses VYRON COST design tokens and the VYRON lockup, so
 * it clearly belongs to the same product.
 */
export default async function VyronOrderPage() {
  const supabase = getSupabaseAdmin();
  const companyId = supabase ? await getWorkspaceCompanyId() : null;
  const tenant = supabase && companyId ? await getPortalTenantForCompany(supabase, companyId) : null;

  if (tenant && tenant.status === "Active") {
    return (
      <VyronOrderPortalClient
        greeting={greetingFor(new Date())}
        tenantSlug={tenant.slug}
        tenantName={tenant.displayName}
      />
    );
  }

  return (
    <main className="volora-night volora-texture flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="flex flex-col items-center gap-3">
          <VoloraWordmark height={30} variant="onDark" title="VOLORA Order" />
          <span className="rounded-md border border-[#F4C44E]/40 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.24em] text-[#F4C44E]">
            Order
          </span>
        </h1>
        <p className="mt-4 text-sm font-semibold text-white/70">
          Ordering happens through the link your supplier gave you.
        </p>
        <p className="mt-3 text-sm font-semibold text-white/50">
          It looks like <span className="font-black text-white/80">/order/your-supplier</span>. If you
          don&apos;t have it, ask them to send it to you again.
        </p>
      </div>
    </main>
  );
}
