export class AgentGateway {

    constructor(private readonly tools: ToolRegistry) {}

    async execute(request: ToolRequest): Promise<unknown> {
        
        // Policies vendrán después

        const tool = this.tools.get(request.tool);

        return tool.execute(request.arguments);
    }
}