import { z } from "zod";

export const SearchCodeInputSchema =
  z.object({
    query: z.string().min(1)
  });

export type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;


export interface SearchCodeMatch {
  file: string;
  line: number;
  text: string;
}


export interface SearchCodeResult {
  query: string;
  matches: SearchCodeMatch[];
  truncated: boolean;
}