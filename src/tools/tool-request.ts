export interface ToolRequest {
    workflowId: string;
    agentId: string;
    tool: string;
    arguments: unknown;
}