import { PolicyDecision } from "#/policy/policy-decision.js";
import { PolicyRequest } from "#/policy/policy-request.js";

export interface PolicyEngine {

    evaluate(request: PolicyRequest): Promise<PolicyDecision>
}