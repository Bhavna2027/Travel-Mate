import { prisma } from '../db/client';

export interface AuditLogPayload {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export async function logAction(payload: AuditLogPayload): Promise<void> {
  try {
    await prisma.audit_logs.create({
      data: {
        user_id: payload.userId || null,
        action: payload.action,
        entity_type: payload.entityType,
        entity_id: payload.entityId || null,
        changes: payload.changes || null,
        ip_address: payload.ipAddress || null,
        user_agent: payload.userAgent || null,
        metadata: payload.metadata || null
      }
    });
  } catch (err) {
    console.error('[Audit Log Error] Failed to write audit log:', err);
  }
}
