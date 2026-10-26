export interface WorkflowCheckpoint<TState> {
    schemaVersion: 1;
    workflowId: string;
    revision: number;
    saveAt: string;
    state: TState;
}


export interface CheckpointStore<TState> {
    load(workflowId: string): Promise<WorkflowCheckpoint<TState> | null>;
    save(checkpoint: WorkflowCheckpoint<TState>): Promise<void>;
}