import { ToolDefinition } from "#/llm/tool-definition.js";
import { Tool } from "#/tools/tool.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool already registered: ${tool.name}`
      );
    }

    this.tools.set(
      tool.name,
      tool
    );
  }

  get(name: string): Tool {
    const tool =
      this.tools.get(name);

    if (!tool) {
      throw new Error(
        `Unknown tool: ${name}`
      );
    }

    return tool;
  }

  describe(
    names: string[]
  ): ToolDefinition[] {
    return names.map(
      name =>
        this.get(name).llmDefinition
    );
  }
}