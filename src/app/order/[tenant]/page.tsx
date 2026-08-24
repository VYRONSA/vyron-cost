import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VyronOrderPortalClient from "@/components/vyron-order/VyronOrderPortalClient";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { resolvePortalTenant } from "@/lib/vyron-order-tenant";
import { greetingFor } from "@/lib/vyron-order-greeting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "VYRON ORDER",
  description: "Customer ordering for VYRON COST.",
};

/**
 * A supplier's ordering link — /order/<slug>.
 *
 * The slug is resolved here, on the server, before anything renders. An unknown
 * or disabled link is a plain 404: the page will not confirm whether a given
 * supplier uses VYRON ORDER.
 *
 * Resolving it here also means the customer's phone never has to know a company
 * id. It sends the slug it was given; the server does the rest.
 */
export default async function VyronOrderTenantPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const tenant = await resolvePortalTenant(supabase, slug);
  if (!tenant) notFound();

  return (
    <VyronOrderPortalClient
      greeting={greetingFor(new Date())}
      tenantSlug={tenant.slug}
      tenantName={tenant.displayName}
    />
  );
}
