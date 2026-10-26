import { ExecutionContext } from "#/runtime/execution-context.js";
import { CheckpointedStepExecutor } from "#/workflow/checkpoints/checkpointed-step-executor.js";
import { WorkflowNode } from "#/workflow/nodes/workflow-node.js";
import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";

export class WorkflowEngine {

    private readonly nodes = new Map<WorkflowStatus, WorkflowNode>

    constructor(
        nodes: WorkflowNode[],
        private readonly checkpointExecutor: CheckpointedStepExecutor<WorkflowState>
    ) {
        for (const node of nodes) {
            this.nodes.set(
                node.id,
                node
            );
        }
    }

    async run(
        initialState: WorkflowState,
        context:ExecutionContext
    ): Promise<WorkflowState> {
        let state = await this.checkpointExecutor.resume(initialState, context);

        while(!this.isTerminal(state.status)) {
            context.signal?.throwIfAborted();

            const node = this.nodes.get(state.status);

            if (!node) {
                throw new Error(`No workflow node for status: ${state.status}`);
            }

            state = await this.checkpointExecutor.execute(
                state,
                context,
                (currentState, executionContext) => node.execute(currentState, executionContext)
            );

            context.signal?.throwIfAborted();
        }

        return state;
    }


    private isTerminal(status: WorkflowStatus): boolean {
        return ["completed", "failed", "human_review"].includes(status);
    }
}