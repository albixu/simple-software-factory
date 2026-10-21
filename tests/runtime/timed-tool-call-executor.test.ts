import {
  describe,
  expect,
  it
} from "vitest";

import {
  setTimeout as sleepTimeout
} from "node:timers/promises";

import { z } from "zod";
import {   AgentGateway } from "#/gateway/agent-gateway.js";
import {   ToolRegistry } from "#/tools/tool-registry.js";
import type {   Tool } from "#/tools/tool.js";
import type {   ToolDefinition } from "#/llm/tool-definition.js";
import type {   ToolExecutionContext } from "#/tools/tool-execution-context.js";
import {   DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import {   InMemoryAuditStore } from "#/audit/in-memory-audit-store.js";
import {   InMemoryToolCallBudget } from "#/budget/in-memory-tool-call-budget.js";
import {   RecoverableToolError } from "#/tools/recoverable-tool-error.js";
import {   RetryingToolExecutor } from "#/retry/retrying-tool-executor.js";
import {   TimedToolCallExecutor } from "#/runtime/timed-tool-call-executor.js";


const InputSchema = z.object({
  query: z.string()
});

type SearchInput = z.infer<typeof InputSchema>;

type Mode = "slow" | "fast" | "temporary";


class TestSearchTool
  implements Tool<SearchInput, string> {

  readonly name = "code.search";

  readonly description = "Test search";

  readonly inputSchema = InputSchema;

  readonly retrySafety = "idempotent" as const;

  readonly llmDefinition: ToolDefinition = {
    name: "code.search",
    description: "Test search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  };

  calls = 0;

  constructor(
    private readonly mode: Mode
  ) {}


  async execute(
    input: SearchInput,
    context: ToolExecutionContext
  ): Promise<string> {

    this.calls++;

    if (this.mode === "temporary") {
      throw new RecoverableToolError(
        "TEMPORARY_UNAVAILABLE"
      );
    }

    if (this.mode === "slow") {
      await sleepTimeout(
        500,
        undefined,
        context.signal
          ? { signal: context.signal }
          : undefined
      );
    }

    context.signal?.throwIfAborted();

    return input.query;
  }
}


const request = {
  agentId: "planner",
  tool: "code.search",
  arguments: {
    query: "PaymentRepository"
  },
  context: {
    workflowId: "wf-timeout",
    traceId: "trace-timeout",
    attempt: 1,
    workspace: {
      id: "workspace-test",
      root: "/repository"
    }
  }
};


function createSystem(mode: Mode) {

  const tools = new ToolRegistry();

  const tool = new TestSearchTool(mode);

  tools.register(tool);

  const audit = new InMemoryAuditStore();

  const budget =
    new InMemoryToolCallBudget(10);

  const gateway = new AgentGateway(
    tools,
    new DefaultPolicyEngine(),
    audit,
    budget
  );

  return {
    tools,
    tool,
    audit,
    budget,
    gateway
  };
}


describe("TimedToolCallExecutor", () => {

  it(
    "cancels a slow tool",
    async () => {

      const system = createSystem("slow");

      const retrying =
        new RetryingToolExecutor(
          system.gateway,
          system.tools,
          {
            maxAttempts: 3,
            baseDelayMs: 10,
            maxDelayMs: 50
          }
        );

      const timed =
        new TimedToolCallExecutor(
          retrying,
          { defaultTimeoutMs: 30 }
        );

      await expect(
        timed.execute(request)
      ).rejects.toThrow();

      /*
       * No se ha iniciado otro intento.
       */

      expect(system.tool.calls).toBe(1);

      /*
       * El intento admitido consume
       * presupuesto aunque sea cancelado.
       */

      expect(
        system.budget.getUsed("wf-timeout")
      ).toBe(1);

      expect(
        system.audit.getAll()
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "tool.failed",
            stage: "execution"
          })
        ])
      );
    }
  );


  it(
    "returns a fast tool result",
    async () => {

      const system = createSystem("fast");

      const timed =
        new TimedToolCallExecutor(
          system.gateway,
          {
            defaultTimeoutMs: 1000
          }
        );

      const result =
        await timed.execute(request);

      expect(result).toBe(
        "PaymentRepository"
      );

      expect(system.tool.calls).toBe(1);

      expect(
        system.audit.getAll().at(-1)?.type
      ).toBe("tool.completed");
    }
  );


  it(
    "stops retrying when cancelled during backoff",
    async () => {

      const system =
        createSystem("temporary");

      const controller =
        new AbortController();

      const waits: number[] = [];

      const retrying =
        new RetryingToolExecutor(
          system.gateway,
          system.tools,
          {
            maxAttempts: 3,
            baseDelayMs: 100,
            maxDelayMs: 500
          },
          async (milliseconds, signal) => {

            waits.push(milliseconds);

            controller.abort(
              new Error("Workflow cancelled")
            );

            signal?.throwIfAborted();
          }
        );

      await expect(
        retrying.execute({
          ...request,
          signal: controller.signal
        })
      ).rejects.toThrow(
        "Workflow cancelled"
      );

      expect(system.tool.calls).toBe(1);

      expect(waits).toEqual([100]);

      expect(
        system.budget.getUsed("wf-timeout")
      ).toBe(1);
    }
  );
});