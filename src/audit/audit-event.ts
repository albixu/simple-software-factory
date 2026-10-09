export type AuditEventType = 
    | "tool.requested"
    | "tool.authorized"
    | "tool.denied"
    | "tool.completed"
    | "tool.failed";


export type AuditFailureStage = 
    | "validation"
    | "authorization"
    | "execution";


export interface AuditEvent {
    id: string;
    timestamp: string;
    type: AuditEventType;
    workflowId: string;
    traceId: string;
    attempt: number;
    agentId: string;
    tool: string;
    workspaceId: string;
    durationMs?: number;
    stage?: AuditFailureStage;
}