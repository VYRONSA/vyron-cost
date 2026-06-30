import { buildAuditEvent, type AuditEvent } from "@/platform/audit";

const auditLog: AuditEvent[] = [];

export function recordAuditEvent(input: Parameters<typeof buildAuditEvent>[0]) {
  const event = buildAuditEvent(input);
  auditLog.unshift(event);
  return event;
}

export function listAuditEvents() {
  return [...auditLog];
}
