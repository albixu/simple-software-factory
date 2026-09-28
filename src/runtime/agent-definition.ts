import { z } from "zod";

export interface AgentDefinition <O> {
    id: string;
    instructions: string;
    allowedTools: string[];
    maxIteration: number;
    outputSchema: z.ZodType<O>;
}