import {
  describe,
  expect,
  it
} from "vitest";
import { TimedToolCallExecutor } from "#/runtime/timed-tool-call-executor.js";
import type { ToolCallExecutor } from "#/runtime/tool-call-executor.js";
import type{ ToolRequest } from "#/tools/tool-request.js";
import {
    setTimeout as sleepTimeout 
} from "node:timers/promises";



const context = {
  workflowId: "wf-config",
  traceId: "trace-config",
  attempt: 1,
  workspace: {
    id: "workspace",
    root: "/repository"
  }
};


function makeRequest(
  tool: string
): ToolRequest {

  return {
    agentId: "planner",
    tool,
    arguments: {},
    context
  };
}


describe(
  "TimedToolCallExecutor configuration",
  () => {

    it(
      "uses a specific timeout for each tool",
      async () => {

        const receivedSignals:
          AbortSignal[] = [];

        const delegate: ToolCallExecutor = {
          async execute(request) {

            expect(
              request.signal
            ).toBeDefined();

            receivedSignals.push(
              request.signal!
            );

            return "ok";
          }
        };

        const timed =
          new TimedToolCallExecutor(
            delegate,
            {
              defaultTimeoutMs: 5000,

              timeoutMsByTool: {
                "code.search": 10000,
                "filesystem.read": 2000
              }
            }
          );

        await timed.execute(
          makeRequest("code.search")
        );

        await timed.execute(
          makeRequest("filesystem.read")
        );

        await timed.execute(
          makeRequest("other.tool")
        );

        expect(
          receivedSignals
        ).toHaveLength(3);

        expect(
          receivedSignals.every(
            signal => !signal.aborted
          )
        ).toBe(true);
      }
    );


    it(
      "rejects invalid timeout configuration",
      () => {

        const delegate: ToolCallExecutor = {
          async execute() {
            return "ok";
          }
        };

        expect(
          () => new TimedToolCallExecutor(
            delegate,
            {
              defaultTimeoutMs: 0
            }
          )
        ).toThrow();

        expect(
          () => new TimedToolCallExecutor(
            delegate,
            {
              defaultTimeoutMs: 5000,

              timeoutMsByTool: {
                "code.search": -100
              }
            }
          )
        ).toThrow();

        expect(
          () => new TimedToolCallExecutor(
            delegate,
            {
              defaultTimeoutMs: 5000,

              timeoutMsByTool: {
                "code.search": 2.5
              }
            }
          )
        ).toThrow();
      }
    );


    it(
        "applies the tool timeout instead of the default",
        async () => {

            let calls = 0;

            const delegate: ToolCallExecutor = {
            async execute(request) {

                calls++;

                await sleepTimeout(
                500,
                undefined,
                request.signal
                    ? { signal: request.signal }
                    : undefined
                );

                return "completed";
            }
            };

            const timed =
            new TimedToolCallExecutor(
                delegate,
                {
                defaultTimeoutMs: 2000,

                timeoutMsByTool: {
                    "code.search": 30
                }
                }
            );

            await expect(
            timed.execute(
                makeRequest("code.search")
            )
            ).rejects.toThrow();

            expect(calls).toBe(1);
        }
    );
  }
);