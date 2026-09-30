import type { Agent } from "#/agents/agent.js";
import type { PlannerInput } from "#/agents/planner/planner-input.js";
import type { ImplementationPlan } from "#/domain/implementation-plan.js";

import {
  describe,
  expect,
  it
} from "vitest";

import { FakePlannerAgent } from "#/agents/planner/fake-planner.agent.js";
import { PlanningNode } from "#/workflow/nodes/planning.node.js";
import { WorkflowState } from "#/workflow/workflow-state.js";


class LowConfidencePlanner
  implements Agent<
    PlannerInput,
    ImplementationPlan
  > {

  readonly id =
    "low-confidence-planner";


  async run(
    _input: PlannerInput
  ): Promise<ImplementationPlan> {

    return {
      rootCause:
        "Insufficient evidence",

      confidence:
        0.4,

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

describe(
  "PlanningNode",
  () => {

    it(
      "moves the workflow to implementing when confidence is high",
      async () => {

        const planner =
          new FakePlannerAgent();

        const node =
          new PlanningNode(
            planner
          );


        const state:
          WorkflowState = {

          workflowId:
            "wf-test",

          traceId:
            "trace-test",

          workspace: {
            id:
              "workspace-test",

            root:
              "/tmp/repository"
          },

          issue: {
            id:
              "ISSUE-001",

            title:
              "ORA-30926",

            description:
              "MERGE fails"
          },

          status:
            "planning",

          attempts: {
            planning: 0,
            implementation: 0,
            review: 0
          }
        };


        const result =
          await node.execute(
            state
          );


        expect(
          result.status
        ).toBe(
          "implementing"
        );

        expect(
          result.plan
        ).toBeDefined();

        expect(
          result.attempts.planning
        ).toBe(1);

      }
    );

  }
);

describe(
  "PlanningNode low confidence",
  () => {

    it(
      "moves the workflow to human review",
      async () => {

        const planner =
          new LowConfidencePlanner();

        const node =
          new PlanningNode(
            planner
          );


        const state:
          WorkflowState = {

          workflowId:
            "wf-test",

          traceId:
            "trace-test",

          workspace: {
            id:
              "workspace-test",

            root:
              "/tmp/repository"
          },

          issue: {
            id:
              "ISSUE-001",

            title:
              "Unknown failure",

            description:
              "The cause cannot be established."
          },

          status:
            "planning",

          attempts: {
            planning: 0,
            implementation: 0,
            review: 0
          }
        };


        const result =
          await node.execute(
            state
          );


        expect(
          result.status
        ).toBe(
          "human_review"
        );

        expect(
          result.plan?.confidence
        ).toBe(0.4);

        expect(
          result.attempts.planning
        ).toBe(1);

      }
    );

  }
);