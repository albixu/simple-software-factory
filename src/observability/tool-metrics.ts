import { AuditFailureStage } from "#/audit/audit-event.js";

export interface ToolCounters {
    requested: number;
    completed: number;
    denied: number;
    failed: number;
}


export interface ToolMetrics {
    traceId: string;
    totalToolCalls: number;
    authorizedToolCalls: number;
    completedToolCalls: number;
    deniedToolCalls: number;
    failedToolCalls: number;
    withoutTerminalEvent: number;
    totalCompletedDurationMs: number;
    averageCompletedDurationMs: number | null;
    toolCallBudgetExceeded: boolean;
    failuresByStage: Record<AuditFailureStage, number>;
    byTool: Record<string, ToolCounters>;
}