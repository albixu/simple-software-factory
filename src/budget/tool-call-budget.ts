export type BudgetDecision = {
        allowed: boolean;
        used: number;
        limit: number;
    };


export interface ToolCallBudget {
    reserve(workflowId: string): Promise<BudgetDecision>;
}