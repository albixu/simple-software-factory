import { PlannerAgent } from "#/agents/planner/planner.agent.ts";
import { AgentRuntime } from "#/runtime/agent-runtime.js";
import { WorkflowNode } from "#/workflow/workflow-node.js";
import { WorkflowState } from "#/workflow/workflow-state.js";

export class PlanningNode implements WorkflowNode {
    readonly id: string = 'planning';

    constructor(
        private readonly runtime: AgentRuntime
    ) {}

    async execute(state: WorkflowState): Promise<WorkflowState> {
        const plan = await this.runtime.execute(
            PlannerAgent,
            {
                issue: state.issue
            },
            {
                workflowId: state.workflowId,
                traceId: state.traceId,
                workspace: state.workspace,
                attempt: 1
            }
        );

        return {
            ...state,
            plan,
            status: plan.confidence >= 0.70 ? 'implementing' : 'human_review'
        };
    }
}