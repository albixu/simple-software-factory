import {
  describe,
  expect,
  it
} from "vitest";
import { WorkflowDeadlineExecutor } from "#/workflow/workflow-deadline-executor.js";
import type { ExecutionContext } from "#/runtime/execution-context.js";

const baseContext: ExecutionContext = {
  workflowId: "wf-deadline",
  traceId: "trace-deadline",
  attempt: 1,

  workspace: {
    id: "workspace-test",
    root: "/repository"
  }
};

/*
 * Espera hasta que una señal se aborte.
 *
 * No utilizamos temporizadores reales.
 */

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
  "WorkflowDeadlineExecutor",
  () => {

    it(
      "returns completed when the workflow finishes",
      async () => {

        const executor =
          new WorkflowDeadlineExecutor(
            5000
          );

        const result =
          await executor.execute(
            baseContext,

            async context => {

              expect(
                context.workflowId
              ).toBe("wf-deadline");

              expect(
                context.signal
              ).toBeDefined();

              return {
                plan: "completed"
              };
            }
          );

        expect(result).toEqual({
          status: "completed",

          value: {
            plan: "completed"
          }
        });
      }
    );

    it(
      "returns timed_out when the deadline expires",
      async () => {

        const controller =
          new AbortController();

        const executor =
          new WorkflowDeadlineExecutor(
            5000,

            () => controller.signal
          );

        let receivedSignal:
          AbortSignal | undefined;

        const pending =
          executor.execute(
            baseContext,

            async context => {

              receivedSignal =
                context.signal;

              return waitForAbort(
                context.signal!
              );
            }
          );

        /*
         * Provocamos manualmente
         * el vencimiento.
         */

        controller.abort(
          new Error("Deadline exceeded")
        );

        const result = await pending;

        expect(result).toEqual({
          status: "timed_out"
        });

        expect(
          receivedSignal?.aborted
        ).toBe(true);
      }
    );

    it(
      "distinguishes external cancellation",
      async () => {

        const external =
          new AbortController();

        const deadline =
          new AbortController();

        const executor =
          new WorkflowDeadlineExecutor(
            5000,
            () => deadline.signal
          );

        const pending =
          executor.execute(
            {
              ...baseContext,
              signal: external.signal
            },

            async context =>
              waitForAbort(
                context.signal!
              )
          );

        external.abort(
          new Error("Cancelled by user")
        );

        const result = await pending;

        expect(result).toEqual({
          status: "cancelled"
        });

        expect(
          deadline.signal.aborted
        ).toBe(false);
      }
    );

    it(
      "returns failed for ordinary errors",
      async () => {

        const executor =
          new WorkflowDeadlineExecutor(
            5000
          );

        const failure =
          new Error("Unexpected failure");

        const result =
          await executor.execute(
            baseContext,

            async () => {
              throw failure;
            }
          );

        expect(result).toEqual({
          status: "failed",
          error: failure
        });
      }
    );

    it(
      "does not start an already cancelled workflow",
      async () => {

        const controller =
          new AbortController();

        controller.abort(
          new Error("Already cancelled")
        );

        let executed = false;

        const executor =
          new WorkflowDeadlineExecutor(
            5000
          );

        const result =
          await executor.execute(
            {
              ...baseContext,
              signal: controller.signal
            },

            async () => {
              executed = true;
              return "completed";
            }
          );

        expect(executed).toBe(false);

        expect(result).toEqual({
          status: "cancelled"
        });
      }
    );
  }
);