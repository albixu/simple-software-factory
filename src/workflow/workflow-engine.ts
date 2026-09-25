export class WorkflowEngine {

    constructor(
        private readonly nodes: Map<string, WorkflowNode>
    ) {}

    async run(state: WorkflowState): Promise<WorkflowState> {
        while(!['completed', 'failed', 'human_review'].includes(state.status)) {
            const node = this.nodes.get(state.status);

            if (!node) {
                throw new Error(`No node for state: ${state.status}`);
            }

            state = await node.execute(state);
        }

        return state;
    }
}