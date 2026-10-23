import { ExecutionContext } from "../runtime/execution-context.js";
import { WorkflowRunResult } from "./workflow-run-result.js";

export type DeadlineSignalFactory = (timeoutMs: number) => AbortSignal;

const defaultDeadlineFactory: DeadlineSignalFactory = timeoutMs => AbortSignal.timeout(timeoutMs);

export class WorkflowDeadlineExecutor {

    constructor(
        private readonly maxDurationMs: number,
        private readonly createdDeadline: DeadlineSignalFactory = defaultDeadlineFactory
    ) {
        if (
            !Number.isSafeInteger(maxDurationMs) ||
            maxDurationMs < 1 ||
            maxDurationMs > 2_147_483_647
        ) {
            throw new Error ("maxDurationMs must be a positive " + "integer <= 2147483647");
        }
    }


    async execute<T>(
        context: ExecutionContext,
        run: (context: ExecutionContext) => Promise<T>
    ): Promise<WorkflowRunResult<T>> {

        /*
         * Creamos el deadline una sola vez.
         */
        const deadline = this.createdDeadline(this.maxDurationMs);

        /*
         * Combinamos el deadline con una
         * posible cancelación externa.
         */
        const signal = context.signal 
            ?   AbortSignal.any([
                    context.signal,
                    deadline
                ])
            :   deadline;

        /*
         * El nuevo contexto mantiene los
         * identificadores originales.
         */
        const executionContext: ExecutionContext = {
            ...context,
            signal
        };

        try{
            /* 
             * Evitar iniciar un workflow
             * previamente cancelado.
             */
            signal.throwIfAborted();

            /*
             * Ejecutamos el workflow completo
             * utilizando el mismo contexto.
             */
            const value = await run(executionContext);

            /*
             * Una operación que ignore la
             * cancelación no debe devolver
             * un resultado aparentemente válido
             * si el deadline ya ha vencido.
             */
            signal.throwIfAborted();

            return {
                status: "completed",
                value
            };

        } catch (error) {
            /*
             * Clasificamos primero el deadline.
             */
            if (deadline.aborted) {
                return {
                    status: "timed_out"
                };
            }

            /*
             * Después comrobamos una
             * cancelación externa
             */
            if (context.signal?.aborted) {
                return {
                    status: "cancelled"
                };
            }

            /*
             * Los demás errores son fallos
             * ordinarios del workflow.
             */

            return {
                status: "failed",
                error
            };
        }
    }
}