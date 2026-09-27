import { ToolCall } from "#/llm/tool-call";

export type LLMResponse =
  | ToolCallsResponse
  | FinalResponse;

export interface ToolCallsResponse {
  type: "tool_calls";
  calls: ToolCall[];
}

export interface FinalResponse {
  type: "final";

  /**
   * Still unknown because it has not yet
   * been validated against AgentDefinition.outputSchema.
   */
  output: unknown;
}