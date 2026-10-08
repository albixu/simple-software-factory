import { ExecutionContext } from "#/runtime/execution-context.js";

export interface PolicyRequest {
    agentId: string;
    tool: string;
    arguments: unknown;
    context: ExecutionContext
}