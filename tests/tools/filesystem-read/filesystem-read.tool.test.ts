import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import { FilesystemReadTool } from "#/tools/filesystem-read/filesystem-read.tool.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";


describe(
  "FilesystemReadTool",
  () => {

    let testRoot: string;
    let workspaceRoot: string;
    let outsideRoot: string;


    const context =
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

        testRoot = await mkdtemp(join(tmpdir(), "agent-factory-fs-"));
        workspaceRoot = join(testRoot, "workspace");
        outsideRoot = join(testRoot, "outside");

        await mkdir(
            join(workspaceRoot, "src"),
            {
                recursive: true
            }
        );


        await mkdir(
            outsideRoot,
            {
                recursive: true
            }
        );


        await writeFile(
            join(
                workspaceRoot,
                "src",
                "example.ts"
            ),
            [
                "line 1",
                "line 2",
                "line 3",
                "line 4",
                "line 5"
            ].join("\n"),
            "utf8"
        );


        await writeFile(
            join(
                outsideRoot,
                "secret.txt"
            ),
            "SUPER_SECRET",
            "utf8"
        );
      }
    );


    afterEach(
      async () => {

        await rm(
            testRoot,
            {
                recursive: true,
                force: true
            }
        );
      }
    );


    it(
      "reads a range of lines",
      async () => {

        const tool = new FilesystemReadTool();


        const result = await tool.execute(
            {
              path: "src/example.ts",
              startLine: 2,
              endLine: 4
            },
            context()
          );


        expect(result.content).toBe(
          [
            "line 2",
            "line 3",
            "line 4"
          ].join("\n")
        );


        expect(result.startLine).toBe(2);
        expect(result.endLine).toBe(4);
        expect(result.truncated).toBe(false);
      }
    );


    it(
      "limits the number of returned lines",
      async () => {

        const lines = Array.from(
            {
              length: 300
            },
            (_, index) => `line ${index + 1}`
        );

        await writeFile(
          join(workspaceRoot, "large.txt"),
          lines.join("\n"),
          "utf8"
        );


        const tool = new FilesystemReadTool();
        const result = await tool.execute(
            {
              path: "large.txt",
              startLine: 1,
              endLine: 300
            },
            context()
          );


        expect(result.startLine).toBe(1);
        expect(result.endLine).toBe(200);
        expect(result.truncated).toBe(true);
        expect(result.content.split("\n")).toHaveLength(200);
      }
    );


    it(
      "rejects paths outside the workspace",
      async () => {

        const tool = new FilesystemReadTool();

        await expect(tool.execute(
                {
                path: "../outside/secret.txt"
                },
                context()
            )
        ).rejects.toThrow("Path escapes workspace");
      }
    );


    it(
      "rejects symlinks that escape the workspace",
      async () => {

        const secret = join(outsideRoot, "secret.txt");
        const link = join(workspaceRoot, "secret-link");

        await symlink(secret, link);

        const tool = new FilesystemReadTool();

        await expect(tool.execute(
                {
                path: "secret-link"
                },
                context()
            )
        ).rejects.toThrow("Resolved path escapes workspace");
      }
    );
  }
);