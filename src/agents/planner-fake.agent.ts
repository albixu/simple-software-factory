export class FakePlannerAgent implements Agent<PlannerInput, ImplementationPlan> {
    readonly id: 'planner';

    async run(input: PlannerInput): Promise<ImplementationPlan> {
        return {
            rootCause: 'Possible duplicate rows in MERGE source',
            confidence: 0.82,
            filesToInspect: [
                'src/repository/TemplateRepository.php'
            ],
            proposedChanges: [
                'Ensure MERGE source produces one row per target'
            ],
            requiredTests: [
                'duplicated source rows'
            ],
            risks: [
                'Incorrect deduplication could hide data inconsistencies'
            ]
        };
    }
}