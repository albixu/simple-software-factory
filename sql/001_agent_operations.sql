CREATE TABLE IF NOT EXISTS agent_operations (

    operation_key TEXT PRIMARY KEY,

    input_hash TEXT NOT NULL,

    status TEXT NOT NULL
        CHECK (
            status IN (
                'started',
                'reconciling',
                'completed'
            )
        ),

    owner_token UUID,

    lease_until TIMESTAMPTZ,

    result TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT valid_operation_state CHECK (

        (
            status = 'completed'
            AND result IS NOT NULL
            AND owner_token IS NULL
            AND lease_until IS NULL
        )

        OR

        (
            status IN ('started', 'reconciling')
            AND result IS NULL
            AND owner_token IS NOT NULL
            AND lease_until IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS
    idx_agent_operations_recovery
ON agent_operations (lease_until)
WHERE status IN ('started', 'reconciling');