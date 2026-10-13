import { AuditEvent, AuditEventType } from "#/audit/audit-event.js";
import { AuditStore } from "#/audit/audit-store.js";
import { PolicyEngine } from "#/policy/policy-engine.js";
import { ToolExecutionContext } from "#/tools/tool-execution-context.js";
import { ToolRegistry } from "#/tools/tool-registry.js";
import { ToolRequest } from "#/tools/tool-request.js";
import { Tool } from "#/tools/tool.js";
import { randomUUID } from "node:crypto";

export class AgentGateway {

    constructor(
        private readonly tools: ToolRegistry,
        private readonly policy: PolicyEngine,
        private readonly audit: AuditStore
    ) {}

    async execute(request: ToolRequest): Promise<unknown> {
        const operationId = randomUUID();

        const record = (
            type: AuditEventType,
            extra: Pick<AuditEvent, "durationMs" | "stage"> = {}
        ): Promise<void> => {
            return this.record(type, request, operationId, extra);
        }

        await record("tool.requested");

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
            await record("tool.denied");
            throw new Error(`Policy denied tool execution: ${decision.reason}`);
        }

        await record("tool.authorized");

        const toolContext: ToolExecutionContext = {
            workflowId: request.context.workflowId,
            traceId: request.context.traceId,
            agentId: request.agentId,
            workspace: request.context.workspace
        };

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
        extra: Pick<AuditEvent, "durationMs" | "stage"> = {}
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