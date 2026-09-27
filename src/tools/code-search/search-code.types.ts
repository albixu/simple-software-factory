import { z } from "zod";

export const SearchCodeInputSchema =
  z.object({
    query: z.string().min(1)
  });

export type SearchCodeInput =
  z.infer<typeof SearchCodeInputSchema>;


export interface SearchCodeMatch {
  /**
   * Path relative to the workspace root.
   *
   * Example:
   * src/Repository/TemplateRepository.php
   */
  file: string;

  /**
   * Line number where the match was found.
   * 1-based.
   */
  line: number;

  /**
   * Matching line or a short text fragment.
   */
  text: string;
}


export interface SearchCodeResult {
  /**
   * Search expression used.
   */
  query: string;

  /**
   * Matches found in the workspace.
   */
  matches: SearchCodeMatch[];

  /**
   * True when the tool stopped collecting results
   * because the configured result limit was reached.
   */
  truncated: boolean;
}