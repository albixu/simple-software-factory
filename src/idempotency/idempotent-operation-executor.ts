import { createHash } from "node:crypto";
import { FileOperationJournal } from "./file-operation-journal.js";

export class IdempotentOperationExecutor {

    constructor (private readonly journal: FileOperationJournal) {}

    async run(
        operationKey: string,
        input: string,
        action: () => Promise<string>
    ): Promise<string> {

        /*
         * Calculamos una huella de los datos.
         */
        const inputHash = createHash("sha256")
            .update(input)
            .digest("hex");

        /*
         * Consultamos o reservamos la operación.
         */
        const reservation = await this.journal.reserve(operationKey, inputHash);

        /*
         * Ya se completó anteriormente.
         * Devolvemos el resultado persistido.
         */
        if (reservation.kind === "completed") {
            return reservation.result;
        }

        /*
         * Existe una operación iniciada,
         * pero no sabemos si terminó.
         */
        if (reservation.kind === "started") {
            throw new Error(`Operation ${operationKey} requires reconciliation`);
        }

        /*
         * Somos los propietarios de una
         * reserva nueva.
         */
        const result = await action();

        /*
         * Confirmamos el resultado.
         */
        await this.journal.complete(
            operationKey,
            inputHash,
            result
        );

        return result;
    }
}