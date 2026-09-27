export type WorkflowStatus =
  | "created"
  | "planning"
  | "implementing"
  | "testing"
  | "reviewing"
  | "human_review"
  | "completed"
  | "failed";