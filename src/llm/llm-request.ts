import { ToolDefinition } from "#/llm/tool-definition.js";
import { Message } from "#/runtime/message.js";

export interface LLMRequest {
    instructions: string;
    messages: Message[];
    tools: ToolDefinition[];
}