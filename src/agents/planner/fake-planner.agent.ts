import { Agent } from "#/agents/agent.js";
import { PlannerInput } from "#/agents/planner/planner-input.js";
import { ImplementationPlan } from "#/domain/implementation-plan.js";
import { ExecutionContext } from "#/runtime/execution-context.js";


export class FakePlannerAgent
  implements Agent<
    PlannerInput,
    ImplementationPlan
  > {

  readonly id = "planner";

  async run(
    _input: PlannerInput,
    _context: ExecutionContext
  ): Promise<ImplementationPlan> {

    return {
      rootCause:
        "The MERGE source query may return multiple rows for the same target row.",

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