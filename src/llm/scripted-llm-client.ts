import { LLMClient } from "#/llm/llm-client.js";
import { LLMRequest } from "#/llm/llm-request.js";
import { LLMResponse } from "#/llm/llm-response.js";

export class ScriptedLLMClient implements LLMClient {

    private index = 0;
    readonly requests: LLMRequest[] = [];

    constructor(private readonly responses: LLMResponse[]) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        request.signal?.throwIfAborted();

        this.requests.push({
            instructions: request.instructions,
            messages: structuredClone(request.messages),
            tools: structuredClone(request.tools),
            ...(request.signal ? { signal: request.signal } : {})
        });

        const response = this.responses[this.index];

        if (!response) {
            throw new Error("ScriptedLLMClient has no more responses");
        }

        this.index++;

        request.signal?.throwIfAborted();

        return response;
    }
}
