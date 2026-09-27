import { LLMRequest } from "#/llm/llm-request.js";
import { LLMResponse } from "#/llm/llm-response.js";

export interface LLMClient {
    generate(request: LLMRequest): Promise<LLMResponse>
}
