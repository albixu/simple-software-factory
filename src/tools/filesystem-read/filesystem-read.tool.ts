import { ToolDefinition } from "#/llm/tool-definition.js";
import {
    FilesystemReadInput,
    FilesystemReadInputSchema,
    FilesystemReadResult
} from "#/tools/filesystem-read/filesystem-read.types.js";
import { resolveWorkspacePath } from "#/tools/filesystem/workspace-path.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { Tool } from "#/tools/tool.js";
import { readFile, realpath, stat } from "node:fs/promises";
import { relative } from "node:path";


const DEFAULT_MAX_LINES = 200;

export class FilesystemReadTool implements Tool<FilesystemReadInput, FilesystemReadResult> {

    readonly name = "filesystem.read";
    readonly description = "Read a limited range of lines from a file inside the repository workspace.";
    readonly inputSchema = FilesystemReadInputSchema;
    readonly llmDefinition: ToolDefinition = {
        name: this.name,
        description: this.description,
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    minLength: 1
                },
                startLine: {
                    type: "integer",
                    minimum: 1
                },
                endLine: {
                    type: "integer",
                    minimum: 1
                }
            },
            required: ["path"],
            additionalProperties: false
        }
    };


    async execute(
        input: FilesystemReadInput,
        context: ToolExecutionContext
    ): Promise<FilesystemReadResult> {

        const target = resolveWorkspacePath(context.workspace.root, input.path);

        /*
         * Resolve physical filesystem paths.
         *
         * This prevents symlink escape.
         */
        const realWorkspace = await realpath(context.workspace.root);
        const realTarget = await realpath(target);

        this.assertInsideWorkspace(realWorkspace, realTarget);

        const targetStat = await stat(realTarget);

        if (!targetStat.isFile()) {
            throw new Error(`Path is not a file: ${input.path}`);
        }

        const content = await readFile(realTarget, "utf8");
        const lines = content.split(/\r?\n/);
        const totalLines = lines.length;
        const requestedStart = input.startLine ?? 1;
        const requestedEnd = input.endLine ?? (requestedStart + DEFAULT_MAX_LINES - 1);

        /*
         * Even if the LLM asks for 10,000 lines,
         * infrastructure limits the result.
         */
        const effectiveEnd = Math.min(requestedEnd, requestedStart + DEFAULT_MAX_LINES -1, totalLines);
        const selectedLines = lines.slice(requestedStart -1, effectiveEnd);

        return {
            path: input.path,
            startLine: requestedStart,
            endLine: effectiveEnd,
            totalLines,
            content: selectedLines.join("\n"),
            truncated: requestedEnd > effectiveEnd
        };
    }


    private assertInsideWorkspace(
        workspace: string,
        target: string
    ): void {

        const relativePath = relative(workspace, target);

        if (
            relativePath === ".." ||
            relativePath.startsWith("../") ||
            relativePath.startsWith("..\\")
        ) {
            throw new Error("Resolved path escapes workspace");
        }

    }
}