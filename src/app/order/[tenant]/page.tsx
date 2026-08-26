import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import VyronOrderPortalClient from "@/components/vyron-order/VyronOrderPortalClient";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { resolvePortalTenant } from "@/lib/vyron-order-tenant";
import { greetingFor } from "@/lib/vyron-order-greeting";

export const dynamic = "force-dynamic";

/**
 * This page inherits the root layout, which brands the whole application as
 * VYRON COST and points at the staff manifest. A customer installing from here
 * would get an app called VYRON COST that opens the staff dashboard, so every
 * piece of that identity is replaced with the ordering one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant: slug } = await params;
  const supabase = getSupabaseAdmin();
  const tenant = supabase ? await resolvePortalTenant(supabase, slug) : null;
  const supplier = tenant?.displayName || null;

  return {
    title: supplier ? `VYRON ORDER · ${supplier}` : "VYRON ORDER",
    description: supplier
      ? `Place your order with ${supplier}. Powered by VYRON COST.`
      : "Customer ordering for VYRON COST.",
    applicationName: "VYRON ORDER",
    // Per tenant, so the installed app opens this supplier's ordering page.
    manifest: tenant ? `/order/${tenant.slug}/manifest.webmanifest` : undefined,
    appleWebApp: {
      capable: true,
      title: "VYRON ORDER",
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: "/vyron-order/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/vyron-order/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/vyron-order/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#4F46E5",
  colorScheme: "light",
  viewportFit: "cover",
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
