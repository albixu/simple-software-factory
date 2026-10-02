import { z } from "zod";
import { ToolDefinition } from "#/llm/tool-definition.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";

export interface Tool<
  I = unknown,
  O = unknown
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly llmDefinition: ToolDefinition;

  execute(
    input: I,
    context: ToolExecutionContext
  ): Promise<O>;
}