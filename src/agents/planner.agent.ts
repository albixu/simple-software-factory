interface PlannerInput {
    issue: {
        id: string;
        title: string;
        description: string;
    }
}

export interface ImplementationPlan {
    rootCause: string;
    confidence: number;
    filesToInspect: string[];
    proposedChanges: string[];
    requiredTests: string[];
    risks: string[];
}