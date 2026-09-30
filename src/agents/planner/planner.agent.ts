import { ImplementationPlan, ImplementationPlanSchema } from "#/domain/implementation-plan.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";
import { AgentRuntime } from "../../runtime/agent-runtime.js";
import { ExecutionContext } from "../../runtime/execution-context.js";
import { Agent } from "../agent.js";
import { PlannerInput } from "./planner-input.js";

export class PlannerAgent implements Agent<PlannerInput, ImplementationPlan> {
    readonly id = "planner";
    private readonly definition : AgentDefinition<ImplementationPlan> = {
        id: this.id,
        instructions: `
            You are a software planning agent.

            Investigate the issue before proposing changes.

            Gather evidence using the available tools.

            Do not modify source code.

            If there is insufficient evidence,
            reduce confidence instead of inventing
            a root cause.
                `.trim(),
        allowedTools: ["code.search"],
        maxIteration: 8,
        outputSchema: ImplementationPlanSchema
    };


    constructor(private readonly runtime: AgentRuntime) {}

    run(
        input: PlannerInput,
        context: ExecutionContext
    ): Promise<ImplementationPlan> {
        return this.runtime.execute(
            this.definition,
            input,
            context
        );
    }
};