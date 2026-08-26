import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { resolvePortalTenant } from "@/lib/vyron-order-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The install manifest for one supplier's ordering link.
 *
 * It has to be per tenant because start_url does. A single shared manifest
 * would install an app that opens someone else's ordering page — or, as it did
 * before this existed, the staff dashboard under the name VYRON COST.
 *
 * The browser fetches a manifest without credentials, so nothing here may be
 * private. It carries the supplier's display name, which the sign-in screen
 * already shows to anyone holding the link, and nothing else: no company id, no
 * customer, no counts.
 *
 * An unknown or disabled link 404s exactly as the page does, so the manifest
 * cannot be used to discover which suppliers use VYRON ORDER.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: slug } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return new NextResponse("Not found", { status: 404 });

  const tenant = await resolvePortalTenant(supabase, slug);
  if (!tenant) return new NextResponse("Not found", { status: 404 });

  const base = `/order/${tenant.slug}`;
  const icon = (size: number, purpose: "any" | "maskable" = "any") => ({
    src: `/vyron-order/icon${purpose === "maskable" ? "-maskable" : ""}-${size}.png`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  });

  const manifest = {
    name: "VYRON ORDER",
    short_name: "VYRON ORDER",
    id: base,
    description: `Place your order with ${tenant.displayName}. Powered by VYRON COST.`,
    start_url: base,
    scope: base,
    display_override: ["standalone", "minimal-ui", "browser"],
    display: "standalone",
    orientation: "portrait",
    /* The wash the portal itself sits on, so the splash does not flash white. */
    background_color: "#F4F6FE",
    theme_color: "#4F46E5",
    categories: ["business", "productivity", "shopping"],
    lang: "en-ZA",
    dir: "ltr",
    prefer_related_applications: false,
    icons: [
      icon(72), icon(96), icon(128), icon(144), icon(152),
      icon(167), icon(180), icon(192), icon(256), icon(384), icon(512),
      icon(192, "maskable"), icon(512, "maskable"),
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
