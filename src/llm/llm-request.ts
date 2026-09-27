import { Message } from "../runtime/message.js";
import { ToolDefinition } from "./tool-definition.js";

export interface LLMRequest {
    instructions: string;
    message: Message[];
    tools: ToolDefinition[];
}