export interface AgentDefinition {
    id: string;
    instructions: string;
    allowedTools: string[];
    maxIteration: number;
}