import { z } from "zod";

import {
    ImplementationPlanSchema
} from "#/domain/implementation-plan.js";
import type { WorkflowState } from "#/workflow/workflow-state.js";

// Result contracts are currently empty; preserve fields without validating their structure.
const PendingResultSchema = z.record(z.string(), z.unknown());

export const WorkflowStateSchema = z.strictObject({
  workflowId: z.string().min(1),
  traceId: z.string().min(1),
  workspace: z.strictObject({
    id: z.string().min(1),
    root: z.string().min(1)
  }),
  issue: z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string()
  }),
  status: z.enum([
    "planning",
    "implementing",
    "reviewing",
    "human_review",
    "completed",
    "failed",
    "created",
    "testing"
  ]),
  attempts: z.strictObject({
    planning: z.number().int().nonnegative(),
    implementation: z.number().int().nonnegative(),
    review: z.number().int().nonnegative()
  }),
  plan: ImplementationPlanSchema.optional(),
  implementation: PendingResultSchema.optional(),
  tests: PendingResultSchema.optional(),
  review: PendingResultSchema.optional()
}).transform(({
  plan,
  implementation,
  tests,
  review,
  ...state
}): WorkflowState => ({
  ...state,
  ...(plan === undefined ? {} : { plan }),
  ...(implementation === undefined ? {} : { implementation }),
  ...(tests === undefined ? {} : { tests }),
  ...(review === undefined ? {} : { review })
}));
