import { createHash } from "node:crypto";
import type { PgOperationJournal } from "#/idempotency/pg-operation-journal.js";


export class PgIdempotentOperationExecutor {

    constructor(private readonly journal: PgOperationJournal) {}


    async run(
        operationKey: string,
        input: string,
        action: () => Promise<string>
    ): Promise<string> {
        
        const inputHash = createHash("sha256")
            .update(input)
            .digest("hex");

        const reservation = await this.journal.reserve(
            operationKey,
            inputHash
        );

        /*
         * Ya existe un resultado confirmado
         */
        if (reservation.kind === "completed") {
            return reservation.result;
        }

        /*
         * Otro worker inició la operacion.
         * No ejecutamos action()
         */
        if (reservation.kind === "in_progress") {
            throw new Error(`Operation ${operationKey} requires reconciliation`);
        }

        /*
         * Hemos adquirido una reserva nueva.
         */
        const result = await action();

        /*
         * Confirmamos utilizando nuestro token
         */
        await this.journal.complete(
            operationKey,
            inputHash,
            reservation.token,
            result
        );

        return result;
    }
}