/**
 * Returns a stored role's permission JSON with the given task actions added,
 * or null when the row needs no change. Only roles that can edit tasks gain
 * them: the actions split off abilities that task:update used to include.
 */
export function addTaskActions(
  permission: string,
  actions: readonly string[],
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(permission);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;

  const statements = parsed as Record<string, unknown>;
  const task = statements.task;
  if (!Array.isArray(task) || !task.includes("update")) return null;

  const added = actions.filter((action) => !task.includes(action));
  if (added.length === 0) return null;

  return JSON.stringify({ ...statements, task: [...task, ...added] });
}
