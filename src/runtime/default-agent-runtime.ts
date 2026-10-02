import { AgentGateway } from "#/gateway/agent-gateway.js";
import { LLMClient } from "#/llm/llm-client.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";
import { AgentRuntime } from "#/runtime/agent-runtime.js";
import { ExecutionContext } from "#/runtime/execution-context.js";
import { Message } from "#/runtime/message.js";
import { ToolRegistry } from "#/tools/tool-registry.js";



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

            if (response.type === "final") {
                // Final response
                const result = agent.outputSchema.safeParse(response.output);
                
                if (!result.success) {
                    throw new Error(`Invalid agent output: ${result.error.message}`);
                }

                return result.data;
            }

            // Execute tools
            messages.push({
                role: "assistant",
                toolCalls: response.calls
            });

            for(const call of response.calls) {
                this.assertToolAllowed(agent, call.name);

                const result = await this.gateway.execute({
                    agentId: agent.id,
                    tool: call.name,
                    arguments: call.arguments,
                    context: context
                });

                messages.push({
                    role: "tool",
                    toolCallId: call.id,
                    content: JSON.stringify(result)
                });
            }
        }

        throw new Error(`Agent ${agent.id} exceeded maximum iterations (${agent.maxIteration})`);
    }


    private assertToolAllowed<O>(
        agent: AgentDefinition<O>,
        toolName: string
        ): void {

        if (!agent.allowedTools.includes(toolName)) {
            throw new Error(`Agent ${agent.id} attempted unauthorized tool: ${toolName}`);
        }
    }
}