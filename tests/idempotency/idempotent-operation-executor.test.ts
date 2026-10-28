import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  mkdtemp,
  rm
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FileOperationJournal
} from "#/idempotency/file-operation-journal.js";

import {
  IdempotentOperationExecutor
} from "#/idempotency/idempotent-operation-executor.js";

describe("IdempotentOperationExecutor", () => {

  let directory: string;

  const createExecutor = () => {
    const journal = new FileOperationJournal(
      directory
    );

    return new IdempotentOperationExecutor(
      journal
    );
  };

  beforeEach(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "agent-factory-idempotency-")
    );
  });

  afterEach(async () => {
    await rm(directory, {
      recursive: true,
      force: true
    });
  });

  it(
    "does not execute an already completed operation twice",
    async () => {

      const action = vi.fn(
        async () => "ticket-123"
      );

      const firstExecutor = createExecutor();

      const firstResult = await firstExecutor.run(
        "wf-1:create-ticket:issue-1",
        "Issue description",
        action
      );

      expect(firstResult).toBe("ticket-123");

      /*
       * Creamos otra instancia para simular
       * un reinicio de la aplicación.
       */

      const secondExecutor = createExecutor();

      const secondResult = await secondExecutor.run(
        "wf-1:create-ticket:issue-1",
        "Issue description",
        action
      );

      expect(secondResult).toBe("ticket-123");

      /*
       * La acción solo se ha ejecutado una vez.
       */

      expect(action).toHaveBeenCalledTimes(1);
    }
  );

  it(
    "rejects reusing a key with different input",
    async () => {

      const executor = createExecutor();

      await executor.run(
        "wf-1:create-ticket",
        "First issue",
        async () => "ticket-123"
      );

      await expect(
        executor.run(
          "wf-1:create-ticket",
          "Different issue",
          async () => "ticket-456"
        )
      ).rejects.toThrow(
        "Idempotency key reused with different input"
      );
    }
  );

  it(
    "does not automatically retry an uncertain operation",
    async () => {

      const executor = createExecutor();

      const action = vi.fn(
        async (): Promise<string> => {
          throw new Error(
            "Connection lost after sending request"
          );
        }
      );

      /*
       * La primera ejecución falla.
       * Su registro permanece en started.
       */

      await expect(
        executor.run(
          "wf-1:create-ticket:issue-2",
          "Issue description",
          action
        )
      ).rejects.toThrow(
        "Connection lost after sending request"
      );

      /*
       * Simulamos el reinicio.
       */

      const restartedExecutor = createExecutor();

      await expect(
        restartedExecutor.run(
          "wf-1:create-ticket:issue-2",
          "Issue description",
          action
        )
      ).rejects.toThrow(
        "requires reconciliation"
      );

      /*
       * No se ha repetido la operación.
       */

      expect(action).toHaveBeenCalledTimes(1);
    }
  );
});