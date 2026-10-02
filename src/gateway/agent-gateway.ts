import { ToolRegistry } from "#/tools/tool-registry.js";
import { ToolRequest } from "#/tools/tool-request.js";
import { ToolExecutionContext } from "../tools/tool-execution-context.js";

export class AgentGateway {

    constructor(private readonly tools: ToolRegistry) {}

    async execute(request: ToolRequest): Promise<unknown> {
        
        // Policies vendrán después

        const tool = this.tools.get(request.tool);
        const input = tool.inputSchema.parse(request.arguments);
        const toolContext: ToolExecutionContext = {
            workflowId: request.context.workflowId,
            traceId: request.context.traceId,
            agentId: request.agentId,
            workspace: request.context.workspace
        };

        return tool.execute(input, toolContext);
    }
}