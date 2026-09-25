import { ToolRegistry } from "#/tools/tool-registry.ts";
import { SearchCodeTool } from "#/tools/search-code.tool.ts";
import { AgentGateway } from "#/gateway/agent-gateway.ts";
import { WorkflowNode } from "#/workflow/nodes/workflow-node.ts";
import { PlanningNode } from "#/workflow/nodes/planning.workflow-node.ts";
import { WorkflowEngine } from "#/workflow/workflow-engine.ts";
import { WorkflowState } from "#/workflow/workflow-state.ts";
import { FakePlannerAgent } from "#/agents/planner-fake.agent.ts";

const registry = new ToolRegistry();

registry.register(
    new SearchCodeTool(process.cwd())
);

const gateway = new AgentGateway(registry);

const planner = new FakePlannerAgent();

const nodes = new Map<string, WorkflowNode>();
nodes.set(
    'planning',
    new PlanningNode(planner)
);

const engine = new WorkflowEngine(nodes);

const initialState: WorkflowState = {
    workflowId: crypto.randomUUID(),

    issue: {
        id: '1842',
        title: 'ORA-30926 updating template',
        description: 'Updating some templates fails with ORA-30926'
    },

    status: 'planning',

    attempts: {
        implementation: 0,
        review: 0
    }
};

const result = await engine.run(initialState);

console.dir(
    result,
    {depth: null}
);