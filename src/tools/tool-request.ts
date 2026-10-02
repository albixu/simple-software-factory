import { ExecutionContext } from "../runtime/execution-context.js";

export interface ToolRequest {
    agentId: string;
    tool: string;
    arguments: unknown;
    context: ExecutionContext;
}