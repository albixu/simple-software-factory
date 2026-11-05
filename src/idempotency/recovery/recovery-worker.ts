import { performance } from "node:perf_hooks";
import type { PgOperationJournal } from "#/idempotency/pg-operation-journal.js";
import { createRecoveryMetrics } from "#/idempotency/recovery/recovery-metrics.js";
import type { RecoveryMetrics } from "#/idempotency/recovery/recovery-metrics.js";

export type RecoveryLookupResult = 
    |   {
            kind: "found";
            result: string;
        }
    |   {
            kind: "unknown";
        };


export type RecoveryLookup = (operationKey: string) => Promise<RecoveryLookupResult>;


export class RecoveryWorker {

    constructor(
        private readonly journal: PgOperationJournal,
        private readonly lookup: RecoveryLookup
    ) {}


    async runOnce(batchSize = 20): Promise<RecoveryMetrics> {
        const startedAt = performance.now();
        const metrics = createRecoveryMetrics();

        /*
         * 1. Buscamos operaciones vencidas
         */
        const operations = await this.journal.findExpired(batchSize);

        metrics.scanned = operations.length;

        /*
         * 2. Procesamos cada operación.
         */
        for(const operation of operations) {
            const {operationKey, inputHash} = operation;

            /*
             * 3. Intentamos reclamar la reconciliación
             */
            let token: string | null;

            try {
                token = await this.journal.claimReconciliation(operationKey, inputHash);
            } catch {
                metrics.failed++;
                continue;
            }

            /*
             * Otro worker puede haberse adelantado
             */
            if (!token) {
                continue;
            }

            /*
             * 4. Consultamos el sistema externo
             */
            try {
                const result = await this.lookup(operationKey);

                /*
                 * 5. No existe confirmación suficiente
                 */
                if (result.kind === "unknown") {
                    metrics.pending++;
                    continue;
                }

                await this.journal.confirmReconciliation(
                    operationKey,
                    inputHash,
                    token,
                    result.result
                );

                metrics.completed++;
            } catch {
                metrics.failed++;
            }

            metrics.durationMs = performance.now() - startedAt;

        }

        return metrics;
    }
}