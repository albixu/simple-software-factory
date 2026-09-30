import {
  describe,
  expect,
  it
} from "vitest";

import { ImplementationPlan, ImplementationPlanSchema } from "#/domain/implementation-plan.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { ScriptedLLMClient } from "#/llm/scripted-llm-client.js";
import { AgentDefinition } from "#/runtime/agent-definition.js";
import { DefaultAgentRuntime } from "#/runtime/default-agent-runtime.js";
import { Message } from "#/runtime/message.js";
import { SearchCodeTool } from "#/tools/code-search/search-code.tool.js";
import { ToolRegistry } from "#/tools/tool-registry.js";


describe(
  "DefaultAgentRuntime",
  () => {

    it(
      "executes a tool call, sends the observation back to the LLM and returns the validated final output",
      async () => {

        /*
         * --------------------------------------------------
         * 1. Configure the scripted LLM
         * --------------------------------------------------
         *
         * First response:
         *   The model asks to execute code.search.
         *
         * Second response:
         *   The model produces the final ImplementationPlan.
         */

        const llm =
          new ScriptedLLMClient([
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
                rootCause:
                  "MERGE source may contain duplicate keys.",

                confidence: 0.85,

                evidence: [
                  {
                    file:
                      "TemplateRepository.php",

                    description:
                      "MERGE statement found."
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
         * 2. Configure tools
         * --------------------------------------------------
         */

        const tools =
          new ToolRegistry();

        tools.register(
          new SearchCodeTool()
        );


        /*
         * --------------------------------------------------
         * 3. Configure Gateway
         * --------------------------------------------------
         */

        const gateway =
          new AgentGateway(
            tools
          );


        /*
         * --------------------------------------------------
         * 4. Create Agent Runtime
         * --------------------------------------------------
         */

        const runtime =
          new DefaultAgentRuntime(
            llm,
            gateway,
            tools
          );


        /*
         * --------------------------------------------------
         * 5. Agent definition
         * --------------------------------------------------
         */

        const definition:
          AgentDefinition<ImplementationPlan> = {

          id: "planner",

          instructions:
            "Investigate the issue.",

          allowedTools: [
            "code.search"
          ],

          maxIteration: 5,

          outputSchema:
            ImplementationPlanSchema
        };


        /*
         * --------------------------------------------------
         * 6. Execute agent
         * --------------------------------------------------
         */

        const result =
          await runtime.execute(
            definition,

            {
              issue: {
                id: "ISSUE-001",

                title: "ORA-30926",

                description:
                  "MERGE fails."
              }
            },

            {
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

              attempt: 1
            }
          );


        /*
         * --------------------------------------------------
         * 7. Verify final result
         * --------------------------------------------------
         */

        expect(
          result.confidence
        ).toBe(0.85);

        expect(
          result.rootCause
        ).toContain(
          "duplicate"
        );


        /*
         * --------------------------------------------------
         * 8. Verify LLM calls
         * --------------------------------------------------
         *
         * There should have been:
         *
         * LLM #1 -> tool call
         * LLM #2 -> final result
         */

        expect(
          llm.requests
        ).toHaveLength(2);


        /*
         * --------------------------------------------------
         * 9. Verify that the tool observation was sent
         *    back to the LLM
         * --------------------------------------------------
         */

        const secondRequest =
          llm.requests[1];

        expect(
          secondRequest
        ).toBeDefined();

        const toolMessage =
          secondRequest!.messages.find(
            (message: Message) =>
              message.role === "tool"
          );

        expect(
          toolMessage
        ).toBeDefined();

        if (
          toolMessage?.role === "tool"
        ) {

          expect(
            toolMessage.toolCallId
          ).toBe("call-1");

          expect(
            toolMessage.content
          ).toContain(
            "MERGE INTO"
          );
        }
      }
    );


    it(
      "stops after maxIterations",
      async () => {

        /*
         * --------------------------------------------------
         * 1. Configure an LLM that never produces
         *    a final response
         * --------------------------------------------------
         */

        const llm =
          new ScriptedLLMClient([
            {
              type: "tool_calls",

              calls: [
                {
                  id: "call-1",

                  name: "code.search",

                  arguments: {
                    query:
                      "PaymentService"
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
                    query:
                      "PaymentService"
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
                    query:
                      "PaymentService"
                  }
                }
              ]
            }
          ]);


        /*
         * --------------------------------------------------
         * 2. Configure infrastructure
         * --------------------------------------------------
         */

        const tools =
          new ToolRegistry();

        tools.register(
          new SearchCodeTool()
        );

        const gateway =
          new AgentGateway(
            tools
          );

        const runtime =
          new DefaultAgentRuntime(
            llm,
            gateway,
            tools
          );


        /*
         * --------------------------------------------------
         * 3. Agent limited to 3 LLM iterations
         * --------------------------------------------------
         */

        const definition:
          AgentDefinition<ImplementationPlan> = {

          id: "planner",

          instructions:
            "Investigate the issue.",

          allowedTools: [
            "code.search"
          ],

          maxIteration: 3,

          outputSchema:
            ImplementationPlanSchema
        };


        /*
         * --------------------------------------------------
         * 4. Execute and verify failure
         * --------------------------------------------------
         */

        await expect(
          runtime.execute(
            definition,

            {
              issue: {
                id: "ISSUE-001",

                title:
                  "Payment failure",

                description:
                  "Investigate PaymentService."
              }
            },

            {
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

              attempt: 1
            }
          )
        ).rejects.toThrow(
          "Agent planner exceeded maximum iterations (3)"
        );


        /*
         * There must not have been a fourth
         * request to the LLM.
         */

        expect(
          llm.requests
        ).toHaveLength(3);
      }
    );
  }
);