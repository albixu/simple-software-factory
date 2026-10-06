import { relative, resolve } from "node:path";

export function resolveWorkspacePath(
    workspaceRoot: string,
    requestedPath: string
): string {
    
    const root = resolve(workspaceRoot);
    const target = resolve(root, requestedPath);
    const relativePath = relative(root, target);
    const escapesWorkspace = 
        relativePath === ".." ||
        relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);

    if (escapesWorkspace) {
        throw new Error(`Path escapes workspace: ${requestedPath}`);
    }

    return target;
}