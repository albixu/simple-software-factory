import { ImplementationPlan } from "#/domain/implementation-plan.js";
import { ImplementationResult } from "#/domain/implementation-result.js";
import { ReviewResult } from "#/domain/review-result.js";
import { TestResult } from "#/domain/test-result.js";
import { Issue } from "#/domain/issue.js";
import { WorkspaceContext } from "#/runtime/workspace-context.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";

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