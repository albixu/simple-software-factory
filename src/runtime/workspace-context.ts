export interface WorkspaceContext {
  id: string;

  /**
   * Absolute path to the workspace root.
   *
   * Example:
   * /tmp/workflows/wf-1842/repo
   */
  root: string;
}