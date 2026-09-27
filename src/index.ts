import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { SearchCodeTool } from "#/tools/code-search/search-code.tool.ts";
import { ToolRegistry } from "#/tools/tool-registry.ts";

import { AgentGateway } from "#/gateway/agent-gateway.ts";

import { PlanningNode } from "#/workflow/nodes/planning.node.ts";
import { WorkflowEngine } from "#/workflow/workflow-engine.ts";

import { FakePlannerAgent } from "#/agents/planner/fake-planner.agent.ts";


async function main(): Promise<void> {
  /*
   * --------------------------------------------------
   * 1. Infrastructure
   * --------------------------------------------------
   */

  const toolRegistry =
    new ToolRegistry();

  toolRegistry.register(
    new SearchCodeTool()
  );


  /*
   * --------------------------------------------------
   * 2. Gateway
   * --------------------------------------------------
   *
   * All tool executions will eventually pass through
   * this gateway.
   *
   * PolicyEngine, AuditStore and limits will be added
   * here progressively.
   */

  const gateway =
    new AgentGateway(
      toolRegistry
    );


  /*
   * --------------------------------------------------
   * 3. Agents
   * --------------------------------------------------
   *
   * We temporarily keep FakePlannerAgent because
   * DefaultAgentRuntime + real LLMClient are not yet
   * implemented.
   */

  const planner =
    new FakePlannerAgent();


  /*
   * --------------------------------------------------
   * 4. Workflow nodes
   * --------------------------------------------------
   */

  const planningNode =
    new PlanningNode(
      planner
    );


  /*
   * --------------------------------------------------
   * 5. Workflow engine
   * --------------------------------------------------
   */

  const workflowEngine =
    new WorkflowEngine(new Map([
      [planningNode.id, planningNode]
    ]));


  /*
   * --------------------------------------------------
   * 6. Initial workflow state
   * --------------------------------------------------
   */

  const workflowId =
    randomUUID();

  const traceId =
    randomUUID();

  const initialState: WorkflowState = {
    workflowId,

    traceId,

    workspace: {
      id: `workspace-${workflowId}`,

      /*
       * For now we use the current project directory
       * as the repository workspace.
       */
      root: resolve(process.cwd())
    },

    issue: {
      id: "ISSUE-001",

      title:
        "ORA-30926 updating template",

      description:
        "Updating a template sometimes fails with " +
        "ORA-30926: unable to get a stable set of rows " +
        "in the source tables."
    },

    status: "planning",

    attempts: {
      planning: 0,
      implementation: 0,
      review: 0
    }
  };


  /*
   * --------------------------------------------------
   * 7. Run workflow
   * --------------------------------------------------
   */

  console.log(
    "Starting workflow",
    {
      workflowId,
      traceId,
      workspace:
        initialState.workspace.root
    }
  );

  const finalState =
    await workflowEngine.run(
      initialState
    );

  console.log(
    "Workflow finished",
    {
      status:
        finalState.status,

      plan:
        finalState.plan
    }
  );


  /*
   * Gateway is currently created but not used by the
   * FakePlannerAgent.
   *
   * It will become active when FakePlannerAgent is
   * replaced by DefaultAgentRuntime.
   */
  void gateway;
}


main().catch(
  (error: unknown) => {

    console.error(
      "Fatal error:",
      error
    );

    process.exitCode = 1;
  }
);
