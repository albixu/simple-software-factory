interface SearchCodeInput {
    query: string;
}

interface SearchCodeResult {
    files: string[];
}

export class SearchCodeTool implements Tool<SearchCodeInput, SearchCodeResult> {
    
    readonly name = 'code.search';

    constructor(private readonly repositoryRoot: string) {}

    async execute(input: SearchCodeInput): Promise<SearchCodeResult> {

        // Implementación simplificada.
        // Después utilizaremos ripgrep.

        console.log(`Searching for ${input.query}`);

        return {
            files: []
        };
    }
}
