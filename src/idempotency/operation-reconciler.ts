import { FileOperationJournal } from "#/idempotency/file-operation-journal.js";
import { createHash } from "node:crypto";


/*
 * Resultado de consultar el sistema externo
 */
export type ExternalOperationResult = 
    |   {
            kind: "found";
            result: string;
        }
    |   {
            kind: "unknown";
        };


/*
 * Resultado de la reconciliación
 */
export type ReconciliationResult = 
    |   {
            status: "completed";
            result: string;
        }
    |   {
            status: "pending";
        }
    |   {
            status: "missing";
        };


/*
 * Concreto de consulta externa
 */
export type OperationLookup = (
    operationKey: string
) => Promise<ExternalOperationResult>;


/*
 * Reconciliador
 */
export class OperationReconciler {

    constructor(private readonly journal: FileOperationJournal) {}

    async reconcile(
        operationKey: string,
        input: string,
        lookup: OperationLookup
    ): Promise<ReconciliationResult> {

        /*
         * 1. Calculamos la misma huella
         * que utiliza el ejecutor idempotente
         */
        const inputHash = createHash("sha256")
            .update(input)
            .digest("hex");

        /*
         * 2. Consultamos el registro local
         */
        const operation = await this.journal.inspect(operationKey, inputHash);

        /*
         * 3. No existe una operacion local
         */
        if (operation.kind === "missing") {
            return { status: "missing" };
        }

        /*
         * 4. Ya estaba completada.
         * No necesitamos consultar la API
         */
        if (operation.kind === "completed") {
            return {
                status: "completed",
                result: operation.result
            };
        }

        /*
         * 5. Está en started
         * Consultamos el sistema externo
         */
        const externalResult = await lookup(operationKey);

        /*
         * 6. No tenemos confirmación suficiente
         */
        if (externalResult.kind === "unknown") {
            return { status: "pending" };
        }

        /*
         * 7. La API confirma que la operación
         * se completó.
         * Guardamos el resultado recuperado.
         */
        await this.journal.complete(operationKey, inputHash, externalResult.result);

        /*
         * 8. Ya podemos continuar
         */
        return {
            status: "completed",
            result: externalResult.result
        };
    }
}