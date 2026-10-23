import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";
import { ExecutionContext } from "#/runtime/execution-context.js";

export interface WorkflowNode {
    readonly id: WorkflowStatus;

    execute(
        state: WorkflowState,
        context: ExecutionContext
    ): Promise<WorkflowState>;
}