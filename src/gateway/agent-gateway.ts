import { PolicyEngine } from "#/policy/policy-engine.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { ToolRequest } from "#/tools/tool-request.js";

export class AgentGateway {

    constructor(
        private readonly tools: ToolRegistry,
        private readonly policy: PolicyEngine
    ) {}

    async execute(request: ToolRequest): Promise<unknown> {
        const tool = this.tools.get(request.tool);
        const input = tool.inputSchema.parse(request.arguments);
        const decision = await this.policy.evaluate({
            agentId: request.agentId,
            tool: request.tool,
            arguments: input,
            context: request.context
        });

        if (!decision.allowed) {
            throw new Error(`Policy denied tool execution: ${decision.reason}`);
        }

        const toolContext: ToolExecutionContext = {
            workflowId: request.context.workflowId,
            traceId: request.context.traceId,
            agentId: request.agentId,
            workspace: request.context.workspace
        };

        return tool.execute(input, toolContext);
    }
}