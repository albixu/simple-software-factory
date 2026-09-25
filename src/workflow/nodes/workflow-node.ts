export interface WorkflowNode {
    readonly id: string;

    execute(state: WorkflowState): Promise<WorkflowState>;
}