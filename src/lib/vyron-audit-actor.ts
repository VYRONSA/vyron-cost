import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

/**
 * The audit actor for a request: the verified workspace member whose Active
 * membership authorised it — the session user id.
 *
 * NEVER take an actor from a request body, query string or header. Those are
 * client-controlled: a member could record another member (or an approver) as
 * having approved, posted or converted something. Routes that historically
 * accepted `body.actor` now ignore it; the field may still be sent by older
 * clients and is harmless.
 *
 * Same rule as auditActorFromSession in platform/documents/document-email-route.ts.
 */
export function sessionAuditActor(session: Pick<WorkspaceSession, "userId">): string {
  return String(session.userId || "").trim() || "unknown-member";
}

/**
 * The verified member's name, for records people read ("Processed by", "Approved by"): first name
 * and surname from their profile, else their e-mail, else their user id. Looked up from the
 * session's user id — the signed server session carries no name — and never taken from a request.
 */
export async function memberDisplayName(
  supabase: SupabaseClient,
  session: Pick<WorkspaceSession, "userId">
): Promise<string> {
  const userId = sessionAuditActor(session);
  try {
    const { data } = await supabase.from("vyron_user_profiles").select("first_name, surname, email").eq("id", userId).maybeSingle();
    const name = [data?.first_name, data?.surname].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
    return name || String(data?.email ?? "").trim() || userId;
  } catch {
    return userId;
  }
}
