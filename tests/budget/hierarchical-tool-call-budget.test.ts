import {
  describe,
  expect,
  it
} from "vitest";

import {
  HierarchicalToolCallBudget
} from "#/budget/hierarchical-tool-call-budget.js";


describe("HierarchicalToolCallBudget", () => {

    it("enforces agent limits without wasting workflow budget", async () => {

        const budget = new HierarchicalToolCallBudget({
            workflowLimit: 5,
            agentLimits: {
                planner: 2,
                developer: 4
            }
        });


        const first = await budget.reserve("wf-100", "planner");
        const second = await budget.reserve("wf-100", "planner");
        const third = await budget.reserve("wf-100", "planner");

        expect(first.allowed).toBe(true);
        expect(second.allowed).toBe(true);
        expect(third).toMatchObject({
            allowed: false,
            reason: "agent_budget_exhausted"
        });


        /*
         * La llamada denegada no consume
         * presupuesto del workflow.
         */

        expect(budget.getWorkflowUsed("wf-100")).toBe(2);


        /*
         * Developer todavía puede operar.
         */

        const developer = await budget.reserve("wf-100", "developer");

        expect(developer.allowed).toBe(true);
        expect(budget.getWorkflowUsed("wf-100")).toBe(3);
        expect(budget.getAgentUsed("wf-100", "developer")).toBe(1);
      }
    );


    it("enforces the global workflow limit", async () => {
        const budget = new HierarchicalToolCallBudget({
            workflowLimit: 2,
            agentLimits: {
                planner: 5,
                developer: 5
            }
        });

        await budget.reserve("wf-100", "planner");
        await budget.reserve("wf-100", "developer");

        const result = await budget.reserve("wf-100", "developer");

        expect(result).toMatchObject({
            allowed: false,
            reason: "workflow_budget_exhausted"
        });


        expect(budget.getWorkflowUsed("wf-100")).toBe(2);
        expect(budget.getAgentUsed("wf-100", "developer")).toBe(1);
      }
    );


    it("handles concurrent requests across agents", async () => {

        const budget = new HierarchicalToolCallBudget({
            workflowLimit: 3,
            agentLimits: {
                planner: 3,
                developer: 3
            }
        });


        const decisions = await Promise.all([
            budget.reserve(
              "wf-100",
              "planner"
            ),

            budget.reserve(
              "wf-100",
              "developer"
            ),

            budget.reserve(
              "wf-100",
              "planner"
            ),

            budget.reserve(
              "wf-100",
              "developer"
            ),

            budget.reserve(
              "wf-100",
              "planner"
            )
          ]);


        const allowed = decisions.filter(decision => decision.allowed);

        expect(allowed).toHaveLength(3);
        expect(budget.getWorkflowUsed("wf-100")).toBe(3);
      }
    );


    it("denies agents without configured budgets", async () => {
        const budget = new HierarchicalToolCallBudget({
            workflowLimit: 10,
            agentLimits: {
                planner: 3
            }
        });

        await expect(budget.reserve("wf-100", "unknown-agent")).rejects.toThrow("No budget configured");

        expect(budget.getWorkflowUsed("wf-100")).toBe(0);
      }
    );
  }
);