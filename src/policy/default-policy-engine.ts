import { PolicyDecision } from "#/policy/policy-decision.js";
import { PolicyEngine } from "#/policy/policy-engine.js";
import { PolicyRequest } from "#/policy/policy-request.js";

export class DefaultPolicyEngine implements PolicyEngine {

    async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
        if (
            request.agentId === "planner" &&
            request.tool === "code.search"
        ) {
            return { allowed: true };
        }

        if (
            request.agentId === "planner" &&
            request.tool === "filesystem.read"
        ) {
            return this.evaluatePlannerRead(request.arguments);
        }

        return {
            allowed: false,
            reason: `No policy allows agent ${request.agentId} to use ${request.tool}`
        };
    }


    private evaluatePlannerRead(args: unknown): PolicyDecision {
        if (!this.hasPath(args)) {
            return {
                allowed: false,
                reason: "filesystem.read requires a path"
            };
        }

        if (this.isSensitivePath(args.path)) {
            return {
                allowed: false,
                reason: `Planner cannot read sensitive file: ${args.path}`
            };
        }

        return { allowed: true };
    }


    private hasPath(value: unknown): value is { path: string; } {
        return (
            typeof value === "object" &&
            value !== null &&
            "path" in value &&
            typeof value.path === "string"
        );
    }


    private isSensitivePath(path: string): boolean {
        const normalized = path.replaceAll("\\", "/").toLowerCase();
        const segments = normalized.split("/");
        const filename = segments.at(-1) ?? "";

        if (
            filename === ".env.example" ||
            path ==="package.json" ||
            path.startsWith("src/") ||
            path.startsWith("tests/")
        ) {
            return false;
        }

        return (
            filename === ".env" ||
            filename.startsWith(".env.") ||
            filename.endsWith(".pem") ||
            filename.endsWith(".key")
        );
    }
}