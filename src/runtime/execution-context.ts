import { WorkspaceContext } from "#/runtime/workspace-context.js";

export interface ExecutionContext {
  workflowId: string;
  traceId: string;
  workspace: WorkspaceContext;
  attempt: number;
}