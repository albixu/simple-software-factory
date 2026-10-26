import { ExecutionContext } from "#/runtime/execution-context.js";
import { CheckpointStore } from "#/workflow/checkpoints/checkpoint-store.js";

export type WorkflowStep<TState> = (
    state: TState,
    context: ExecutionContext
) => Promise<TState>;


export class CheckpointedStepExecutor<TState extends {workflowId: string}> {

    constructor(private readonly store: CheckpointStore<TState>) {}

    async execute(
        initialState: TState,
        context: ExecutionContext,
        step: WorkflowStep<TState>
    ): Promise<TState> {
        if (initialState.workflowId !== context.workflowId) {
            throw new Error("Initial state workflowId mismatch");
        }

        context.signal?.throwIfAborted();

        // 1. Recuperamos el último checkpoint.
        const checkpoint = await this.store.load(context.workflowId);

        context.signal?.throwIfAborted();

        // 2. Utilizamos el estado recuperado
        // o el inicial si no existe checkpoint.
        const currentState = structuredClone(
            checkpoint?.state ?? initialState
        );

        // 3. Ejecutamos una transición.
        const nextState = await step(currentState, context);

        // 4. Si el workflow ha sido cancelado,
        // no confirmamos esta transición.
        context.signal?.throwIfAborted();

        if (nextState.workflowId !== context.workflowId) {
            throw new Error("Next state workflowId mismatch");
        }

        // 5. Persistimos el nuevo estado
        await this.store.save({
            schemaVersion: 1,
            workflowId: context.workflowId,
            revision: (checkpoint?.revision ?? 0) + 1,
            saveAt: new Date().toISOString(),
            state: nextState
        });

        return nextState;
    }


    async resume (
        initialState: TState,
        context: ExecutionContext
    ): Promise<TState> {
        context.signal?.throwIfAborted();

        if (initialState.workflowId !== context.workflowId) {
            throw new Error("Initial state workflowId mismatch");
        }

        const checkpoint = await this.store.load(context.workflowId);

        context.signal?.throwIfAborted();

        return structuredClone(checkpoint?.state ?? initialState);
    }
}