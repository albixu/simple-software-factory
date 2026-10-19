import { ToolRequest } from "#/tools/tool-request.js";

export interface ToolCallExecutor {
    execute(request: ToolRequest): Promise<unknown>;
}