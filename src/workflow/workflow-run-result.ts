export type WorkflowRunResult<T> = 
    |   {
            status: "completed";
            value: T;
        }
    |   {
            status: "timed_out";
        }
    |   {
            status: "cancelled";
        }
    |   {
            status: "failed";
            error: unknown;
        }