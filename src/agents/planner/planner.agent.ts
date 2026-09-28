import { ImplementationPlan, ImplementationPlanSchema } from "#/domain/implementation-plan.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";

export const PlannerAgent: AgentDefinition<ImplementationPlan> = {
    id: "planner",
    instructions: `
        You investigate software issues and produce implementation plans.
        Do not modify files.
        Gather evidence before reaching conclusions.
        Distinguish evidence from assumptions.
        If evidence is insufficient, lower confidence instead of inventing a root cause.`,
    allowedTools: [
        "code.search",
        "filesystem.read"
    ],
    maxIteration: 8,
    outputSchema: ImplementationPlanSchema
};