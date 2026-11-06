import { setTimeout as sleep } from "node:timers/promises";

export interface RenewableLease {
    renew(): Promise<boolean>;
}


export class LeaseOwnershipLostError extends Error {
    constructor(message = "Lease ownership lost") {
        super(message);
        this.name = "LeaseOwnershipLostError";
    }
}


export class LeaseHeartbeat {

    constructor(private readonly intervalMs: number) {

        if (
            !Number.isInteger(intervalMs) ||
            intervalMs <= 0
        ) {
            throw new Error("Invalid heartbeat interval");
        }
    }


    async run<T>(
        lease: RenewableLease,
        operation: (signal: AbortSignal) => Promise<T>,
        parentSignal?: AbortSignal
    ): Promise<T> {

        const operationController = new AbortController();
        const heartbeatController = new AbortController();
        let ownershipError: unknown;

        /*
         * Propagación de cancelación externa
         */
        const onParentAbort = () => {
            operationController.abort(
                parentSignal?.reason
            );

            heartbeatController.abort(
                parentSignal?.reason
            );
        };

        if (parentSignal?.aborted) {
            onParentAbort();
        } else {
            parentSignal?.addEventListener(
                "abort",
                onParentAbort,
                { once: true }
            );
        }

        /*
         * El heartbeat se ejecuta en paralelo
         */
        const heartbeatLoop = async () => {
            while(!heartbeatController.signal.aborted) {
                try {
                    await sleep(
                        this.intervalMs,
                        undefined, 
                        {
                            signal: heartbeatController.signal
                        }
                    );
                } catch (error) {
                    if (heartbeatController.signal.aborted) {
                        return;
                    }

                    throw error;
                }

                if (heartbeatController.signal.aborted) {
                    return;
                }

                try {
                    const renewed = await lease.renew();

                    if (!renewed) {
                        throw new LeaseOwnershipLostError("Lease ownership lost");
                    }
                } catch (error) {
                    ownershipError = error;
                    operationController.abort(error);
                    heartbeatController.abort(error);
                    return;
                }
            }
        };

        /*
         * Iniciamos la renovación en paralelo
         */
        const heartbeatTask = heartbeatLoop();

        try {
            /*
             * No iniciamos trabajo si ya
             * existe una cancelación
             */
            operationController.signal.throwIfAborted();

            const result = await operation(operationController.signal);

            /*
             * Comprobamos si perdimos el lease
             * durante la ejecución
             */
            if (ownershipError) {
                throw ownershipError;
            }

            operationController.signal.throwIfAborted();

            return result;

        } finally {
            /*
             * Detenemos el heartbeat.
             *
             * Esto cancela inmediatamente
             * cualquier sleep pendiente
             */
            heartbeatController.abort();
            parentSignal?.removeEventListener(
                "abort",
                onParentAbort
            );

            /*
             * Esperamos a que termine el bucle
             * de heartbeat.
             */
            await heartbeatTask;
        }
    }
}