import { ToolDefinition } from "#/llm/tool-definition.js";
import { SearchCodeInput, SearchCodeInputSchema, SearchCodeMatch, SearchCodeResult } from "#/tools/code-search/search-code.types.js";
import { Tool } from "#/tools/tool.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolExecutionContext } from "../tool-execution-context.js";


const execFileAsync = promisify(execFile);


export class SearchCodeTool implements Tool<SearchCodeInput, SearchCodeResult> {

  readonly name = "code.search";
  readonly description = "Search source code in the repository.";
  readonly inputSchema = SearchCodeInputSchema;
  readonly llmDefinition: ToolDefinition = {
    name: this.name,
    description: this.description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1
        }
      },
      required: [
        "query"
      ],
      additionalProperties: false
    }
  };

  async execute(
    input: SearchCodeInput,
    context: ToolExecutionContext
  ): Promise<SearchCodeResult> {

    const maxResults = 100;

    try {
      const { stdout } = await execFileAsync(
        "rg",
        [
          "--line-number",
          "--no-heading",
          "--color",
          "never",
          "--fixed-strings",
          "--max-count",
          String(maxResults + 1),
          input.query,
          "."
        ],
        {
          cwd: context.workspace.root,
          maxBuffer: 1024 * 1024
        }
      );

      const matches = this.parseOutput(stdout);
      const truncated = matches.length > maxResults;
    
      return {
        query: input.query,
        matches: matches.slice(0, maxResults),
        truncated
      };
    } catch (error: unknown) {
      /*
       * ripgrep exit code 1 means:
       *
       * no matches.
       *
       * It is NOT an operational failure.
       */

      if (this.isNoMatchesError(error)) {

        return {
          query: input.query,
          matches: [],
          truncated: false
        };
      }

      throw error;
    }
  }


  private parseOutput(stdout: string): SearchCodeMatch[] {

    if (stdout.trim().length === 0) {
      return [];
    }


    return stdout
      .split("\n")
      .filter(line => line.length > 0)
      .map(line => this.parseLine(line));
  }


  private parseLine(line: string): SearchCodeMatch {
    const firstColon = line.indexOf(":");
    const secondColon = line.indexOf(":", firstColon + 1);


    if (firstColon === -1 || secondColon === -1) {
      throw new Error(
        `Unexpected ripgrep output: ${line}`
      );
    }

    const file = line.substring(0, firstColon);
    const lineNumber = Number(line.substring(firstColon + 1, secondColon));
    const text = line.substring(secondColon + 1);

    return {
      file,
      line: lineNumber,
      text
    };
  }


  private isNoMatchesError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }


    if (!("code" in error)) {
      return false;
    }


    return (error.code === 1);
  }
}
