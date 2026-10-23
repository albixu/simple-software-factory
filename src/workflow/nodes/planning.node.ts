import { Agent } from "#/agents/agent.js";
import { PlannerInput } from "#/agents/planner/planner-input.js";
import { ImplementationPlan } from "#/domain/implementation-plan.js";
import { ExecutionContext } from "#/runtime/execution-context.js";
import { WorkflowNode } from "#/workflow/nodes/workflow-node.js";
import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowStatus } from "#/workflow/workflow-status.js";

export class PlanningNode implements WorkflowNode {
    readonly id: WorkflowStatus = 'planning' as const;

    constructor(
        private readonly planner: Agent<PlannerInput, ImplementationPlan>
    ) {}

    async execute(
        state: WorkflowState,
        context: ExecutionContext
    ): Promise<WorkflowState> {

        context.signal?.throwIfAborted();

        const plan = await this.planner.run(
            {
                issue: state.issue
            },
            context
        );

        context.signal?.throwIfAborted();

        return {
            ...state,
            plan,
            attempts: {
                ...state.attempts,
                planning: state.attempts.planning + 1
            },
            status: plan.confidence >= 0.70 ? 'implementing' : 'human_review'
        };
    }
}