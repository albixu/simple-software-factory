export class PlanningNode implements WorkflowNode {
    readonly id: 'planning';

    constructor(
        private readonly planner: Agent<PlannerInput, ImplementationPlan>
    ) {}

    async execute(state: WorkflowState): Promise<WorkflowState> {
        const plan = await this.planner.run({
            issue: state.issue
        });

        return {
            ...state,
            plan,
            status: plan.confidence >= 0.70 ? 'implementing' : 'human_review'
        };
    }
}