import { redirect } from "next/navigation";

/**
 * Consolidated into the single canonical User Setup (ADMIN → User Setup).
 *
 * This page used to list the legacy `vyron_cost_users` registry, which is
 * written only when a company is first provisioned and never for members added
 * later — so a company with active members showed "0 Active Users" and an empty
 * register. Members, roles and status live in vyron_workspace_memberships +
 * vyron_user_profiles, which User Setup reads for the signed-in member's own
 * workspace behind the admin.users permission.
 *
 * Kept as a redirect so existing bookmarks and links continue to work.
 */
export default function Page() {
  redirect("/admin/users");
}
