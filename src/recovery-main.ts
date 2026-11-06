import pg from "pg";
import { PgOperationJournal } from "#/idempotency/pg-operation-journal.js";
import { RecoveryWorker } from "#/idempotency/recovery/recovery-worker.js";
import { LeaseHeartbeat } from "./idempotency/recovery/lease-heartbeat.js";
import { setTimeout as sleep } from "node:timers/promises";


const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
    connectionString: databaseUrl
});

const journal = new PgOperationJournal(pool, 60);

const heartbeat = new LeaseHeartbeat(20_000);
/*
 * Adaptador de ejemplo.
 * Sustituiremos esta implementación
 * por una consulta real a la API externa
 */
const worker = new RecoveryWorker(
    journal,
    async operationKey => {
        console.log(`Checking external operation: ${operationKey}`);

        return {
            kind: "unknown"
        };
    },
    heartbeat
);

const shutdownController = new AbortController();

process.once("SIGINT", () => {
    shutdownController.abort(
        new Error("SIGINT received")
    );
});

process.once("SIGTERM", () => {
    shutdownController.abort(
        new Error("SIGTERM received")
    );
});

async function main(): Promise<void> {
    try {
        while (!shutdownController.signal.aborted) {
            try {
                const metrics = await worker.runOnce(20,shutdownController.signal);
                
                console.log(JSON.stringify({
                    event: "recovery.cycle.completed",
                    ...metrics
                }));
            } catch (error) {
                console.error("Recovery cycle failed", error);
            }

            /*
             * Esperamos 10 segundos antes
             * de iniciar el siguiente ciclo
             */
            await sleep(
                10_000,
                undefined,
                { signal: shutdownController.signal }
            )
        }
    } finally {
        await pool.end();
    }
}

await main();