import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { SearchCodeTool } from "#/tools/code-search/search-code.tool.js";
import { ToolRegistry } from "#/tools/tool-registry.js";

import { AgentGateway } from "#/gateway/agent-gateway.js";

import { PlanningNode } from "#/workflow/nodes/planning.node.js";
import { WorkflowEngine } from "#/workflow/workflow-engine.js";

import { PlannerAgent } from "#/agents/planner/planner.agent.js";
import { LLMResponse } from "#/llm/llm-response.js";
import { ScriptedLLMClient } from "#/llm/scripted-llm-client.js";
import { DefaultAgentRuntime } from "#/runtime/default-agent-runtime.js";
import { FilesystemReadTool } from "#/tools/filesystem-read/filesystem-read.tool.js";
import { WorkflowState } from "#/workflow/workflow-state.js";


async function main(): Promise<void> {

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new SearchCodeTool());
  toolRegistry.register(new FilesystemReadTool());

  const gateway = new AgentGateway(toolRegistry);

  const scriptedLLMClientResponses: LLMResponse[] = [
    {
      type: "final",
      output: {
          rootCause: "ISSUE-001",
          confidence: 0.8,
          evidence: [
            {
              file: '../prueba.ts',
              description: 'Error de sintaxis'
            } 
          ],
          filesToModify: ['../prueba.ts'],
          proposedChanges: ['../prueba.ts'],
          requiredTests: ['Error sintaxis corregido'],
          risks: ['Que no se pueda ejecutar el programa']
      }
    }
  ]
  const llmClient = new ScriptedLLMClient(scriptedLLMClientResponses);
  
  const agentRuntime = new DefaultAgentRuntime(llmClient, gateway, toolRegistry);

  const planner = new PlannerAgent(agentRuntime);

  const planningNode = new PlanningNode(planner);

  const workflowEngine = new WorkflowEngine([planningNode]);

  const workflowId = randomUUID();

  const traceId = randomUUID();

  const initialState: WorkflowState = {
    workflowId,
    traceId,
    workspace: {
      id: `workspace-${workflowId}`,
      root: resolve(process.cwd())
    },

    issue: {
      id: "ISSUE-001",
      title: "ORA-30926 updating template",
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

  console.log(
    "Starting workflow",
    initialState.workflowId
  );

  const finalState = await workflowEngine.run(initialState);

  console.log(
    JSON.stringify(
      finalState,
      null,
      2
    )
  );
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
