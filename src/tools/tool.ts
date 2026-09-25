export interface Tool<Input = unknown, Output = unknown>  {
    readonly name: string;

    execute(input: Input): Promise<Output>;
}