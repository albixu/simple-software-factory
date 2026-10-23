import { WorkflowNode } from "#/workflow/nodes/workflow-node.js";
import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";
import { ExecutionContext } from "#/runtime/execution-context.js";

export class WorkflowEngine {

    private readonly nodes = new Map<WorkflowStatus, WorkflowNode>

    constructor(
        nodes: WorkflowNode[]    
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
        let state = initialState;

        while(!this.isTerminal(state.status)) {
            context.signal?.throwIfAborted();

            const node = this.nodes.get(state.status);

            if (!node) {
                throw new Error(`No workflow node for status: ${state.status}`);
            }

            state = await node.execute(state, context);

            context.signal?.throwIfAborted();
        }

        return state;
    }


    private isTerminal(status: WorkflowStatus): boolean {
        return ["completed", "failed", "human_review"].includes(status);
    }
}