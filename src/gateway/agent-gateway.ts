import { ToolRegistry } from "#/tools/tool-registry.js";
import { ToolRequest } from "#/tools/tool-request.js";

export class AgentGateway {

    constructor(private readonly tools: ToolRegistry) {}

    async execute(request: ToolRequest): Promise<unknown> {
        
        // Policies vendrán después

        const tool = this.tools.get(request.tool);
        const input = tool.inputSchema.parse(request.arguments);

        return tool.execute(input);
    }
}