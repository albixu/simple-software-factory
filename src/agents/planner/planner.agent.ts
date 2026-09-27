import { z } from "zod";
import { AgentDefinition } from "./agent.js";


export const ImplementationPlanSchema = z.object({
    rootCause: z.string(),
    confidence: z.number()
        .min(0)
        .max(1),
    evidence: z.array(
        z.object({
            file: z.string(),
            description: z.string(),
        })
    ),
    filesToModify: z.array(z.string()),
    requiredTests: z.array(z.string()),
    risks: z.array(z.string())
});


export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;


export const PlannerAgent: AgentDefinition<ImplementationPlan> = {
    id: "planner",
    instructions: `
        You investigate software issues and produce implementation plans.
        Do not modify files.
        Gather evidence before reaching conclusions.
        Distinguish evidence from assumptions.
        If evidence is insufficient, lower confidence instead of inventing a root cause.`,
    allowedTools: [
        "code.search",
        "filesystem.read"
    ],
    maxIteration: 8,
    outputSchema: ImplementationPlanSchema
};


export interface ImplementationResult {}
export interface TestResult {}
export interface ReviewResult{}