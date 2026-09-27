export interface ToolDefinition {
  name: string;
  description: string;

  /**
   * JSON Schema describing the arguments
   * accepted by the tool.
   *
   * This schema is sent to the LLM.
   */
  inputSchema: Record<string, unknown>;
}