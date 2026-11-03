import { createHash, randomUUID } from "node:crypto";

import pg from "pg";

import {
  afterAll,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  PgOperationJournal
} from "#/idempotency/pg-operation-journal.js";

import {
  PgIdempotentOperationExecutor
} from "#/idempotency/pg-idempotent-operation-executor.js";

const { Pool } = pg;

const databaseUrl = process.env.PG_TEST_URL;

describe.skipIf(!databaseUrl)(
  "PgIdempotentOperationExecutor",
  () => {

    const pool = new Pool({
      connectionString: databaseUrl
    });

    const journal = new PgOperationJournal(
      pool,
      60
    );

    const executorA =
      new PgIdempotentOperationExecutor(journal);

    const executorB =
      new PgIdempotentOperationExecutor(journal);

    afterAll(async () => {
      await pool.end();
    });

    it(
      "prevents two workers from executing the same operation",
      async () => {

        const key = `test:${randomUUID()}`;

        let releaseAction!: () => void;
        let notifyStarted!: () => void;

        /*
         * Una promesa mantiene bloqueada
         * la primera operación.
         */

        const gate = new Promise<void>(
          resolve => {
            releaseAction = resolve;
          }
        );

        const started = new Promise<void>(
          resolve => {
            notifyStarted = resolve;
          }
        );

        const action = vi.fn(
          async () => {

            notifyStarted();

            await gate;

            return "ISSUE-123";
          }
        );

        /*
         * Worker A adquiere la reserva.
         */

        const first = executorA.run(
          key,
          "Create issue",
          action
        );

        await started;

        /*
         * Worker B intenta ejecutar
         * exactamente la misma operación.
         */

        try {
          await expect(
            executorB.run(
              key,
              "Create issue",
              action
            )
          ).rejects.toThrow(
            "requires reconciliation"
          );
        } finally {
          releaseAction();
        }

        /*
         * Worker A termina.
         */

        await expect(first).resolves.toBe(
          "ISSUE-123"
        );

        /*
         * La acción se ejecutó una sola vez.
         */

        expect(action).toHaveBeenCalledTimes(1);

        /*
         * Una nueva llamada recupera
         * el resultado anterior.
         */

        const cached = await executorB.run(
          key,
          "Create issue",
          action
        );

        expect(cached).toBe("ISSUE-123");

        expect(action).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "rejects confirmation from a worker that lost ownership",
      async () => {

        const key = `test:${randomUUID()}`;

        const inputHash = createHash("sha256")
          .update("Create issue")
          .digest("hex");

        /*
         * Worker A adquiere la reserva.
         */

        const reservation = await journal.reserve(
          key,
          inputHash
        );

        expect(reservation.kind).toBe("acquired");

        if (reservation.kind !== "acquired") {
          throw new Error("Reservation not acquired");
        }

        /*
         * Simulamos el vencimiento del lease.
         *
         * Solo modificamos la fecha porque
         * estamos en un entorno de pruebas.
         */

        await pool.query(
          `
          UPDATE agent_operations
          SET lease_until =
            NOW() - INTERVAL '1 second'
          WHERE operation_key = $1
          `,
          [key]
        );

        /*
         * Worker B adquiere la reconciliación.
         */

        const recoveryToken =
          await journal.claimReconciliation(
            key,
            inputHash
          );

        expect(recoveryToken).not.toBeNull();

        /*
         * Worker A intenta confirmar
         * utilizando su token antiguo.
         */

        await expect(
          journal.complete(
            key,
            inputHash,
            reservation.token,
            "ISSUE-123"
          )
        ).rejects.toThrow(
          "Operation ownership lost"
        );

        /*
         * Worker B confirma un resultado
         * que suponemos verificado externamente.
         */

        await journal.confirmReconciliation(
          key,
          inputHash,
          recoveryToken!,
          "ISSUE-123"
        );

        const finalReservation =
          await journal.reserve(
            key,
            inputHash
          );

        expect(finalReservation).toEqual({
          kind: "completed",
          result: "ISSUE-123"
        });
      }
    );
  }
);