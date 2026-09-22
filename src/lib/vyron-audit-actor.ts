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
