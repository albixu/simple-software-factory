import {
    describe,
    expect,
    it
} from "vitest";

import type { LLMClient } from "#/llm/llm-client.js";
import type { AgentDefinition } from "#/runtime/agent-definition.js";
import { DefaultAgentRuntime } from "#/runtime/default-agent-runtime.js";
import type { ExecutionContext } from "#/runtime/execution-context.js";
import type { ToolCallExecutor } from "#/runtime/tool-call-executor.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { z } from "zod";

const OutputSchema = z.object({
  completed: z.boolean()
});

const agent: AgentDefinition<
  z.infer<typeof OutputSchema>
> = {
  id: "planner",

  instructions:
    "Investigate the issue.",

  allowedTools: [],

  maxIterations: 3,

  outputSchema: OutputSchema
};

const context: ExecutionContext = {
  workflowId: "wf-cancellation",

  traceId: "trace-cancellation",

  attempt: 1,

  workspace: {
    id: "workspace-test",
    root: "/repository"
  }
};

function waitForAbort(
  signal: AbortSignal
): Promise<never> {

  return new Promise(
    (_resolve, reject) => {

      if (signal.aborted) {
        reject(signal.reason);
        return;
      }

      signal.addEventListener(
        "abort",
        () => reject(signal.reason),
        { once: true }
      );
    }
  );
}

describe(
  "DefaultAgentRuntime cancellation",
  () => {

    it(
      "propagates cancellation to the LLM",
      async () => {

        const controller =
          new AbortController();

        let receivedSignal:
          AbortSignal | undefined;

        let llmCalls = 0;

        const llm: LLMClient = {
          async generate(request) {

            llmCalls++;

            receivedSignal =
              request.signal;

            if (!request.signal) {
              throw new Error(
                "Missing AbortSignal"
              );
            }

            return waitForAbort(
              request.signal
            );
          }
        };

        const tools =
          new ToolRegistry();

        const gateway:
          ToolCallExecutor = {

          async execute() {
            throw new Error(
              "No tool should be executed"
            );
          }
        };

        const runtime =
          new DefaultAgentRuntime(
            llm,
            gateway,
            tools
          );

        const pending =
          runtime.execute(
            agent,
            {
              issue: "Investigate payment"
            },
            {
              ...context,
              signal: controller.signal
            }
          );

        /*
         * Cancelamos mientras el LLM
         * está esperando.
         */

        controller.abort(
          new Error(
            "Workflow cancelled"
          )
        );

        await expect(
          pending
        ).rejects.toThrow(
          "Workflow cancelled"
        );

        expect(llmCalls).toBe(1);

        expect(
          receivedSignal
        ).toBe(
          controller.signal
        );

        expect(
          receivedSignal?.aborted
        ).toBe(true);
      }
    );
  }
);