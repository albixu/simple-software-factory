import {
    describe,
    expect,
    it
} from "vitest";

import { AuditEvent } from "#/audit/audit-event.js";
import { ToolMetricsAnalyzer } from "#/observability/tool-metrics-analyzer.js";


type EventInput = Pick<AuditEvent, "operationId" | "type" | "tool"> & Partial<AuditEvent>;

let nextEventId = 0;

function createEvent(input: EventInput): AuditEvent {
  nextEventId++;

  return {
    id: `event-${nextEventId}`,
    timestamp: "2026-10-12T11:00:00.000Z",
    workflowId: "wf-100",
    traceId: "trace-100",
    attempt: 1,
    agentId: "planner",
    workspaceId: "workspace-1",
    ...input
  };
}


describe("ToolMetricsAnalyzer", () => {
    it("calculates metrics for mixed operations", () => {
        const events: AuditEvent[] = [

            /*
             * Operación 1: completada.
             */
            createEvent({
                operationId: "op-1",
                type: "tool.requested",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-1",
                type: "tool.authorized",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-1",
                type: "tool.completed",
                tool: "code.search",
                durationMs: 12
            }),


            /*
             * Operación 2: denegada.
             */
            createEvent({
                operationId: "op-2",
                type: "tool.requested",
                tool: "filesystem.read"
            }),

            createEvent({
                operationId: "op-2",
                type: "tool.denied",
                tool: "filesystem.read"
            }),


            /*
             * Operación 3: error de validación.
             */
            createEvent({
                operationId: "op-3",
                type: "tool.requested",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-3",
                type: "tool.failed",
                tool: "code.search",
                stage: "validation"
            }),


            /*
             * Operación 4: error de ejecución.
             */
            createEvent({
                operationId: "op-4",
                type: "tool.requested",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-4",
                type: "tool.authorized",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-4",
                type: "tool.failed",
                tool: "code.search",
                stage: "execution",
                durationMs: 8
            }),


            /*
             * Operación 5: sin evento terminal.
             */
            createEvent({
                operationId: "op-5",
                type: "tool.requested",
                tool: "filesystem.read"
            }),

            createEvent({
                operationId: "op-5",
                type: "tool.authorized",
                tool: "filesystem.read"
            })
        ];


        const analyzer = new ToolMetricsAnalyzer();

        const metrics = analyzer.analyze(events, "trace-100", 8);

        expect(metrics.totalToolCalls).toBe(5);
        expect(metrics.authorizedToolCalls).toBe(3);
        expect(metrics.completedToolCalls).toBe(1);
        expect(metrics.deniedToolCalls).toBe(1);
        expect(metrics.failedToolCalls).toBe(2);
        expect(metrics.withoutTerminalEvent).toBe(1);
        expect(metrics.totalCompletedDurationMs).toBe(12);
        expect(metrics.averageCompletedDurationMs).toBe(12);
        expect(metrics.failuresByStage).toEqual({
            validation: 1,
            authorization: 0,
            budget: 0,
            execution: 1
        });

        expect(metrics.byTool["code.search"]).toEqual({
            requested: 3,
            completed: 1,
            denied: 0,
            failed: 2
        });

        expect(metrics.byTool["filesystem.read"]).toEqual({
            requested: 2,
            completed: 0,
            denied: 1,
            failed: 0
        });
      }
    );


    it("returns zero metrics for an empty trace", () => {

        const analyzer = new ToolMetricsAnalyzer();
        const metrics = analyzer.analyze([], "trace-empty", 8);

        expect(metrics.totalToolCalls).toBe(0);
        expect(metrics.averageCompletedDurationMs).toBeNull();
      }
    );


    it("rejects operations with multiple terminal events", () => {
        const events: AuditEvent[] = [

          createEvent({
            operationId: "op-invalid",
            type: "tool.requested",
            tool: "code.search"
          }),

          createEvent({
            operationId: "op-invalid",
            type: "tool.authorized",
            tool: "code.search"
          }),

          createEvent({
            operationId: "op-invalid",
            type: "tool.completed",
            tool: "code.search"
          }),

          createEvent({
            operationId: "op-invalid",
            type: "tool.failed",
            tool: "code.search",
            stage: "execution"
          })
        ];


        const analyzer = new ToolMetricsAnalyzer();

        expect(() => analyzer.analyze(events, "trace-100", 8)).toThrow("Multiple terminal events");
      }
    );

    it("detects when the tool-call budget is exceeded", () => {
        const events: AuditEvent[] = [

            createEvent({
                operationId: "op-1",
                type: "tool.requested",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-1",
                type: "tool.authorized",
                tool: "code.search"
            }),

            createEvent({
                operationId: "op-1",
                type: "tool.completed",
                tool: "code.search",
                durationMs: 10
            }),


            createEvent({
                operationId: "op-2",
                type: "tool.requested",
                tool: "filesystem.read"
            }),

            createEvent({
                operationId: "op-2",
                type: "tool.authorized",
                tool: "filesystem.read"
            }),

            createEvent({
                operationId: "op-2",
                type: "tool.completed",
                tool: "filesystem.read",
                durationMs: 5
            })
        ];


        const analyzer = new ToolMetricsAnalyzer();

        const withinBudget = analyzer.analyze(events, "trace-100", 2);

        expect(withinBudget.totalToolCalls).toBe(2);
        expect(withinBudget.toolCallBudgetExceeded).toBe(false);

        const exceededBudget = analyzer.analyze(events, "trace-100", 1);

        expect(exceededBudget.toolCallBudgetExceeded).toBe(true);
    }
    );
  }
);