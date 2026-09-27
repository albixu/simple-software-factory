import { z } from "zod";
import { ToolDefinition } from "#/llm/tool-definition";

export interface Tool<
  I = unknown,
  O = unknown
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly llmDefinition: ToolDefinition;

  execute(
    input: I
  ): Promise<O>;
}