import type { Metadata } from "next";
import VyronOrderPortalClient from "@/components/vyron-order/VyronOrderPortalClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "VYRON ORDER",
  description: "Customer ordering for VYRON COST.",
};

/**
 * VYRON ORDER — the customer portal.
 *
 * Deliberately outside VyronCostAiShell. That shell is the internal admin
 * surface with the full sidebar and command bar; a customer ordering from a
 * phone should see none of it. The portal still uses VYRON COST design tokens
 * and the VYRON lockup, so it clearly belongs to the same product.
 *
 * The page holds no customer state and performs no authorisation of its own:
 * every read is a server-authorised API call scoped by the session cookie.
 */
/** Pinned to the business timezone so the greeting is stable and hydration-safe. */
function greetingFor(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", { hour: "numeric", hour12: false, timeZone: "Africa/Johannesburg" }).format(date)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function VyronOrderPage() {
  return <VyronOrderPortalClient greeting={greetingFor(new Date())} />;
}
