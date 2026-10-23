import type { Agent } from "#/agents/agent.js";
import type { PlannerInput } from "#/agents/planner/planner-input.js";
import type { ImplementationPlan } from "#/domain/implementation-plan.js";
import type { ExecutionContext } from "#/runtime/execution-context.js";
import type { WorkflowState } from "#/workflow/workflow-state.js";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { FakePlannerAgent } from "#/agents/planner/fake-planner.agent.js";
import { PlanningNode } from "#/workflow/nodes/planning.node.js";

/*
 * Contexto de ejecución compartido.
 */

const context: ExecutionContext = {
  workflowId: "wf-test",
  traceId: "trace-test",
  attempt: 1,
  workspace: {
    id: "workspace-test",
    root: "/tmp/repository"
  }
};

/*
 * Factoría para crear un estado nuevo
 * en cada test.
 */

function createInitialState(
  title = "ORA-30926",
  description = "MERGE fails"
): WorkflowState {
  return {
    workflowId: "wf-test",
    traceId: "trace-test",

    workspace: {
      id: "workspace-test",
      root: "/tmp/repository"
    },

    issue: {
      id: "ISSUE-001",
      title,
      description
    },

    status: "planning",

    attempts: {
      planning: 0,
      implementation: 0,
      review: 0
    }
  };
}

/*
 * Planner que devuelve una confianza baja.
 */

class LowConfidencePlanner
  implements Agent<PlannerInput, ImplementationPlan> {

  readonly id = "low-confidence-planner";

  async run(
    _input: PlannerInput,
    _context: ExecutionContext
  ): Promise<ImplementationPlan> {
    return {
      rootCause: "Insufficient evidence",
      confidence: 0.4,
      evidence: [],
      filesToModify: [],
      proposedChanges: [],
      requiredTests: [],
      risks: [
        "Root cause has not been established."
      ]
    };
  }
}

/*
 * Mock para verificar las llamadas al Planner.
 */

const run = vi.fn(
  async (
    _input: PlannerInput,
    _context: ExecutionContext
  ): Promise<ImplementationPlan> => ({
    rootCause: "Missing null check",
    confidence: 0.9,
    evidence: [],
    filesToModify: [],
    proposedChanges: [],
    requiredTests: [],
    risks: []
  })
);

const mockPlanner: Agent<
  PlannerInput,
  ImplementationPlan
> = {
  id: "planner",
  run
};

describe("PlanningNode", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "moves the workflow to implementing when confidence is high",
    async () => {

      const planner = new FakePlannerAgent();
      const node = new PlanningNode(planner);

      const state = createInitialState();

      const result = await node.execute(
        state,
        context
      );

      expect(result.status).toBe("implementing");
      expect(result.plan).toBeDefined();
      expect(result.attempts.planning).toBe(1);
    }
  );

  it(
    "moves the workflow to human review when confidence is low",
    async () => {

      const planner = new LowConfidencePlanner();
      const node = new PlanningNode(planner);

      const state = createInitialState(
        "Unknown failure",
        "The cause cannot be established."
      );

      const result = await node.execute(
        state,
        context
      );

      expect(result.status).toBe("human_review");
      expect(result.plan?.confidence).toBe(0.4);
      expect(result.attempts.planning).toBe(1);
    }
  );

  it(
    "propagates execution context to planner",
    async () => {

      const node = new PlanningNode(mockPlanner);
      const state = createInitialState();

      await node.execute(state, context);

      expect(run).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          issue: state.issue
        }),
        context
      );
    }
  );

  it(
    "does not execute the planner if cancelled",
    async () => {

      const controller = new AbortController();

      controller.abort(
        new Error("Workflow cancelled")
      );

      const cancelledContext: ExecutionContext = {
        ...context,
        signal: controller.signal
      };

      const node = new PlanningNode(mockPlanner);
      const state = createInitialState();

      await expect(
        node.execute(state, cancelledContext)
      ).rejects.toThrow("Workflow cancelled");

      expect(run).not.toHaveBeenCalled();
    }
  );
});