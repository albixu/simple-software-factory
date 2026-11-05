import {
  createHash,
  randomUUID
} from "node:crypto";

import pg from "pg";

import {
  afterAll,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { PgOperationJournal } from "#/idempotency/pg-operation-journal.js";
import { RecoveryWorker } from "#/idempotency/recovery/recovery-worker.ts";


const { Pool } = pg;

const databaseUrl = process.env.PG_TEST_URL;

describe.skipIf(!databaseUrl)(
  "Recovery ownership",
  () => {

    const pool = new Pool({
      connectionString: databaseUrl
    });

    const journal = new PgOperationJournal(
      pool,
      60
    );

    afterAll(async () => {
      await pool.end();
    });

    it(
      "allows only one worker to claim an expired operation",
      async () => {

        const operationKey =
          `test:${randomUUID()}`;

        const input = "Create issue";

        const inputHash = createHash("sha256")
          .update(input)
          .digest("hex");

        /*
         * 1. Creamos la operación.
         */

        const reservation = await journal.reserve(
          operationKey,
          inputHash
        );

        expect(reservation.kind).toBe(
          "acquired"
        );

        /*
         * 2. Simulamos el vencimiento.
         */

        await pool.query(
          `
          UPDATE agent_operations
          SET lease_until =
            NOW() - INTERVAL '1 second'
          WHERE operation_key = $1
          `,
          [operationKey]
        );

        /*
         * 3. Dos workers compiten.
         */

        const [tokenA, tokenB] = await Promise.all([
          journal.claimReconciliation(
            operationKey,
            inputHash
          ),

          journal.claimReconciliation(
            operationKey,
            inputHash
          )
        ]);

        /*
         * 4. Solo uno puede obtener el lease.
         */

        const acquired = [
          tokenA,
          tokenB
        ].filter(
          token => token !== null
        );

        expect(acquired).toHaveLength(1);

        /*
         * 5. El otro debe recibir null.
         */

        const rejected = [
          tokenA,
          tokenB
        ].filter(
          token => token === null
        );

        expect(rejected).toHaveLength(1);
      }
    );


    it(
        "recovers an operation and reports metrics",
        async () => {

            const operationKey = `test:${randomUUID()}`;

            const inputHash = createHash("sha256")
                .update("Create issue")
                .digest("hex");

            /*
            * Creamos una operación.
            */

            await journal.reserve(
                operationKey,
                inputHash
            );

            /*
            * Simulamos el vencimiento.
            */

            await pool.query(
                `
                UPDATE agent_operations
                SET lease_until =
                    NOW() - INTERVAL '1 second'
                WHERE operation_key = $1
                `,
                [operationKey]
            );

            /*
            * El lookup simula una API externa
            * que confirma la creación.
            */

            const lookup = vi.fn(
                async () => ({
                    kind: "found" as const,
                    result: "ISSUE-123"
                })
            );

            const worker = new RecoveryWorker(
                journal,
                lookup
            );

            /*
            * Ejecutamos un ciclo.
            */

            const metrics = await worker.runOnce(20);

            /*
            * Comprobamos el resultado.
            */

            expect(metrics.completed).toBeGreaterThanOrEqual(1);
            expect(lookup).toHaveBeenCalledWith(operationKey);

            /*
            * Comprobamos que PostgreSQL
            * contiene el resultado recuperado.
            */

            const operation = await pool.query(
            `
                SELECT status, result
                FROM agent_operations
                WHERE operation_key = $1
            `,
            [operationKey]
            );

            expect(operation.rows[0]).toMatchObject({
                status: "completed",
                result: "ISSUE-123"
            });
        }
    );
  }
);