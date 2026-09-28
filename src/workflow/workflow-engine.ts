import { WorkflowNode } from "#/workflow/nodes/workflow-node.js";
import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";

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

    async run(initialState: WorkflowState): Promise<WorkflowState> {
        let state = initialState;

        while(!this.isTerminal(state.status)) {
            const node = this.nodes.get(state.status);

            if (!node) {
                return state;
            }

            state = await node.execute(state);
        }

        return state;
    }


    private isTerminal(status: WorkflowStatus): boolean {
        return ["completed", "failed", "human_review"].includes(status);
    }
}