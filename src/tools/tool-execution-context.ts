import { WorkspaceContext } from "#/runtime/workspace-context.js";

export interface ToolExecutionContext {
  workflowId: string;
  traceId: string;
  agentId: string;
  workspace: WorkspaceContext;
}