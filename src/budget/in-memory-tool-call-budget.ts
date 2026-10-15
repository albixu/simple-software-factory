import {
    BudgetDecision,
    ToolCallBudget
} from "#/budget/tool-call-budget.js";


export class InMemoryToolCallBudget implements ToolCallBudget {
    private readonly usage = new Map<string, number>();

    constructor (private readonly maxToolCalls: number) {
        if (
            !Number.isSafeInteger(maxToolCalls) ||
            maxToolCalls < 0
        ) {
            throw new Error("maxToolCalls must be a non-negative safe integer");
        }
    }


    async reserve(workflowId: string): Promise<BudgetDecision> {
        if (!workflowId.trim()) {
            throw new Error("workflowId cannot be empty");
        }

        /*
         * Importante:
         *
         * No hay ningún await entre la lectura
         * del contador y su actualización.
         * 
         * En un único proceso de Node.js, esta
         * sección no puede intercalarse con
         * otra llamada asíncrona.
         */
        const used = this.usage.get(workflowId) ?? 0;

        if (used >= this.maxToolCalls) {
            return {
                allowed: false,
                used,
                limit: this.maxToolCalls
            };
        }

        const nextUsed = used + 1;
        this.usage.set(workflowId, nextUsed);

        return {
            allowed: true,
            used: nextUsed,
            limit: this.maxToolCalls
        };
    }


    getUsed(workflowId: string): number {
        return this.usage.get(workflowId) ?? 0;
    }
}