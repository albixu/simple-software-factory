export interface AgentRuntime {
    execute<I,O>(
        agent: AgentDefinition,
        input: I
    ): Promise<O>
}