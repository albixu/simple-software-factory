import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { SearchCodeTool } from "#/tools/code-search/search-code.tool.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { PlanningNode } from "#/workflow/nodes/planning.node.js";
import { WorkflowEngine } from "#/workflow/workflow-engine.js";
import { PlannerAgent } from "#/agents/planner/planner.agent.js";
import { InMemoryAuditStore } from "#/audit/in-memory-audit-store.js";
import { InMemoryToolCallBudget } from "#/budget/in-memory-tool-call-budget.js";
import { LLMResponse } from "#/llm/llm-response.js";
import { ScriptedLLMClient } from "#/llm/scripted-llm-client.js";
import { ToolMetricsAnalyzer } from "#/observability/tool-metrics-analyzer.js";
import { DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import { RetryingToolExecutor } from "#/retry/retrying-tool-executor.js";
import { DefaultAgentRuntime } from "#/runtime/default-agent-runtime.js";
import { TimedToolCallExecutor } from "#/runtime/timed-tool-call-executor.js";
import { FilesystemReadTool } from "#/tools/filesystem-read/filesystem-read.tool.js";
import { WorkflowState } from "#/workflow/workflow-state.js";
import { WorkflowDeadlineExecutor } from "#/workflow/workflow-deadline-executor.js";
import { ExecutionContext } from "#/runtime/execution-context.js";


async function main(): Promise<void> {

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new SearchCodeTool());
  toolRegistry.register(new FilesystemReadTool());

  const policy = new DefaultPolicyEngine();
  const audit = new InMemoryAuditStore();
  const budget = new InMemoryToolCallBudget(5);
  const gateway = new AgentGateway(toolRegistry, policy, audit, budget);

  const retryingGateway = new RetryingToolExecutor(
    gateway,
    toolRegistry,
    {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000
    }
  );

  const timedGateway = new TimedToolCallExecutor(
    retryingGateway, 
    {
      defaultTimeoutMs: 5000,
      timeoutMsByTool: {
        "code.search": 10000,
        "filesystem.read": 2000
      }
    }
  );

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
  
  const agentRuntime = new DefaultAgentRuntime(llmClient, timedGateway, toolRegistry);

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

  const deadlineExecutor = new WorkflowDeadlineExecutor(60_000); // 60 segundos para todo el workflow

  const executionContext: ExecutionContext = {
    workflowId: initialState.workflowId,
    traceId: crypto.randomUUID(),
    attempt: 1,
    workspace: {
      id: "workspace-local",
      root: process.cwd()
    }
  };

  const result = await deadlineExecutor.execute(
    executionContext,
    context =>
      workflowEngine.run(
        initialState,
        context
      )
  );

  switch (result.status) {
    case "completed":
      console.log("Workflow execution finished:", result.value);
      break;
    case "timed_out":
      console.error("Workflow exceeded its 60-second deadline");
      break;
    case "cancelled":
      console.log("Workflow was cancelled");
      break;
    case "failed":
      console.error("Workflow execution failed:", result.error
      );
      break;
  }

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  const events = audit.getAll();
  const analyzer = new ToolMetricsAnalyzer();
  const metrics = analyzer.analyze(events, initialState.traceId, 8);

  console.log("BUDGET USED:", budget.getUsed(initialState.workflowId));
  console.log("AUDIT EVENTS", JSON.stringify(events, null, 2));
  console.log("TOOL METRICS", JSON.stringify(metrics, null, 2));
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
