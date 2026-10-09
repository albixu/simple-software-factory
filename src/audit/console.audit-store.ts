import { AuditEvent } from "#/audit/audit-event.js";
import type { AuditStore } from "#/audit/audit-store.js";

export class ConsoleAuditStore implements AuditStore {

    async append(event: AuditEvent): Promise<void> {
        console.log(JSON.stringify(event));
    }
}