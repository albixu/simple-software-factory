export type HierarchicalBudgetDecision = 
    |   {
            allowed: true;
            workflowUsed: number;
            workflowLimit: number;
            agentUsed: number;
            agentLimit: number;
        }
    |   {
            allowed: false;
            reason: 
                | "workflow_budget_exhausted"
                | "agent_budget_exhausted";
            workflowUsed: number;
            workflowLimit: number;
            agentUsed: number;
            agentLimit: number;
        };


export interface HierarchicalBudgetConfig {
    workflowLimit: number;
    agentLimits: Record<string, number>;
}


export class HierarchicalToolCallBudget {
    private readonly workflowUsage = new Map<string, number>();
    private readonly agentUsage = new Map<string, Map<string, number>>();

    constructor(private readonly config: HierarchicalBudgetConfig) {
        this.assertLimit(config.workflowLimit);

        for (const limit of Object.values(config.agentLimits)) {
            this.assertLimit(limit);
        }
    }


    async reserve(
        workflowId: string,
        agentId: string
    ): Promise<HierarchicalBudgetDecision> {
        if (
            !workflowId.trim() ||
            !agentId.trim()
        ) {
            throw new Error("workflowId and agentId are required");
        }

        /*
         * Los agentes sin límite configurado
         * se deniegan por defecto.
         */
        const agentLimit = Object.hasOwn(this.config.agentLimits, agentId) ? this.config.agentLimits[agentId] : undefined;

        if (agentLimit === undefined) {
            throw new Error(`No budget configured for agent: ${agentId}`);
        }

        const workflowUsed = this.workflowUsage.get(workflowId) ?? 0;
        const agents = this.agentUsage.get(workflowId) ?? new Map<string, number>();
        const agentUsed = agents.get(agentId) ?? 0;

        /*
         * Primero comprobamos ambos límites.
         * Todavía no modifcamos contradores.
         */
        if (workflowUsed >= this.config.workflowLimit) {
            return {
                allowed: false,
                reason: "workflow_budget_exhausted",
                workflowUsed,
                workflowLimit: this.config.workflowLimit,
                agentUsed,
                agentLimit
            };
        }
        
        if (agentUsed >= agentLimit) {
            return {
                allowed: false,
                reason: "agent_budget_exhausted",
                workflowUsed,
                workflowLimit: this.config.workflowLimit,
                agentUsed,
                agentLimit
            };
        }

        /*
         * Ambos límites permiten la operación.
         *
         * Actualizamos los dos contadores
         * sin ningún await intermedio.
         */
        const nextWorkflowUsed = workflowUsed + 1;
        const nextAgentUsed = agentUsed + 1;

        this.workflowUsage.set(workflowId, nextWorkflowUsed);

        agents.set(agentId, nextAgentUsed);
        this.agentUsage.set(workflowId, agents);

        return {
            allowed: true,
            workflowUsed: nextWorkflowUsed,
            workflowLimit: this.config.workflowLimit,
            agentUsed: nextAgentUsed,
            agentLimit
        };
    }


    getWorkflowUsed(workflowId: string): number {
        return this.workflowUsage.get(workflowId) ?? 0;
    }


    getAgentUsed(
        workflowId: string, 
        agentId: string
    ): number {
        return this.agentUsage.get(workflowId)?.get(agentId) ?? 0;
    }


    private assertLimit(limit: number): void {
        if (
            !Number.isSafeInteger(limit) ||
            limit < 0
        ) {
            throw new Error("Budget limits must be non-negative safe integers");
        }
    }
}