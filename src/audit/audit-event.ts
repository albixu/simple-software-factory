export type AuditEventType = 
    | "tool.requested"
    | "tool.authorized"
    | "tool.denied"
    | "tool.completed"
    | "tool.failed";


export type AuditFailureStage = 
    | "validation"
    | "authorization"
    | "execution"
    | "budget";


export type AuditDenialSource = 
    | "policy"
    | "budget";


export interface AuditEvent {
    id: string;
    operationId: string;
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
    denialSource?: AuditDenialSource;
}