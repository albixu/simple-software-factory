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

import {
  OperationReconciler
} from "#/idempotency/operation-reconciler.js";

describe("OperationReconciler", () => {

  let directory: string;

  const createComponents = () => {

    const journal = new FileOperationJournal(
      directory
    );

    return {
      executor:
        new IdempotentOperationExecutor(journal),

      reconciler:
        new OperationReconciler(journal)
    };
  };

  beforeEach(async () => {

    directory = await mkdtemp(
      join(tmpdir(), "agent-factory-reconcile-")
    );

  });

  afterEach(async () => {

    await rm(directory, {
      recursive: true,
      force: true
    });

  });

  it(
    "recovers an operation completed externally",
    async () => {

      const operationKey =
        "wf-1:create-issue:ora-30926";

      const input =
        "Create issue for ORA-30926";

      /*
       * Simulamos un sistema externo.
       */

      const externalIssues = new Map<
        string,
        string
      >();

      const { executor } =
        createComponents();

      /*
       * La acción crea la incidencia,
       * pero pierde la conexión antes
       * de devolver el resultado.
       */

      const action = vi.fn(
        async (): Promise<string> => {

          externalIssues.set(
            operationKey,
            "ISSUE-123"
          );

          throw new Error(
            "Connection lost"
          );
        }
      );

      await expect(
        executor.run(
          operationKey,
          input,
          action
        )
      ).rejects.toThrow(
        "Connection lost"
      );

      expect(action).toHaveBeenCalledTimes(1);

      /*
       * Simulamos un reinicio.
       */

      const restarted =
        createComponents();

      /*
       * El reconciliador consulta
       * el sistema externo.
       */

      const result =
        await restarted.reconciler.reconcile(
          operationKey,
          input,
          async key => {

            const issueId =
              externalIssues.get(key);

            if (!issueId) {
              return {
                kind: "unknown"
              };
            }

            return {
              kind: "found",
              result: issueId
            };
          }
        );

      expect(result).toEqual({
        status: "completed",
        result: "ISSUE-123"
      });

      /*
       * Una nueva ejecución debe recuperar
       * el resultado sin repetir la acción.
       */

      const finalResult =
        await restarted.executor.run(
          operationKey,
          input,
          action
        );

      expect(finalResult).toBe(
        "ISSUE-123"
      );

      expect(action).toHaveBeenCalledTimes(1);
    }
  );

  it(
    "keeps uncertain operations pending",
    async () => {

      const operationKey =
        "wf-2:create-issue";

      const input =
        "Create another issue";

      const { executor } =
        createComponents();

      await expect(
        executor.run(
          operationKey,
          input,
          async () => {
            throw new Error(
              "Network timeout"
            );
          }
        )
      ).rejects.toThrow(
        "Network timeout"
      );

      const { reconciler } =
        createComponents();

      const result =
        await reconciler.reconcile(
          operationKey,
          input,
          async () => ({
            kind: "unknown"
          })
        );

      expect(result).toEqual({
        status: "pending"
      });
    }
  );

  it(
    "does not query external systems for completed operations",
    async () => {

      const operationKey =
        "wf-3:create-issue";

      const input =
        "Already completed";

      const { executor } =
        createComponents();

      await executor.run(
        operationKey,
        input,
        async () => "ISSUE-999"
      );

      const lookup = vi.fn(
        async () => ({
          kind: "unknown" as const
        })
      );

      const { reconciler } =
        createComponents();

      const result =
        await reconciler.reconcile(
          operationKey,
          input,
          lookup
        );

      expect(result).toEqual({
        status: "completed",
        result: "ISSUE-999"
      });

      expect(lookup).not.toHaveBeenCalled();
    }
  );

});