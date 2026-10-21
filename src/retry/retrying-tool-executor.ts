import { ToolCallExecutor } from "#/runtime/tool-call-executor.js";
import { RecoverableToolError } from "#/tools/recoverable-tool-error.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { ToolRequest } from "#/tools/tool-request.js";
import { setTimeout as sleepTimeout } from "node:timers/promises";

export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    maxAttemptsByTool?: Readonly<Record<string, number>>;
}


export type Sleep = (
    milliseconds: number,
    signal?: AbortSignal
) => Promise<void>;


const defaultSleep: Sleep = async (millisedonds, signal) => {
    await sleepTimeout(
        millisedonds,
        undefined,
        signal ? { signal } : undefined
    );
};


export class RetryingToolExecutor implements ToolCallExecutor {
    constructor (
        private readonly gateway: ToolCallExecutor,
        private readonly tools: ToolRegistry,
        private readonly options: RetryOptions,
        private readonly sleep: Sleep = defaultSleep
    ) {
        this.validateOptions();
    }


    async execute(request: ToolRequest): Promise<unknown> {
        const maxAttempts = this.options.maxAttemptsByTool?.[request.tool] ?? this.options.maxAttempts;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                request.signal?.throwIfAborted();

                /*
                 * Cada intento atraviesa el Gateway.
                 *
                 * Esto aplica políticas, presupuesto
                 * y auditoría en cada ejecución.
                 */
                return await this.gateway.execute(request);
            } catch (error) {
                request.signal?.throwIfAborted();

                /*
                 * Los errores desconocidos o fatales
                 * nunca se reintentan.
                 */
                if (!(error instanceof RecoverableToolError)) {
                    throw error;
                }
                
                /*
                 * FILE_NOT_FOUND, por ejemplo,
                 * es recuperable pero no retryable.
                 */
                if (!error.retryable) {
                    throw error;
                }

                /*
                 * Comprobar una propiedad confiable
                 * de la herramienta registrada.
                 */
                const tool = this.tools.get(request.tool);

                if (tool.retrySafety !== "idempotent") {
                    throw error;
                }

                /*
                 * Si agotamos los intentos,
                 * devolvemos el error original.
                 */
                if (attempt >= maxAttempts) {
                    throw error;
                }

                /* 
                 * Backoff exponencial limitado.
                 */
                const delayMs = Math.min(
                    this.options.maxDelayMs,
                    this.options.baseDelayMs * 2 ** (attempt -1)
                );

                await this.sleep(delayMs, request.signal);

                request.signal?.throwIfAborted();
            }
        }

        /* 
         * La validación garantiza al menos
         * un intento, por lo que esta rama
         * no debería alcanzarse.
         */
        throw new Error("Retry executor reached an invalid state");
    }


    private validateOptions(): void {
        const {
            maxAttempts,
            baseDelayMs,
            maxDelayMs
        } = this.options;

        if (
            !Number.isSafeInteger(maxAttempts) ||
            maxAttempts < 1 ||
            maxAttempts > 10
        ) {
            throw new Error("maxAttempts must be between 1 and 10");
        }

        if (
            !Number.isSafeInteger(baseDelayMs) ||
            baseDelayMs < 0
        ) {
            throw new Error("baseDelayMs must be a non-negative safe integer");
        }

        if (
            !Number.isSafeInteger(maxDelayMs) ||
            maxDelayMs < baseDelayMs
        ) {
            throw new Error("maxDelayMs must be a safe integer >= baseDelayMs")
        }

        for (const [toolName, limit] of Object.entries(this.options.maxAttemptsByTool ?? {})) {
            if (
                !toolName.trim() ||
                !Number.isSafeInteger(limit) ||
                limit < 1 ||
                limit > 10
            ) {
                throw new Error(`Invalid retry limit for tool: ${toolName}`);
            }
        }
    }
}