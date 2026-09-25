export interface AuditEvent {

    id: string;
    timestamp: Date;
    traceId: string;
    workflowId: string;
    type: string;
    actor?: {
        type:
            | 'workflow'
            | 'agent'
            | 'system';
        id: string;
    };
    metadata?: Record<string, unknown>;
}


interface AuditStore {
    
    append(event: AuditEvent): Promise<void>;
}


async function audited<T> (
    audit: AuditStore,
    startEvent: AuditEvent,
    operation: () => Promise<T>,
    completed: (result: T) => AuditEvent,
    failed: (error: unknown) => AuditEvent
): Promise<T> {
    await audit.append(startEvent);

    try {
        const result = await operation();
        await audit.append(completed(result));
        return result;
    } catch (error) {
        await audit.append(failed(error));
        throw error;
    }
}