import { Agent } from "#/agents/agent.js";
import { PlannerInput } from "#/agents/planner/planner-input.js";
import { ImplementationPlan, ImplementationPlanSchema } from "#/domain/implementation-plan.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";
import { AgentRuntime } from "#/runtime/agent-runtime.js";
import { ExecutionContext } from "#/runtime/execution-context.js";

export class PlannerAgent implements Agent<PlannerInput, ImplementationPlan> {
    readonly id = "planner";
    private readonly definition : AgentDefinition<ImplementationPlan> = {
        id: this.id,
        instructions: `
            You are a software planning agent.

            Investigate the issue before proposing changes.

            Use code.search to locate relevant code.

            Use filesystem.read to inspect only the
            relevant portions of discovered files.

            Base conclusions on evidence gathered
            from tools.

            Do not modify source code.

            Do not invent files, code or evidence.

            If there is insufficient evidence,
            reduce confidence instead of inventing
            a root cause.
            `.trim(),
        allowedTools: [
            "code.search",
            "filesystem.read"
        ],
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