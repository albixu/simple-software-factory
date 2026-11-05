import pg from "pg";
import { PgOperationJournal } from "#/idempotency/pg-operation-journal.js";
import { RecoveryWorker } from "#/idempotency/recovery/recovery-worker.js";


const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
    connectionString: databaseUrl
});

const journal = new PgOperationJournal(pool, 60);

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
    }
);

let stopping = false;

process.once("SIGINT", () => {
    stopping = true;
});

async function main(): Promise<void> {
    try {
        while (!stopping) {
            try {
                const metrics = await worker.runOnce(20);
                
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
            await new Promise<void>(resolve => {
                setTimeout(resolve, 10_000);
            });
        }
    } finally {
        await pool.end();
    }
}

await main();