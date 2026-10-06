import { z } from "zod";

export const FilesystemReadInputSchema = z.object({
    path: z.string().min(1),
    startLine: z.number()
        .int()
        .positive()
        .optional(),
    endLine: z.number()
        .int()
        .positive()
        .optional()
})
.refine(
    input => 
        input.startLine === undefined ||
        input.endLine === undefined ||
        input.endLine >= input.startLine,
    {
        message: "endLine must be greater than or equal to startLine"
    }
);


export type FilesystemReadInput = z.infer<typeof FilesystemReadInputSchema>;

export interface FilesystemReadResult {
    path: string;
    startLine: number;
    endLine: number;
    totalLines: number;
    content: string;
    truncated: boolean;
}