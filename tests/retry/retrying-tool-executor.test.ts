import {
  describe,
  expect,
  it
} from "vitest";

import { z } from "zod";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import  type { Tool } from "#/tools/tool.js";
import type { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import type { ToolDefinition } from "#/llm/tool-definition.js";
import { RecoverableToolError } from "#/tools/recoverable-tool-error.js";
import { DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import { InMemoryAuditStore } from "#/audit/in-memory-audit-store.js";
import { InMemoryToolCallBudget } from "#/budget/in-memory-tool-call-budget.js";
import { RetryingToolExecutor } from "#/retry/retrying-tool-executor.js";

const InputSchema = z.object({
  query: z.string().min(1)
});

type SearchInput = z.infer<typeof InputSchema>;

class FlakySearchTool implements Tool<SearchInput, { matches: string[] }> {
  readonly name = "code.search";
  readonly description = "Simulated search";
  readonly inputSchema = InputSchema;
  readonly retrySafety?: "idempotent";
  readonly llmDefinition: ToolDefinition = {
    name: "code.search",
    description: "Simulated search",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string"
        }
      },
      required: ["query"]
    }
  };

  calls = 0;

  constructor(
    private readonly failures: number,
    safeToRetry = true,
    private readonly failureCode: "TEMPORARY_UNAVAILABLE" | "FILE_NOT_FOUND" = "TEMPORARY_UNAVAILABLE"
  ) {
    if (safeToRetry) {
      this.retrySafety = "idempotent";
    }
  }

  async execute(
    input: SearchInput,
    _context: ToolExecutionContext
  ): Promise<{ matches: string[] }> {

    this.calls++;

    if (this.calls <= this.failures) {
      throw new RecoverableToolError(this.failureCode);
    }

    return {
      matches: [input.query]
    };
  }
}

const context = {
  workflowId: "wf-retry",
  traceId: "trace-retry",
  attempt: 1,
  workspace: {
    id: "workspace-test",
    root: "/repository"
  }
};

function createSystem(
  failures: number,
  budgetLimit = 10,
  safeToRetry = true,
  failureCode: "TEMPORARY_UNAVAILABLE" | "FILE_NOT_FOUND" = "TEMPORARY_UNAVAILABLE"
) {

  const tools = new ToolRegistry();
  const tool = new FlakySearchTool(
    failures,
    safeToRetry,
    failureCode
  );

  tools.register(tool);

  const audit = new InMemoryAuditStore();
  const budget = new InMemoryToolCallBudget(budgetLimit);
  const gateway = new AgentGateway(
    tools,
    new DefaultPolicyEngine(),
    audit,
    budget
  );

  const waits: number[] = [];
  const executor = new RetryingToolExecutor(
    gateway,
    tools,
    {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000
    },
    async milliseconds => {
      waits.push(milliseconds);
    }
  );

  return {
    executor,
    tool,
    audit,
    budget,
    waits
  };
}

function request(agentId = "planner") {
  return {
    agentId,
    tool: "code.search",
    arguments: {
      query: "PaymentRepository"
    },
    context
  };
}

describe("RetryingToolExecutor", () => {
  it("retries temporary failures and succeeds", async () => {

      const system = createSystem(2);
      const result = await system.executor.execute(request());

      expect(result).toEqual({
        matches: ["PaymentRepository"]
      });

      expect(system.tool.calls).toBe(3);
      expect(system.waits).toEqual([
        100,
        200
      ]);

      expect(system.budget.getUsed("wf-retry")).toBe(3);

      const events = system.audit.getAll();

      expect(events.map(event => event.type)).toEqual([
        "tool.requested",
        "tool.authorized",
        "tool.failed",

        "tool.requested",
        "tool.authorized",
        "tool.failed",

        "tool.requested",
        "tool.authorized",
        "tool.completed"
      ]);

      const operationIds = new Set(events.map(event => event.operationId));

      expect(operationIds.size).toBe(3);
    }
  );

  it("stops when the budget is exhausted", async () => {

      const system = createSystem(
        99,
        2
      );

      await expect(system.executor.execute(request())).rejects.toThrow("Tool-call budget exhausted");

      expect(system.tool.calls).toBe(2);
      expect(system.budget.getUsed("wf-retry")).toBe(2);
      expect(system.audit.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool.denied",
            denialSource: "budget"
          })
        ])
      );
    }
  );

  it("does not retry tools without retry safety", async () => {
      const system = createSystem(
        99,
        10,
        false
      );

      await expect(system.executor.execute(request())).rejects.toBeInstanceOf(RecoverableToolError);
      expect(system.tool.calls).toBe(1);
      expect(system.waits).toEqual([]);
    }
  );

  it("does not retry non-retryable errors", async () => {
      const system = createSystem(
        99,
        10,
        true,
        "FILE_NOT_FOUND"
      );

      await expect(system.executor.execute(request())).rejects.toBeInstanceOf(RecoverableToolError);
      expect(system.tool.calls).toBe(1);
      expect(system.waits).toEqual([]);
    }
  );

  it("never retries policy denials", async () => {

      const system = createSystem(99);

      await expect(system.executor.execute(request("reviewer"))).rejects.toThrow("Policy denied");
      expect(system.tool.calls).toBe(0);
      expect(system.waits).toEqual([]);
      expect(system.budget.getUsed("wf-retry")).toBe(0);
    }
  );


  it("uses the per-tool retry limit", async () => {
      const tools = new ToolRegistry();
      const tool = new FlakySearchTool(99);

      tools.register(tool);

      const audit = new InMemoryAuditStore();
      const budget = new InMemoryToolCallBudget(10);
      const gateway = new AgentGateway(
        tools,
        new DefaultPolicyEngine(),
        audit,
        budget
      );

      const waits: number[] = [];
      const executor = new RetryingToolExecutor(
        gateway,
        tools,
        {
          maxAttempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 1000,

          maxAttemptsByTool: {
            "code.search": 2
          }
        },
        async milliseconds => {
          waits.push(milliseconds);
        }
      );

      await expect(executor.execute(request())).rejects.toBeInstanceOf(RecoverableToolError);
      expect(tool.calls).toBe(2);
      expect(waits).toEqual([100]);
      expect(budget.getUsed("wf-retry")).toBe(2);
      expect(audit.getAll().filter(event => event.type === "tool.failed")).toHaveLength(2);
    }
  );
});