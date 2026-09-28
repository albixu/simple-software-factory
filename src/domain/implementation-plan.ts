import { z } from "zod";

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
    proposedChanges: z.array(z.string()),
    requiredTests: z.array(z.string()),
    risks: z.array(z.string())
});


export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;
