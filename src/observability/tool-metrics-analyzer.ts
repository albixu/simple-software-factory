import { AuditEvent, AuditEventType, AuditFailureStage } from "#/audit/audit-event.js";
import { ToolCounters, ToolMetrics } from "#/observability/tool-metrics.js";

const TERMINAL_EVENTS: ReadonlySet<AuditEventType> = new Set([
    "tool.completed",
    "tool.denied",
    "tool.failed",
]);


export class ToolMetricsAnalyzer {
    analyze(
        events: readonly AuditEvent[],
        traceId: string,
        maxToolCalls: number
    ): ToolMetrics {

      if (
        !Number.isSafeInteger(maxToolCalls) ||
        maxToolCalls < 0
      ) {
        throw new Error("maxToolCalls must be a non-negative safe integer");
      }

      /*
       * 1. Filtrar la traza solicitada.
       */
      const traceEvents = events.filter(
        event => event.traceId === traceId
      );


      /*
       * 2. Agrupar eventos por operación.
       */
      const operations = new Map<string, AuditEvent[]>();

      for (const event of traceEvents) {
        const group = operations.get(event.operationId) ?? [];
        group.push(event);
        operations.set(event.operationId, group);
      }


      /*
       * 3. Inicializar métricas.
       */
      const metrics: ToolMetrics = {
        traceId,
        totalToolCalls: 0,
        authorizedToolCalls: 0,
        completedToolCalls: 0,
        deniedToolCalls: 0,
        failedToolCalls: 0,
        withoutTerminalEvent: 0,
        totalCompletedDurationMs: 0,
        averageCompletedDurationMs: null,
        toolCallBudgetExceeded: false,
        failuresByStage: {
          validation: 0,
          authorization: 0,
          budget:0,
          execution: 0
        },
        byTool: {}
      };


      const byTool = new Map<string, ToolCounters>();


      /*
       * 4. Analizar cada operación.
       */

      for (const [operationId, group] of operations) {
        const requestedEvents = group.filter(
          event => event.type === "tool.requested"
        );

        if (requestedEvents.length !== 1) {
          throw new Error(`Invalid audit sequence for ${operationId}: expected exactly one tool.requested`);
        }

        const requested = requestedEvents[0]!;

        if (group.some(event => event.tool !== requested.tool)) {
          throw new Error(`Inconsistent tool name in operation ${operationId}`);
        }

        const authorizedEvents = group.filter(event => event.type === "tool.authorized");

        if (authorizedEvents.length > 1) {
          throw new Error(`Multiple authorization events for ${operationId}`);
        }


        const terminalEvents = group.filter(event => TERMINAL_EVENTS.has(event.type));

        if (terminalEvents.length > 1) {
          throw new Error(`Multiple terminal events for ${operationId}`);
        }

        const authorized = authorizedEvents.length === 1;
        const terminal = terminalEvents[0];


        /*
         * 5. Comprobar coherencia de estados.
         */
        if (terminal?.type === "tool.completed" && !authorized) {
          throw new Error(`Completed operation without authorization: ${operationId}`);
        }

        if (terminal?.type === "tool.denied" && authorized) {
          throw new Error(`Denied operation was also authorized: ${operationId}`);
        }

        if (
          terminal?.type === "tool.failed" &&
          terminal.stage === "execution" &&
          !authorized
        ) {
          throw new Error(`Execution failure without authorization: ${operationId}`);
        }


        /*
         * 6. Actualizar contadores.
         */
        metrics.totalToolCalls++;

        const counters = byTool.get(requested.tool) ?? {
          requested: 0,
          completed: 0,
          denied: 0,
          failed: 0
        };

        counters.requested++;

        byTool.set(requested.tool, counters);

        if (authorized) {
          metrics.authorizedToolCalls++;
        }

        if (!terminal) {
          metrics.withoutTerminalEvent++;
          continue;
        }

        switch (terminal.type) {
          case "tool.completed": {
            metrics.completedToolCalls++;
            counters.completed++;
            metrics.totalCompletedDurationMs += terminal.durationMs ?? 0;
            break;
          }

          case "tool.denied": {
            metrics.deniedToolCalls++;
            counters.denied++;
            break;
          }

          case "tool.failed": {
            metrics.failedToolCalls++;
            counters.failed++;

            const stage: AuditFailureStage | undefined = terminal.stage;

            if (stage) {
              metrics.failuresByStage[stage]++;
            }

            break;
          }
        }
      }


      /*
       * 7. Calcular promedios.
       */
      if (metrics.completedToolCalls > 0) {
        metrics.averageCompletedDurationMs = metrics.totalCompletedDurationMs / metrics.completedToolCalls;
      }


      /*
       * 8. Convertir Map en objeto.
       */
      metrics.byTool = Object.fromEntries(byTool);

      /*
       * 9. Verificar si se ha superado el límite de llamadas máximas
       */
      metrics.toolCallBudgetExceeded = metrics.totalToolCalls > maxToolCalls;

      return metrics;
  }
}