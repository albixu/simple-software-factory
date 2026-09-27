import { AgentDefinition } from "#/agents/agent.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { LLMClient } from "#/runtime/llm.js";
import { Message } from "#/runtime/message.js";
import { ExecutionContext } from "#/runtimne/execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";


export interface AgentRuntime {
    execute<I,O>(
        agent: AgentDefinition,
        input: I,
        context: ExecutionContext
    ): Promise<O>
}


export class DefaultAgentRuntime implements AgentRuntime{

    constructor(
        private readonly llm: LLMClient,
        private readonly gateway: AgentGateway,
        private readonly tools: ToolRegistry
    ) {}


    async execute<I, O>(
        agent: AgentDefinition<O>,
        input: I,
        context: ExecutionContext
    ): Promise<O> {
        const messages: Message[] = [
            {
                role: "user",
                content: JSON.stringify(input)
            }
        ];

        for(let iteration = 0; iteration < agent.maxIteration; iteration++) {
            const response = await this.llm.generate({
                instructions: agent.instructions,
                messages,
                tools: this.tools.describe(agent.allowedTools)
            });

            // Execute tools
            if (response.type === "tool_calls") {
                for(const call of response.calls) {
                    if (!agent.allowedTools.includes(call.name)) {
                        throw new Error(`Agent ${agent.id} attemped unauthorized tool ${call.name}`);
                    }

                    const result = await this.gateway.execute({
                        workflowId: context.workflowId,
                        agentId: agent.id,
                        tool: call.name,
                        arguments: call.arguments
                    });

                    messages.push({
                        role: "tool",
                        toolCallId: call.id,
                        content: JSON.stringify(result)
                    });
                }
            } else if (response.type === "final") {
                // Final response
                const result = agent.outputSchema.safeParse(response.output);
                
                if (result.success) {
                    return result.data;
                } else {
                    messages.push({
                        role: "user",
                        content: `
                            Your output does not match the required schema.
                            Validation errors:
                            ${JSON.stringify(result.error.issues)}
                            Produce a corrected result.`
                    });
                }
            }
        }

        throw new Error("Maximum iterations reached");
    }
}