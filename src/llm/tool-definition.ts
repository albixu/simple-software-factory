export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}