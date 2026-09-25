export interface WorkflowState {
    workflowId: string;

    issue: {
        id: string;
        title: string;
        description: string;
    };

    status:
        | 'created'
        | 'planning'
        | 'implementing'
        | 'testing'
        | 'reviewing'
        | 'completed'
        | 'human_review'
        | 'failed';

    plan?: ImplementationPlan;
    implementation?: ImplementationResult;
    tests?: TestResult;
    review?: ReviewResult;
    attempts: {
        implementation: number;
        review: number;
    }
}