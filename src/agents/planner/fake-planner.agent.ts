import { Agent } from "#/agents/agent.ts";
import { PlannerInput } from "#/agents/planner/planner-input.ts";

import {
  ImplementationPlan
} from "#/domain/implementation-plan";


export class FakePlannerAgent
  implements Agent<
    PlannerInput,
    ImplementationPlan
  > {

  readonly id = "planner";

  async execute(
    input: PlannerInput
  ): Promise<ImplementationPlan> {

    return {
      rootCause:
        "The MERGE source query may return multiple " +
        "rows for the same target row.",

      confidence: 0.8,

      evidence: [
        {
          file:
            "src/Repository/TemplateRepository.php",

          description:
            "Potential MERGE statement related to template updates."
        }
      ],

      filesToModify: [
        "src/Repository/TemplateRepository.php"
      ],

      proposedChanges: [
        "Inspect the MERGE USING query.",
        "Ensure that the source produces one row per target key."
      ],

      requiredTests: [
        "Test template update with duplicated source rows."
      ],

      risks: [
        "Removing duplicates incorrectly could change business behaviour."
      ]
    };
  }
}