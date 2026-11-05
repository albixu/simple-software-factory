export interface RecoveryMetrics {
    scanned: number;
    claimed: number;
    completed: number;
    pending: number;
    failed: number;
    durationMs: number;
}


export function createRecoveryMetrics(): RecoveryMetrics {
    return {
        scanned: 0,
        claimed: 0,
        completed: 0,
        pending: 0,
        failed: 0,
        durationMs: 0
    };
}