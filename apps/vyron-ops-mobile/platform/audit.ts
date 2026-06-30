export type AuditEventInput = {
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
};

export type AuditEvent = AuditEventInput & {
  id: string;
  createdAt: string;
};

export function buildAuditEvent(input: AuditEventInput): AuditEvent {
  return {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  };
}
