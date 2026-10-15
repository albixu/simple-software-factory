import {
    describe,
    expect,
    it
} from "vitest";

import {
    z
} from "zod";

import { InMemoryAuditStore } from "#/audit/in-memory-audit-store.js";
import { InMemoryToolCallBudget } from "#/budget/in-memory-tool-call-budget.js";
import { AgentGateway } from "#/gateway/agent-gateway.js";
import { ToolDefinition } from "#/llm/tool-definition.js";
import { DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import { ExecutionContext } from "#/runtime/execution-context.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { Tool } from "#/tools/tool.js";


const SearchInputSchema = z.object({query: z.string().min(1)});

type SearchInput = z.infer<typeof SearchInputSchema>;


class CountingSearchTool implements Tool<SearchInput, string> {
  readonly name = "code.search";
  readonly description = "Counting search tool";
  readonly inputSchema = SearchInputSchema;
  readonly llmDefinition: ToolDefinition = {
    name: this.name,
    description: this.description,
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                minLength: 1
            }
        },
        required: ["query"],
        additionalProperties: false
    }
  };


  calls = 0;


  constructor(private readonly shouldFail = false) {}


  async execute(
    input: SearchInput,
    _context: ToolExecutionContext
  ): Promise<string> {

    this.calls++;

    if (this.shouldFail) {
      throw new Error("Simulated tool failure");
    }

    return `Found ${input.query}`;
  }
}


function createContext(workflowId: string): ExecutionContext {
    return {
        workflowId,
        traceId: `trace-${workflowId}`,
        attempt: 1,
        workspace: {
            id: "workspace-test",
            root: "/repository"
        }
    };
}


function createSystem(
  maxToolCalls: number,
  shouldFail = false
) {

    const tools = new ToolRegistry();
    const tool = new CountingSearchTool(shouldFail);

    tools.register(tool);

    const audit = new InMemoryAuditStore();
    const budget = new InMemoryToolCallBudget(maxToolCalls);
    const gateway = new AgentGateway(
        tools,
        new DefaultPolicyEngine(),
        audit,
        budget
        );


    return {
        gateway,
        tool,
        audit,
        budget
    };
}


function createRequest(
  workflowId: string,
  agentId = "planner"
) {
    return {
        agentId,
        tool: "code.search",
        arguments: {
        query: "PaymentRepository"
        },
        context: createContext(workflowId)
    };
}


describe("AgentGateway tool-call budget", () => {
    it("blocks calls after the budget is exhausted", async () => {
        const {
            gateway,
            tool,
            audit,
            budget
        } = createSystem(2);

        await gateway.execute(createRequest("wf-1"));
        await gateway.execute(createRequest("wf-1"));
        await expect(gateway.execute(createRequest("wf-1"))).rejects.toThrow("Tool-call budget exhausted");

        expect(tool.calls).toBe(2);
        expect(budget.getUsed("wf-1")).toBe(2);

        const budgetDenials = audit.getAll().filter(
            event =>
              event.type === "tool.denied" &&
              event.denialSource === "budget"
        );

        expect(budgetDenials).toHaveLength(1);
    });


    it("handles concurrent reservations safely", async () => {

        const {
          gateway,
          tool,
          budget
        } = createSystem(2);


        const results = await Promise.allSettled(
            Array.from(
              { length: 5 },
              () => gateway.execute(
                createRequest("wf-concurrent")
              )
            )
          );


        const fulfilled = results.filter(result => result.status === "fulfilled");
        const rejected = results.filter(result => result.status === "rejected");

        expect(fulfilled).toHaveLength(2);
        expect(rejected).toHaveLength(3);
        expect(tool.calls).toBe(2);
        expect(budget.getUsed("wf-concurrent")).toBe(2);
      }
    );


    it("consumes budget when execution fails", async () => {

        const {
          gateway,
          tool,
          budget
        } = createSystem(1, true);

        await expect(gateway.execute(createRequest("wf-failure"))).rejects.toThrow("Simulated tool failure");

        expect(budget.getUsed("wf-failure")).toBe(1);

        await expect(gateway.execute(createRequest("wf-failure"))).rejects.toThrow("Tool-call budget exhausted");

        expect(tool.calls).toBe(1);  
    });


    it("does not consume budget on policy denial", async () => {

        const {
          gateway,
          tool,
          audit,
          budget
        } = createSystem(1);


        /*
         * DefaultPolicyEngine no permite
         * code.search al agente reviewer.
         */

        await expect(gateway.execute(createRequest("wf-policy", "reviewer"))).rejects.toThrow("Policy denied");

        expect(budget.getUsed("wf-policy")).toBe(0);
        expect(tool.calls).toBe(0);


        /*
         * Planner sí está autorizado.
         */

        await gateway.execute(createRequest("wf-policy", "planner"));

        expect(budget.getUsed("wf-policy")).toBe(1);

        const policyDenials = audit.getAll().filter(event => event.denialSource === "policy");

        expect(policyDenials).toHaveLength(1);
      }
    );


    it("keeps independent budgets per workflow", async () => {

        const {
          gateway,
          tool,
          budget
        } = createSystem(1);

        await gateway.execute(createRequest("wf-A"));
        await gateway.execute(createRequest("wf-B"));

        expect(budget.getUsed("wf-A")).toBe(1);
        expect(budget.getUsed("wf-B")).toBe(1);
        expect(tool.calls).toBe(2);

        await expect(gateway.execute(createRequest("wf-A"))).rejects.toThrow("Tool-call budget exhausted");
      
    });
  }
);