import { cookies } from "next/headers";

export const DEMO_ACCESS_COOKIE = "vyron_demo_access";

export function isDemoModeActive() {
  return process.env.NEXT_PUBLIC_VYRON_TENANT !== "off";
}

export async function hasDemoAccess() {
  const jar = await cookies();
  return jar.get(DEMO_ACCESS_COOKIE)?.value === "1";
}

export async function shouldShowPublicLanding() {
  if (!(await hasDemoAccess())) return true;
  return false;
}
