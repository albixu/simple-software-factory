import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type {
  CheckpointStore,
  WorkflowCheckpoint
} from "#/workflow/checkpoints/checkpoint-store.js";


const CheckpointEnvelopeSchema = z.object({
    schemaVersion: z.literal(1),
    workflowId: z.string(),
    revision: z.number().int().nonnegative(),
    saveAt: z.iso.datetime(),
    state: z.unknown()
});


export class FileCheckpointStore<TState> implements CheckpointStore<TState> {
    
    constructor(
        private readonly directory: string,
        private readonly parseState: (value: unknown) => TState
    ) {}


    async load(workflowId: string): Promise<WorkflowCheckpoint<TState> | null> {
        const path = this.getPath(workflowId);
        let content: string;

        try {
            content = await readFile(path, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }

            throw error;
        }

        const checkpoint = CheckpointEnvelopeSchema.parse(
            JSON.parse(content)
        );

        if (checkpoint.workflowId !== workflowId) {
            throw new Error("Checkpoint workflowId mismatch");
        }

        return {
            ...checkpoint,

            state: this.parseState(checkpoint.state)
        };
    }


    async save(checkpoint: WorkflowCheckpoint<TState>): Promise<void> {
        const destination = this.getPath(checkpoint.workflowId);

        await mkdir(this.directory, {
            recursive: true
        });

        const temporary = join(this.directory, `${checkpoint.workflowId}.${randomUUID()}.tmp`);

        try {
            await writeFile(
                temporary,
                JSON.stringify(checkpoint, null, 2),
                {
                    flag: "wx",
                    mode: 0o600
                }
            );

            await rename(temporary, destination);
        } finally {
            await unlink(temporary).catch(() => undefined);
        }
    }


    private getPath(workflowId: string): string {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(workflowId)) {
            throw new Error("Invalid workflowId");
        }

        return join(
            this.directory,
            `${workflowId}.json`
        );
    }
}