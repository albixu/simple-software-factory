import { AuditEvent } from "#/audit/audit-event.js";

export interface AuditStore {
    
    append(event: AuditEvent): Promise<void>;
    
}