import { ExecutionContext } from "../runtime/execution-context.js";

export interface Agent<I, O> {
    readonly id: string;

    run(
        input: I,
        context: ExecutionContext
    ): Promise<O>;
}