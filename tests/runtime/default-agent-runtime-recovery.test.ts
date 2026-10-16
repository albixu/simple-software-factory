import {
  describe,
  expect,
  it
} from "vitest";
import { z } from "zod";
import { DefaultAgentRuntime } from "#/runtime/default-agent-runtime.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";
import { ExecutionContext } from "#/runtime/execution-context.js";
import { ScriptedLLMClient } from "#/llm/scripted-llm-client.js";
import { Tool } from "#/tools/tool.js";
import { ToolDefinition } from "#/llm/tool-definition.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { RecoverableToolError } from "#/tools/recoverable-tool-error.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import { InMemoryAuditStore } from "#/audit/in-memory-audit-store.js";
import { InMemoryToolCallBudget } from "#/budget/in-memory-tool-call-budget.js";

const SearchInputSchema = z.object({
  query: z.string().min(1)
});

class FlakySearchTool implements Tool {
  readonly name = "code.search";
  readonly description = "Test search tool";
  readonly inputSchema: z.ZodType<unknown> = SearchInputSchema;
  readonly llmDefinition: ToolDefinition = {
    name: this.name,
    description: this.description,
    inputSchema: {
        type: "object",
        properties: {
            query: {
            type: "string",
            minLength: 1
            }
        },
        required: ["query"],
        additionalProperties: false
    }
  };

  calls = 0;

  constructor(private readonly failuresBeforeSuccess = 1) {}

  async execute(
    input: unknown,
    _context: ToolExecutionContext
  ): Promise<unknown> {
    const { query } = SearchInputSchema.parse(input);
    this.calls++;

    if (this.calls <= this.failuresBeforeSuccess) {
      throw new RecoverableToolError("TEMPORARY_UNAVAILABLE");
    }

    return { 
        matches: [
            {
                file: "src/payment.ts",
                line: 12,
                text: `Found ${query}`
            }
        ],
        truncated: false
    };
  }
}

const OutputSchema = z.object({
  status: z.string()
});


const agent: AgentDefinition<
  z.infer<typeof OutputSchema>
> = {
    id: "planner",
    instructions: "Investigate using tools. Adapt to recoverable errors.",
    allowedTools: ["code.search"],
    maxIteration: 4,
    outputSchema: OutputSchema
};


const context: ExecutionContext = {
    workflowId: "wf-recovery",
    traceId: "trace-recovery",
    attempt: 1,
    workspace: {
        id: "workspace-test",
        root: "/repository"
    }
};


function createSystem(
    llm: ScriptedLLMClient,
    maxToolCalls = 5,
    failuresBeforeSuccess = 1
) {
    const tools = new ToolRegistry();
    const tool = new FlakySearchTool(failuresBeforeSuccess);
    tools.register(tool);

    const audit = new InMemoryAuditStore();
    const budget = new InMemoryToolCallBudget(maxToolCalls);
    const gateway = new AgentGateway(
        tools,
        new DefaultPolicyEngine(),
        audit,
        budget
    );

    const runtime = new DefaultAgentRuntime(
        llm,
        gateway,
        tools
    );

    return {
        runtime,
        tool,
        audit,
        budget
    };
}

