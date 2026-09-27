import { ImplementationPlan, ImplementationResult, ReviewResult, TestResult } from "#/agents/planner.agent.js";

export interface WorkflowState {
  workflowId: string;
  traceId: string;
  workspace: WorkspaceContext;
  issue: Issue;
  status: WorkflowStatus;
  plan?: ImplementationPlan;
  implementation?: ImplementationResult;
  tests?: TestResult;
  review?: ReviewResult;
  attempts: {
    planning: number;
    implementation: number;
    review: number;
  };
}