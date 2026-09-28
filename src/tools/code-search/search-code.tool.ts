import { ToolDefinition } from "#/llm/tool-definition.js";
import { SearchCodeInput, SearchCodeInputSchema, SearchCodeResult } from "#/tools/code-search/search-code.types.js";
import { Tool } from "#/tools/tool.js";



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
    input: SearchCodeInput
  ): Promise<SearchCodeResult> {
    
    return {
      query: input.query,
      matches: [],
      truncated: false
    };
  }
}
