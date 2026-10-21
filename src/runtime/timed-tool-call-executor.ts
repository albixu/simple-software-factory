import { ToolCallExecutor } from "#/runtime/tool-call-executor.js";
import { ToolRequest } from "#/tools/tool-request.js";


export interface ToolTimeoutOptions {
    defaultTimeoutMs: number;
    timeoutMsByTool?: Readonly<Record<string, number>>;
}


export class TimedToolCallExecutor implements ToolCallExecutor {

    private readonly defaultTimeoutMs: number;
    private readonly timeoutMsByTool: Readonly<Record<string, number>>;

    constructor(
        private readonly delegate: ToolCallExecutor,
        options: ToolTimeoutOptions
    ) {
        this.assertTimeout(options.defaultTimeoutMs);

        for (const [toolName, timeout] of Object.entries(options.timeoutMsByTool ?? {})) {
            if (!toolName.trim()) {
                throw new Error("Tool name cannot be empty");
            }

            this.assertTimeout(timeout);
        }

        /*
         * Copiamos la configuración para
         * evitar cambios externos posteriores.
         */
        this.defaultTimeoutMs = options.defaultTimeoutMs;
        this.timeoutMsByTool = { ...options.timeoutMsByTool };
    }


    async execute(request: ToolRequest): Promise<unknown> {
        
        const timeoutMs = this.timeoutMsByTool[request.tool] ?? this.defaultTimeoutMs;
        /*
         * Este deadline abarca todos los
         * reintentos y esperas de backoff
         */
        const deadline = AbortSignal.timeout(timeoutMs);

        /*
         * Si el workflow proporciona una señal
         * externa, combinamos ambas
         */
        const signals: AbortSignal[] = request.signal
            ? [request.signal, deadline]
            : [deadline];

        const signal = AbortSignal.any(signals);

        /*
         * No ejecutamos la herramienta aquí.
         * 
         * Delegamos en el siguiente ejecutor
         * propagando la señal
         */
        return this.delegate.execute({
            ...request,
            signal
        });
    }


    private assertTimeout(timeoutMs: number): void {
        if (
            !Number.isSafeInteger(timeoutMs) ||
            timeoutMs < 1
        ) {
            throw new Error("timeoutMs must be a positive safe integer");
        }
    }
}