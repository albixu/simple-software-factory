import { WorkspaceContext } from "#/runtime/workspace-context.ts";

export interface ExecutionContext {
  workflowId: string;
  traceId: string;
  workspace: WorkspaceContext;
  attempt: number;
}