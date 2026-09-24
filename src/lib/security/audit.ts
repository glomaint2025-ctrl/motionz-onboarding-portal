import { securityEventRepository } from '../db/repositories';
import { SecurityEvent } from '../db/schema';
import { logAuditEvent } from '../db';

export interface RecordSecurityEventParams {
  eventType: 'failed_login' | 'unauthorized_cross_tenant_access' | 'privilege_escalation_attempt' | 'invalid_token' | 'rate_limit_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  tenantId?: string;
  details?: Record<string, any>;
}

export async function recordSecurityEvent(params: RecordSecurityEventParams): Promise<SecurityEvent> {
  const combinedDetails = {
    actor_email: params.actorEmail,
    ip_address: params.ipAddress,
    user_agent: params.userAgent,
    ...params.details,
  };

  const event = await securityEventRepository.create({
    event_type: params.eventType,
    severity: params.severity,
    tenant_id: params.tenantId,
    details: combinedDetails,
  });

  await logAuditEvent({
    tenantId: params.tenantId,
    actorEmail: params.actorEmail || 'security_monitor',
    actorRole: 'system',
    action: `security.${params.eventType}`,
    resourceType: 'security_event',
    resourceId: event.id,
    details: { severity: params.severity, ...combinedDetails },
    ipAddress: params.ipAddress,
  });

  return event;
}

export async function listSecurityEvents(tenantId?: string): Promise<SecurityEvent[]> {
  return securityEventRepository.list({ tenantId });
}
