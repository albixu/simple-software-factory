import { randomUUID } from "node:crypto";
import type { Pool } from "pg";


export type Reservation = 
    |   {
            kind: "acquired";
            token: string;
        }
    |   {
            kind: "completed";
            result: string;
        }
    |   {
            kind: "in_progress";
        };


interface OperationRow {
    input_hash: string;
    status: "started" | "reconciling" | "completed";
    result: string | null;
}


export interface ExpiredOperation {
    operationKey: string;
    inputHash: string;
}


export class PgOperationJournal {

    constructor(
        private readonly pool: Pool,
        private readonly leaseSeconds = 60
    ) {
        if (
            !Number.isInteger(leaseSeconds) ||
            leaseSeconds <= 0
        ) {
            throw new Error("Invalid lease duration");
        }
    }


    async reserve(
        operationKey: string,
        inputHash: string,
    ): Promise<Reservation> {
        
        if (!operationKey.trim()) {
            throw new Error("Operation key cannot be empty");
        }

        const token = randomUUID();

        /*
         * Intentamos reservar la operación.
         *
         * PostgreSQL garantiza que solo una
         * inserción puede crear esta clave.
         */
        const inserted = await this.pool.query(
            `
                INSERT INTO agent_operations (
                    operation_key,
                    input_hash,
                    status,
                    owner_token,
                    lease_until
                ) VALUES (
                    $1,
                    $2,
                    'started',
                    $3::uuid,
                    NOW() + ($4::int * INTERVAL '1 second') 
                )
                ON CONFLICT (operation_key) DO NOTHING
                RETURNING operation_key
            `,
            [
                operationKey,
                inputHash,
                token,
                this.leaseSeconds
            ]
        );

        if (inserted.rowCount === 1) {
            return {
                kind: "acquired",
                token
            };
        }

        /*
         * La operación ya existe.
         * Consultamos su estado.
         */
        const existing = await this.pool.query<OperationRow>(
            `
                SELECT
                    input_hash,
                    status,
                    result
                FROM agent_operations
                WHERE operation_key = $1
            `,
            [operationKey]
        );

        const operation = existing.rows[0];

        if (!operation) {
            throw new Error("Operation disappeared during reservation");
        }

        if (operation.input_hash !== inputHash) {
            throw new Error("Idempotency key reused with different input");
        }

        if (operation.status === "completed") {
            if (operation.result === null) {
                throw new Error("Invalid completed operation");
            }

            return {
                kind: "completed",
                result: operation.result
            };
        }

        return {
            kind: "in_progress"
        };
    }


    async complete(
        operationKey: string,
        inputHash: string,
        token: string,
        result: string
    ): Promise<void> {

        const updated = await this.pool.query(
            `
                UPDATE agent_operations
                SET
                    status = 'completed',
                    result = $4,
                    owner_token = NULL,
                    lease_until = NULL,
                    updated_at = NOW()
                WHERE operation_key = $1
                    AND input_hash = $2
                    AND owner_token = $3::uuid
                    AND status = 'started'
                RETURNING operation_key
            `,
            [
                operationKey,
                inputHash,
                token,
                result
            ]
        );

        if (updated.rowCount !== 1) {
            throw new Error("Operation ownership lost");
        }
    }


    async claimReconciliation(
        operationKey: string,
        inputHash: string
    ): Promise<string | null> {

        const token = randomUUID();

        const result = await this.pool.query(
            `
                UPDATE agent_operations
                SET
                    status = 'reconciling',
                    owner_token = $3::uuid,
                    lease_until = NOW() + ($4::int * INTERVAL '1 second')
                WHERE operation_key = $1
                    AND input_hash = $2
                    AND status IN ('started', 'reconciling')
                    AND lease_until < NOW()
                RETURNING operation_key
            `,
            [
                operationKey,
                inputHash,
                token,
                this.leaseSeconds
            ]
        );

        if (result.rowCount !== 1) {
            return null;
        }

        return token;
    }


    async renewReconciliationLease(
        operationKey: string,
        inputHash: string,
        token: string
    ): Promise<boolean> {

        const result = await this.pool.query(
            `
                UPDATE agent_operations
                SET
                    lease_until = NOW() + ($4::int * INTERVAL '1 second'),
                    updated_at = NOW()
                WHERE operation_key = $1
                    AND input_hash = $2
                    AND owner_token = $3::uuid
                    AND status = 'reconciling'
                    AND lease_until > NOW()
                RETURNING operation_key
            `,
            [
                operationKey,
                inputHash,
                token,
                this.leaseSeconds
            ]
        );

        return result.rowCount === 1;
    }


    async confirmReconciliation(
        operationKey: string,
        inputHash: string,
        token: string,
        result: string
    ): Promise<void> {

        const updated = await this.pool.query(
            `
                UPDATE agent_operations
                SET
                    status = 'completed',
                    result = $4,
                    owner_token = NULL,
                    lease_until = NULL,
                    updated_at = NOW()
                WHERE operation_key = $1
                    AND input_hash = $2
                    AND owner_token = $3::uuid
                    AND status = 'reconciling'
                RETURNING operation_key
            `,
            [
                operationKey,
                inputHash,
                token,
                result
            ]
        );

        if (updated.rowCount !== 1) {
            throw new Error("Reconciliation ownership lost");
        }
    }


    async findExpired(limit = 20): Promise<ExpiredOperation[]> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 1000
        ) {
            throw new Error("Invalid recovery batch size");
        }

        const result = await this.pool.query<{
            operation_key: string;
            input_hash: string;
        }>(
            `
                SELECT
                    operation_key,
                    input_hash
                FROM agent_operations
                WHERE status IN ('started', 'reconciling')
                    AND lease_until < NOW()
                ORDER BY lease_until ASC
                LIMIT $1
            `,
            [limit]
        );

        return result.rows.map(row => ({
            operationKey: row.operation_key,
            inputHash: row.input_hash
        }));
    }
}