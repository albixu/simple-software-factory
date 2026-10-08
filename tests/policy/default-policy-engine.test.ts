import {
    describe,
    expect,
    it
} from "vitest";

import { DefaultPolicyEngine } from "#/policy/default-policy-engine.js";
import { PolicyRequest } from "#/policy/policy-request.js";


describe( "DefaultPolicyEngine", () => {
    const createRequest =
      (
        tool: string,
        args: unknown
      ): PolicyRequest => ({

        agentId: "planner",
        tool,
        arguments: args,
        context: {
          workflowId: "wf-test",
          traceId: "trace-test",
          attempt: 1,
          workspace: {
            id: "workspace-test",
            root: "/repository"
          }
        }
      });

    it("allows planner to search code", async () => {
        const policy = new DefaultPolicyEngine();
        const decision = await policy.evaluate(
            createRequest(
              "code.search",
              {
                query: "PaymentError"
              }
            )
          );


        expect(decision.allowed).toBe(true);
      }
    );


    it("allows planner to read normal source files", async () => {
        const policy = new DefaultPolicyEngine();
        const decision = await policy.evaluate(
            createRequest(
              "filesystem.read",
              {
                path: "src/payment.ts"
              }
            )
          );


        expect(decision.allowed).toBe(true);
      }
    );


    it.each([
      ".env",
      ".env.production",
      "config/.env",
      "config\\.env.local",
      "certificates/server.pem",
      "certificates/server.key"
    ])("denies sensitive file %s", async path => {

        const policy = new DefaultPolicyEngine();
        const decision = await policy.evaluate(
            createRequest(
              "filesystem.read",
              {
                path
              }
            )
          );

        expect(decision.allowed).toBe(false);
      }
    );


    it("denies unknown capabilities by default", async () => {
        const policy = new DefaultPolicyEngine();
        const decision = await policy.evaluate(
            createRequest(
              "filesystem.write",
              {
                path: "src/payment.ts"
              }
            )
          );


        expect(decision.allowed).toBe(false);
      }
    );
  }
);