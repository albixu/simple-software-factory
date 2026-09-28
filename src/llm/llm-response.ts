import { ToolCall } from "#/llm/tool-call.js";

export type LLMResponse =
  | ToolCallsResponse
  | FinalResponse;

export interface ToolCallsResponse {
  type: "tool_calls";
  calls: ToolCall[];
}

export interface FinalResponse {
  type: "final";
  output: unknown;
}