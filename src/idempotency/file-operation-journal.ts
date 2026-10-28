import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";

import { join } from "node:path";

import { z } from "zod";


/*
 * Formato persistente de las operaciones
 */
const OperationRecordSchema = z.discriminatedUnion(
    "status",
    [
        z.object({
            status: z.literal("started"),
            key: z.string(),
            inputHash: z.string()
        }),

        z.object({
            status: z.literal("completed"),
            key: z.string(),
            inputHash: z.string(),
            result: z.string()
        })
    ]
);


/*
 * Resultado de intentar reservar una operación.
 */
export type OperationReservation = 
    |   { kind: "new" }
    |   { kind: "started" }
    |   {
            kind: "completed";
            result: string;
        };


export class FileOperationJournal {

    constructor(private readonly directory: string) {}

    /*
     * Reserva una operación o recupera
     * su estado anterior.
     */
    async reserve(
        key: string,
        inputHash: string
    ): Promise<OperationReservation> {
        if (!key.trim()) {
            throw new Error("Operation key cannot be empty");
        }

        await mkdir(this.directory, { recursive: true });
        const path = this.getPath(key);

        /*
         * flag: "wx" permite crear el archivo
         * solamente si todavía no existe.
         */
        try {
            await writeFile(
                path,
                JSON.stringify({
                    status: "started",
                    key,
                    inputHash
                }),
                {
                    flag: "wx",
                    mode: 0o600
                }
            );

            return {
                kind: "new"
            };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;

            if (code !== "EEXIST") {
                throw error;
            }
        }

        /*
         * El archivo ya existía.
         * Recuperamos y validamos su contenido.
         */
        const record = OperationRecordSchema.parse(
            JSON.parse(
                await readFile(path, "utf8")
            )
        );

        /*
         * Una misma clave no puede representar
         * operaciones con entradas diferentes.
         */
        if (
            record.key !== key ||
            record.inputHash !== inputHash
        ) {
            throw new Error("Idempotency key reused with different input");
        }

        if (record.status === "completed") {
            return {
                kind: "completed",
                result: record.result
            };
        }

        return {
            kind: "started"
        };
    }


    /*
     * Confirma una operación completada
     */
    async complete(
        key: string,
        inputHash: string,
        result: string
    ): Promise<void> {
        const destination = this.getPath(key);

        const current = OperationRecordSchema.parse(
            JSON.parse(await readFile(destination, "utf8"))
        );

        if (
            current.key !== key ||
            current.inputHash !== inputHash ||
            current.status !== "started"
        ) {
            throw new Error("Operation cannot be completed");
        }

        const temporary = join(
            this.directory,
            `${randomUUID()}.tmp`
        );

        try {
            await writeFile(
                temporary,
                JSON.stringify({
                    status: "completed",
                    key,
                    inputHash,
                    result
                }),
                {
                    flag: "wx",
                    mode: 0o600
                }
            );

            await rename(temporary, destination);
        } finally {
            await unlink(temporary).catch(
                () => undefined
            );
        }
    }


    /* 
     * Utilizamos un hash para construir
     * nombres de archivo seguros.
     */
    private getPath(key: string): string {
        const hash = createHash("sha256")
            .update(key)
            .digest("hex");

        return join(
            this.directory,
            `${hash}.json`
        );
    }
}