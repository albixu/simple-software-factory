import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";

export interface WorkflowNode {
    readonly id: WorkflowStatus;

    execute(state: WorkflowState): Promise<WorkflowState>;
}