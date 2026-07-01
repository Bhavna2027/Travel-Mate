"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
const client_1 = require("../db/client");
async function logAction(payload) {
    try {
        await client_1.prisma.audit_logs.create({
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
    }
    catch (err) {
        console.error('[Audit Log Error] Failed to write audit log:', err);
    }
}
