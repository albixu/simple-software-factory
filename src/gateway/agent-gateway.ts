import { AuditEvent, AuditEventType } from "#/audit/audit-event.js";
import { AuditStore } from "#/audit/audit-store.js";
import { PolicyEngine } from "#/policy/policy-engine.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { ToolRequest } from "#/tools/tool-request.js";
import { Tool } from "#/tools/tool.js";
import { randomUUID } from "node:crypto";
import { ToolCallBudget } from "#/budget/tool-call-budget.js";

export class AgentGateway {

    constructor(
        private readonly tools: ToolRegistry,
        private readonly policy: PolicyEngine,
        private readonly audit: AuditStore,
        private readonly budget: ToolCallBudget
    ) {}

    async execute(request: ToolRequest): Promise<unknown> {
        const operationId = randomUUID();

        const record = (
            type: AuditEventType,
            extra: Pick<AuditEvent, "durationMs" | "stage" | "denialSource"> = {}
        ): Promise<void> => {
            return this.record(type, request, operationId, extra);
        }

        /*
         * 1. Registrar la petición
         */

        await record("tool.requested");

        /*
         * 2. Localizar y validar la tool
         */

        let tool: Tool;
        let input: unknown;

        try {
            tool = this.tools.get(request.tool);
            input = tool.inputSchema.parse(request.arguments);
        } catch(error) {
            await record(
                "tool.failed",
                {
                    stage: "validation"
                }
            );

            throw error;
        }

        /*
         * 3. Evaluar la política
         */

        let decision: Awaited<ReturnType<PolicyEngine["evaluate"]>>;

        try {
            decision = await this.policy.evaluate({
                agentId: request.agentId,
                tool: request.tool,
                arguments: input,
                context: request.context
            });
        } catch (error) {
            await record(
                "tool.failed",
                {
                    stage: "authorization"
                }
            );

            throw error;
        }

        if (!decision.allowed) {
            await record(
                "tool.denied",
                {
                    denialSource: "policy"
                }
            );
            throw new Error(`Policy denied tool execution: ${decision.reason}`);
        }

        /*
         * 4. Reservar presupuesto (Todavía no se ha ejecutado la tool)
         */

        let budgetDecision: Awaited<ReturnType<ToolCallBudget["reserve"]>>;

        try {
            budgetDecision = await this.budget.reserve(request.context.workflowId);
        } catch (error) {
            await record(
                "tool.failed",
                {
                    stage: "budget"
                }
            );

            throw error;
        }

        if (!budgetDecision.allowed) {
            await record(
                "tool.denied",
                {
                    denialSource: "budget"
                }
            );

            throw new Error(
                `Tool-call budget exhausted for workflow `+
                `${request.context.workflowId}: ` +
                `${budgetDecision.used}/${budgetDecision.limit}`
            );
        }

        /*
         * 5. Registrar autorización
         */

        await record("tool.authorized");

        /*
         * 6. Construir contexto confiable
         */

        const toolContext: ToolExecutionContext = {
            workflowId: request.context.workflowId,
            traceId: request.context.traceId,
            agentId: request.agentId,
            workspace: request.context.workspace
        };

        /*
         * 7. Ejecutar herramienta
         */

        const startedAt = performance.now();
        let result: unknown;

        try {
            result = await tool.execute(input, toolContext);
        } catch (error) {
            await record(
                "tool.failed",
                {
                    stage: "execution",
                    durationMs: performance.now() - startedAt
                }
            );

            throw error;
        }

        /*
         * 8. Registrar finalización
         */

        await record(
            "tool.completed",
            {
                durationMs: performance.now() - startedAt
            }
        );

        return result;
    }


    private async record(
        type: AuditEventType,
        request: ToolRequest,
        operationId: string,
        extra: Pick<AuditEvent, "durationMs" | "stage" | "denialSource"> = {}
    ): Promise<void> {
        const event: AuditEvent = {
            id: randomUUID(),
            operationId,
            timestamp: new Date().toISOString(),
            type,
            workflowId: request.context.workflowId,
            traceId: request.context.traceId,
            attempt: request.context.attempt,
            agentId: request.agentId,
            tool: request.tool,
            workspaceId: request.context.workspace.id,
            ...extra
        };

        await this.audit.append(event);
    }
}