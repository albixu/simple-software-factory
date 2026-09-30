import { AgentDefinition } from "#/runtime/agent-definition.js";
import { ExecutionContext } from "#/runtime/execution-context.js";


export interface AgentRuntime {
    execute<I,O>(
        agent: AgentDefinition<O>,
        input: I,
        context: ExecutionContext
    ): Promise<O>
}
