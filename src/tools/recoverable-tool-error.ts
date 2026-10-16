export type RecoverableToolErrorCode = 
    | "FILE_NOT_FOUND"
    | "TEMPORARY_UNAVAILABLE";


const SAFE_MESSAGE: Record<RecoverableToolErrorCode, string> = {
    FILE_NOT_FOUND: 
        "The requested file does not exist. " +
        "Locate the correct file before continuing.",

    TEMPORARY_UNAVAILABLE: 
        "The tool is temporarily unavailable. " +
        "Try an alternative approach or retry if appropriate."
};


export class RecoverableToolError extends Error {
    readonly safeMessage: string;
    readonly retryable: boolean;

    constructor(readonly code: RecoverableToolErrorCode) {
        super(`Recoverable tool error: ${code}`);

        this.name = "RecoverableToolError";
        this.safeMessage = SAFE_MESSAGE[code];
        this.retryable = code === "TEMPORARY_UNAVAILABLE";
    }
}