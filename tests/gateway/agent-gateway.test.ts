import { AuditEvent } from "#/audit/audit-event.js";
import { AuditStore } from "#/audit/audit-store.js";
import { InMemoryAuditStore } from "#/audit/in-memory-audit-store.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { ToolDefinition } from "#/llm/tool-definition.js";
import { DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import { ExecutionContext } from "#/runtime/execution-context.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { Tool } from "#/tools/tool.js";
import {
    describe,
    expect,
    it
} from "vitest";
import { z } from "zod";


const SearchInputSchema = z.object({
    query: z.string().min(1)
  });


type SearchInput = z.infer<typeof SearchInputSchema>;


interface SearchResult {
  matches: string[];
}


/*
 * Test double para code.search.
 */

class TestSearchTool implements Tool<SearchInput, SearchResult> {

  readonly name = "code.search";
  readonly description = "Search test tool";
  readonly inputSchema = SearchInputSchema;
  readonly llmDefinition: ToolDefinition = {
    name: this.name,
    description: this.description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string"
        }
      },
      required: [
        "query"
      ],
      additionalProperties: false
    }
  };


  calls = 0;


  async execute(
    input: SearchInput,
    _context: ToolExecutionContext
  ): Promise<SearchResult> {

    this.calls++;

    return {
      matches: [
        `Found: ${input.query}`
      ]
    };
  }
}


/*
 * Test double para filesystem.read.
 *
 * No necesita acceder realmente al disco.
 */

const ReadInputSchema = z.object({
    path: z.string().min(1)
  });


type ReadInput = z.infer<typeof ReadInputSchema>;


class TestReadTool implements Tool<ReadInput, string> {
  readonly name = "filesystem.read";
  readonly description = "Read test tool";
  readonly inputSchema = ReadInputSchema;
  readonly llmDefinition: ToolDefinition = {
    name: this.name,
    description: this.description,
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string"
        }
      },
      required: [
        "path"
      ],
      additionalProperties: false
    }
  };


  calls = 0;


  async execute(
    _input: ReadInput,
    _context: ToolExecutionContext
  ): Promise<string> {

    this.calls++;

    return "file content";
  }
}


/*
 * Contexto compartido por los tests.
 */

const context: ExecutionContext = {
  workflowId: "wf-100",
  traceId: "trace-100",
  attempt: 1,
  workspace: {
    id: "workspace-test",
    root: "/repository"
  }
};


/*
 * AuditStore que simula una caída
 * de la infraestructura.
 */

class FailingAuditStore implements AuditStore {

  async append(_event: AuditEvent): Promise<void> {
    throw new Error("Audit storage unavailable");
  }
}


describe("AgentGateway audit", () => {

    it("records a successful tool execution", async () => {
        const tools = new ToolRegistry();
        const searchTool = new TestSearchTool();
        tools.register(searchTool);

        const audit = new InMemoryAuditStore();
        const gateway = new AgentGateway(
            tools,
            new DefaultPolicyEngine(),
            audit
          );


        const result = await gateway.execute({
            agentId: "planner",
            tool: "code.search",
            arguments: {
              query: "PaymentError"
            },
            context
          });

        expect(result).toEqual({
          matches: [
            "Found: PaymentError"
          ]
        });

        expect(searchTool.calls).toBe(1);

        const events = audit.findByTraceId("trace-100");

        expect(events.map(
            event => event.type
          )
        ).toEqual([
          "tool.requested",
          "tool.authorized",
          "tool.completed"
        ]);

        expect(events.every(event => event.workflowId === "wf-100")).toBe(true);

        expect(events[2]?.durationMs).toEqual(expect.any(Number));


        /*
         * No almacenamos el resultado
         * ni los argumentos completos.
         */

        const serialized = JSON.stringify(events);

        expect(serialized).not.toContain("PaymentError");
      }
    );


    it("records a denial without executing the tool", async () => {
        const tools = new ToolRegistry();
        const readTool = new TestReadTool();

        tools.register(readTool);

        const audit = new InMemoryAuditStore();

        const gateway = new AgentGateway(
            tools,
            new DefaultPolicyEngine(),
            audit
          );


        await expect(gateway.execute({
            agentId: "planner",
            tool: "filesystem.read",
            arguments: {
              path: ".env"
            },
            context
          })
        ).rejects.toThrow("Policy denied");

        expect(readTool.calls).toBe(0);

        const events = audit.getAll();

        expect(events.map(event => event.type)).toEqual([
          "tool.requested",
          "tool.denied"
        ]);
      }
    );


    it("records invalid tool arguments", async () => {
        const tools = new ToolRegistry();
        const searchTool = new TestSearchTool();

        tools.register(searchTool);

        const audit = new InMemoryAuditStore();

        const gateway = new AgentGateway(
            tools,
            new DefaultPolicyEngine(),
            audit
          );


        await expect(gateway.execute({
            agentId: "planner",
            tool: "code.search",
            arguments: {
              query: ""
            },
            context
          })
        ).rejects.toThrow();

        expect(searchTool.calls).toBe(0);

        const events = audit.getAll();

        expect(events.map(event => event.type)).toEqual([
          "tool.requested",
          "tool.failed"
        ]);

        expect(events[1]?.stage).toBe("validation");
      }
    );


    it("does not execute tools when initial audit fails", async () => {

        const tools = new ToolRegistry();
        const searchTool = new TestSearchTool();

        tools.register(searchTool);

        const gateway =
          new AgentGateway(
            tools,
            new DefaultPolicyEngine(),
            new FailingAuditStore()
          );


        await expect(gateway.execute({
            agentId: "planner",
            tool: "code.search",
            arguments: {
              query: "PaymentError"
            },
            context
          })
        ).rejects.toThrow("Audit storage unavailable");

        expect(searchTool.calls).toBe(0);
      }
    );
  }
);