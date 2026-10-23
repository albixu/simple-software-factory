import { z } from "zod";

export interface AgentDefinition <O> {
    id: string;
    instructions: string;
    allowedTools: string[];
    maxIterations: number;
    maxRecoverableToolErrors?: number;
    outputSchema: z.ZodType<O>;
}