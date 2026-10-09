import { AuditEvent } from "#/audit/audit-event.js";
import { AuditStore } from "#/audit/audit-store.js";

export class InMemoryAuditStore implements AuditStore {

    private readonly events: AuditEvent[] = [];

    async append(event: AuditEvent): Promise<void> {
        this.events.push(structuredClone(event));
    }


    findByTraceId(traceId: string): AuditEvent[] {
        return this.events
            .filter(event => event.traceId === traceId)
            .map(event => structuredClone(event));
    }


    getAll(): AuditEvent[] {
        return structuredClone(this.events);
    }
}