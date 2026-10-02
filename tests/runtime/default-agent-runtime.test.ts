import { ImplementationPlan, ImplementationPlanSchema } from "#/domain/implementation-plan.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { ScriptedLLMClient } from "#/llm/scripted-llm-client.js";
import { ToolDefinition } from "#/llm/tool-definition.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";
import { DefaultAgentRuntime } from "#/runtime/default-agent-runtime.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { Tool } from "#/tools/tool.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";


/*
 * ==========================================================
 * Test Tool
 * ==========================================================
 *
 * This tool deliberately does NOT access:
 *
 * - filesystem
 * - ripgrep
 * - network
 * - external APIs
 *
 * The DefaultAgentRuntime tests only need a deterministic
 * tool that behaves like code.search.
 */

const TestSearchInputSchema =
  z.object({
    query: z.string().min(1)
  });


type TestSearchInput = z.infer<typeof TestSearchInputSchema>;

interface TestSearchResult {
  query: string;
  matches: {
    file: string;
    line: number;
    text: string;
  }[];
  truncated: boolean;
}


class TestSearchTool implements Tool<TestSearchInput, TestSearchResult> {
  readonly name = "code.search";
  readonly description = "Deterministic code search tool used by tests.";
  readonly inputSchema = TestSearchInputSchema;
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
      required: [
        "query"
      ],
      additionalProperties: false
    }
  };


  async execute(input: TestSearchInput, _context: ToolExecutionContext): Promise<TestSearchResult> {

    return {
      query: input.query,
      matches: [
        {
          file: "src/Repository/TemplateRepository.php",
          line: 142,
          text: `MERGE INTO example -- ${input.query}`
        }
      ],
      truncated: false
    };
  }
}


describe(
  "DefaultAgentRuntime",
  () => {

    it(
      "executes a tool call, sends the observation back to the LLM and returns the validated final output",
      async () => {

        /*
         * --------------------------------------------------
         * LLM
         *
         * Iteration 1:
         *   asks for code.search
         *
         * Iteration 2:
         *   returns final ImplementationPlan
         * --------------------------------------------------
         */

        const llm = new ScriptedLLMClient([
          {
            type: "tool_calls",
            calls: [
              {
                id: "call-1",
                name: "code.search",
                arguments: {
                  query: "MERGE INTO"
                }
              }
            ]
          },

          {
            type: "final",
            output: {
              rootCause: "MERGE source may contain duplicate keys.",
              confidence: 0.85,
              evidence: [
                {
                  file: "TemplateRepository.php",
                  description: "MERGE statement found."
                }
              ],
              filesToModify: [
                "TemplateRepository.php"
              ],
              proposedChanges: [
                "Ensure one source row per target key."
              ],
              requiredTests: [
                "Duplicate source rows."
              ],
              risks: [
                "Deduplication could affect business semantics."
              ]
            }
          }
        ]);

        /*
         * --------------------------------------------------
         * Tools
         * --------------------------------------------------
         */

        const tools = new ToolRegistry();
        tools.register(new TestSearchTool());

        /*
         * --------------------------------------------------
         * Gateway
         * --------------------------------------------------
         */

        const gateway = new AgentGateway(tools);

        /*
         * --------------------------------------------------
         * Runtime
         * --------------------------------------------------
         */

        const runtime = new DefaultAgentRuntime(llm, gateway, tools);

        /*
         * --------------------------------------------------
         * Agent definition
         * --------------------------------------------------
         */

        const definition: AgentDefinition<ImplementationPlan> = {
          id: "planner",
          instructions: "Investigate the issue.",
          allowedTools: [
            "code.search"
          ],
          maxIteration: 5,
          outputSchema: ImplementationPlanSchema
        };

        /*
         * --------------------------------------------------
         * Execute
         * --------------------------------------------------
         */

        const result = await runtime.execute(
          definition,
          {
            issue: {
              id: "ISSUE-001",
              title: "ORA-30926",
              description: "MERGE fails."
            }
          },
          {
            workflowId: "wf-test",
            traceId: "trace-test",
            workspace: {
              id: "workspace-test",
              root: "/tmp/repository"
            },
            attempt: 1
          }
        );

        /*
         * --------------------------------------------------
         * Final result
         * --------------------------------------------------
         */

        expect(result.confidence).toBe(0.85);
        expect(result.rootCause).toContain("duplicate");

        /*
         * --------------------------------------------------
         * Two LLM iterations
         * --------------------------------------------------
         */

        expect(llm.requests).toHaveLength(2);

        /*
         * --------------------------------------------------
         * Verify tool observation
         *
         * The second LLM request must contain the result
         * produced by TestSearchTool.
         * --------------------------------------------------
         */

        const secondRequest = llm.requests[1];
        expect(secondRequest).toBeDefined();

        const toolMessage = secondRequest!.messages.find(message => message.role === "tool");
        expect(toolMessage).toBeDefined();


        if (toolMessage?.role === "tool") {
          expect(toolMessage.toolCallId).toBe("call-1");
          expect(toolMessage.content).toContain("MERGE INTO");
          expect(toolMessage.content).toContain("TemplateRepository.php");
        }
      }
    );


    it(
      "stops after maxIterations",
      async () => {

        /*
         * The LLM never produces a final answer.
         */

        const llm = new ScriptedLLMClient([
          {
            type: "tool_calls",
            calls: [
              {
                id: "call-1",
                name: "code.search",
                arguments: {
                  query: "PaymentService"
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
                  query: "PaymentService"
                }
              }
            ]
          },
          {
            type: "tool_calls",
            calls: [
              {
                id: "call-3",
                name: "code.search",
                arguments: {
                  query: "PaymentService"
                }
              }
            ]
          }
        ]);

        const tools = new ToolRegistry();


        /*
         * IMPORTANT:
         *
         * We continue using the deterministic test tool.
         *
         * We do NOT want this test to invoke ripgrep.
         */

        tools.register(new TestSearchTool());

        const gateway = new AgentGateway(tools);
        const runtime = new DefaultAgentRuntime(llm, gateway, tools);
        const definition: AgentDefinition<ImplementationPlan> = {
          id: "planner",
          instructions: "Investigate the issue.",
          allowedTools: [
            "code.search"
          ],
          maxIteration: 3,
          outputSchema:
            ImplementationPlanSchema
        };

        await expect(runtime.execute(
          definition,
          {
            issue: {
              id: "ISSUE-001",
              title: "Payment failure",
              description: "Investigate PaymentService."
            }
          },
          {
            workflowId: "wf-test",
            traceId: "trace-test",
            workspace: {
              id: "workspace-test",
              root: "/tmp/repository"
            },
            attempt: 1
          })
        ).rejects.toThrow(
          "Agent planner exceeded maximum iterations (3)"
        );


        /*
         * No fourth LLM request.
         */

        expect(llm.requests).toHaveLength(3);
      }
    );
  }
);