describe("DefaultAgentRuntime recovery", () => {
    it("continues after a recoverable tool error", async () => {
        const llm = new ScriptedLLMClient([
            {
                type: "tool_calls",
                calls: [
                {
                    id: "call-1",
                    name: "code.search",
                    arguments: {
                    query: "Payment"
                    }
                }
                ]
            },
            {
                type: "tool_calls",
                calls: [
                {
                    id: "call-2",
                    name: "code.search",
                    arguments: {
                    query: "PaymentRepository"
                    }
                }
                ]
            },
            {
                type: "final",
                output: {
                status: "investigation_completed"
                }
            }
            ]);

        const {
            runtime,
            tool,
            audit,
            budget
        } = createSystem(llm);

        const result = await runtime.execute(
            agent,
            { issue: "Find payment repository" },
            context
        );

        expect(result).toEqual({status: "investigation_completed"});
        expect(tool.calls).toBe(2);
        expect(budget.getUsed("wf-recovery")).toBe(2);
        expect(llm.requests).toHaveLength(3);

        /*
         * La segunda petición al LLM
         * contiene el error recuperable.
         */

        expect(llm.requests[1]?.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: "tool",
                    toolCallId: "call-1",
                    content: JSON.stringify({
                        ok: false,
                        error: {
                        code: "TEMPORARY_UNAVAILABLE",
                        message:
                            "The tool is temporarily unavailable. " +
                            "Try an alternative approach or retry if appropriate.",
                        retryable: true
                        }
                    })
                })
            ])
        );

        /*
         * La auditoría conserva
         * el fallo y el éxito posterior.
         */

        expect(audit.getAll().map(event => event.type)).toEqual([
            "tool.requested",
            "tool.authorized",
            "tool.failed",
            "tool.requested",
            "tool.authorized",
            "tool.completed"
        ]);

        expect(audit.getAll()[2]?.stage).toBe("execution");
      }
    );

    it("does not recover from policy denials", async () => {
        const llm = new ScriptedLLMClient([
            {
                type: "tool_calls",
                calls: [
                    {
                        id: "call-1",
                        name: "code.search",
                        arguments: {
                        query: "Payment"
                        }
                    }
                ]
            }
        ]);

        const {
            runtime,
            tool,
            audit,
            budget
        } = createSystem(llm);

        const reviewer = {...agent, id: "reviewer"};

        await expect(runtime.execute(
            reviewer,
            { issue: "Inspect payment" },
            context
        )).rejects.toThrow("Policy denied");

        expect(tool.calls).toBe(0);
        expect(budget.getUsed("wf-recovery")).toBe(0);
        expect(llm.requests).toHaveLength(1);

        expect(audit.getAll()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "tool.denied",
                    denialSource: "policy"
                })
            ])
        );
      }
    );

    it("does not recover from budget exhaustion", async () => {
        const llm = new ScriptedLLMClient([
            {
                type: "tool_calls",
                calls: [
                {
                    id: "call-1",
                    name: "code.search",
                    arguments: {
                    query: "Payment"
                    }
                }
                ]
            }
        ]);

        const {
          runtime,
          tool,
          audit
        } = createSystem(llm, 0);

        await expect(runtime.execute(
            agent,
            { issue: "Inspect payment" },
            context
        )).rejects.toThrow("Tool-call budget exhausted");

        expect(tool.calls).toBe(0);
        expect(llm.requests).toHaveLength(1);
        expect(audit.getAll()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                type: "tool.denied",
                denialSource: "budget"
                })
            ])
        );
      }
    );


    it("stops after exceeding the recoverable error limit", async () => {
        const llm = new ScriptedLLMClient([
        {
            type: "tool_calls",
            calls: [
            {
                id: "call-1",
                name: "code.search",
                arguments: {
                query: "Payment"
                }
            }
            ]
        },
        {
            type: "tool_calls",
            calls: [
            {
                id: "call-2",
                name: "code.search",
                arguments: {
                query: "PaymentRepository"
                }
            }
            ]
        },
        {
            type: "final",
            output: {
            status: "should_not_be_reached"
            }
        }
        ]);

        const {
            runtime,
            tool,
            audit,
            budget
        } = createSystem(llm, 5, 99);

        const limitedAgent = {
            ...agent,
            maxRecoverableToolErrors: 1
        };

        await expect(runtime.execute(
            limitedAgent,
            { issue: "Find payment repository" },
            context
        )).rejects.toThrow("exceeded recoverable tool error limit");

        /*
        * Primera operación: recuperable.
        * Segunda operación: supera el límite.
        */

        expect(tool.calls).toBe(2);
        expect(llm.requests).toHaveLength(2);

        /*
        * Ambas operaciones fueron admitidas
        * y consumieron presupuesto.
        */

        expect(budget.getUsed("wf-recovery")).toBe(2);

        /*
        * La auditoría registra ambos fallos.
        */

        const executionFailures = audit.getAll().filter(
            event => event.type === "tool.failed" && event.stage === "execution"
        );

        expect(executionFailures).toHaveLength(2);
    });
  }
);