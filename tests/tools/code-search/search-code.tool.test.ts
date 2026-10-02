import { SearchCodeTool } from "#/tools/code-search/search-code.tool.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";


describe(
  "SearchCodeTool",
  () => {
    let workspaceRoot: string;

    const createContext =
      (): ToolExecutionContext => ({
        workflowId: "wf-test",
        traceId: "trace-test",
        agentId: "planner",
        workspace: {
          id: "workspace-test",
          root: workspaceRoot
        }
      });


    beforeEach(
      async () => {

        workspaceRoot =
          await mkdtemp(
            join(tmpdir(), "agent-factory-")
          );

        const src = join(workspaceRoot, "src");

        await mkdir(src);

        await writeFile(
          join(src, "payment-service.ts"),
          [
            "export class PaymentService {",
            "  throw new Error('PaymentError');",
            "  // PaymentError should be mapped",
            "}"
          ].join("\n"),
          "utf8"
        );


        await writeFile(
          join(src, "user-service.ts"),
          [
            "export class UserService {",
            "  findUser() {}",
            "}"
          ].join("\n"),
          "utf8"
        );
      }
    );


    afterEach(
      async () => {

        await rm(workspaceRoot,
          {
            recursive: true,
            force: true
          }
        );
      }
    );


    it(
      "searches inside the workspace",
      async () => {

        const tool = new SearchCodeTool();
        const result = await tool.execute(
            {
              query: "PaymentError"
            },
            createContext()
          );


        expect(result.matches).toHaveLength(2);
        expect(result.truncated).toBe(false);
        expect(result.matches.map(
            match => match.line
          )
        ).toEqual([2, 3]);

        for (const match of result.matches) {
          expect(match.file).toContain("payment-service.ts");
        }
      }
    );


    it(
      "returns an empty result when nothing matches",
      async () => {
        const tool = new SearchCodeTool();
        const result = await tool.execute(
            {
              query: "ThisDoesNotExist"
            },
            createContext()
          );


        expect(result.matches).toEqual([]);
        expect(result.truncated).toBe(false);
      }
    );
  }
);