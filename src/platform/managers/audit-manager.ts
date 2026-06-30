export type AuditEventInput = {
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
};

/** Central audit event shape — product modules append via their existing audit tables. */
export type AuditEvent = AuditEventInput & {
  id: string;
  createdAt: string;
};

export function buildAuditEvent(input: AuditEventInput): AuditEvent {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
