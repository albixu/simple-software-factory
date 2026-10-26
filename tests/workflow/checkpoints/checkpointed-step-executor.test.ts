import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"

import {
  mkdtemp,
  rm
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import type {
  ExecutionContext
} from "#/runtime/execution-context.js";

import { FileCheckpointStore } from "#/workflow/checkpoints/file-checkpoint-store.js";
import { CheckpointedStepExecutor } from "#/workflow/checkpoints/checkpointed-step-executor.js";

/*
 * Estado reducido para probar la persistencia.
 */

const TestStateSchema = z.object({
  workflowId: z.string(),

  status: z.enum([
    "planning",
    "implementing",
    "completed"
  ]),

  attempts: z.number().int().nonnegative()
});

type TestState = z.infer<typeof TestStateSchema>;

const initialState: TestState = {
  workflowId: "wf-test",
  status: "planning",
  attempts: 0
};

const context: ExecutionContext = {
  workflowId: "wf-test",
  traceId: "trace-test",
  attempt: 1,

  workspace: {
    id: "workspace-test",
    root: "/tmp/repository"
  }
};

describe("CheckpointedStepExecutor", () => {

  let directory: string;

  const createStore = () =>
    new FileCheckpointStore<TestState>(
      directory,
      value => TestStateSchema.parse(value)
    );

  beforeEach(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "agent-factory-")
    );
  });

  afterEach(async () => {
    await rm(directory, {
      recursive: true,
      force: true
    });
  });

  it(
    "resumes from the last persisted checkpoint",
    async () => {

      // Primera ejecución.
      const firstStore = createStore();

      const firstExecutor =
        new CheckpointedStepExecutor(firstStore);

      const firstResult = await firstExecutor.execute(
        initialState,
        context,
        async state => ({
          ...state,
          status: "implementing" as const,
          attempts: state.attempts + 1
        })
      );

      expect(firstResult.status).toBe(
        "implementing"
      );

      const firstCheckpoint =
        await firstStore.load("wf-test");

      expect(firstCheckpoint?.revision).toBe(1);

      // Simulamos un reinicio creando nuevas
      // instancias de almacenamiento y ejecución.
      const secondStore = createStore();

      const secondExecutor =
        new CheckpointedStepExecutor(secondStore);

      const secondResult = await secondExecutor.execute(
        initialState,
        context,
        async state => {

          // Verificamos que se ha recuperado
          // el estado persistido.
          expect(state.status).toBe(
            "implementing"
          );

          expect(state.attempts).toBe(1);

          return {
            ...state,
            status: "completed" as const,
            attempts: state.attempts + 1
          };
        }
      );

      expect(secondResult.status).toBe(
        "completed"
      );

      expect(secondResult.attempts).toBe(2);

      const finalCheckpoint =
        await secondStore.load("wf-test");

      expect(finalCheckpoint?.revision).toBe(2);

      expect(finalCheckpoint?.state.status).toBe(
        "completed"
      );
    }
  );

  it(
    "does not advance the checkpoint when a step fails",
    async () => {

      const store = createStore();

      const executor =
        new CheckpointedStepExecutor(store);

      await executor.execute(
        initialState,
        context,
        async state => ({
          ...state,
          status: "implementing" as const,
          attempts: 1
        })
      );

      await expect(
        executor.execute(
          initialState,
          context,
          async () => {
            throw new Error(
              "Implementation failed"
            );
          }
        )
      ).rejects.toThrow(
        "Implementation failed"
      );

      const checkpoint =
        await store.load("wf-test");

      expect(checkpoint?.revision).toBe(1);

      expect(checkpoint?.state.status).toBe(
        "implementing"
      );
    }
  );

  it(
    "does not execute a step when already cancelled",
    async () => {

      const store = createStore();

      const executor =
        new CheckpointedStepExecutor(store);

      const controller = new AbortController();

      controller.abort(
        new Error("Workflow cancelled")
      );

      const cancelledContext: ExecutionContext = {
        ...context,
        signal: controller.signal
      };

      const step = vi.fn(
        async (state: TestState): Promise<TestState> =>
          state
      );

      await expect(
        executor.execute(
          initialState,
          cancelledContext,
          step
        )
      ).rejects.toThrow(
        "Workflow cancelled"
      );

      expect(step).not.toHaveBeenCalled();

      expect(
        await store.load("wf-test")
      ).toBeNull();
    }
  );
});