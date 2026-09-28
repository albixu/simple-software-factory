export interface Agent<I, O> {
    readonly id: string;

    run(input: I): Promise<O>;
}