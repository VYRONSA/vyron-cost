import { redirect } from "next/navigation";

/**
 * Consolidated into the single canonical Import Centre.
 * Kept as a redirect so existing bookmarks and links continue to work.
 */
export default function Page() {
  redirect("/admin/imports");
}
