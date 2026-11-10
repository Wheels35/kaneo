const OVERRIDE_ROLES = new Set(["admin", "owner"]);

/**
 * Returns a stored role's permission JSON with the task actions that existed
 * implicitly before they became separate switches, or null when the row needs
 * no change. Any role that can edit tasks could already move them to Done;
 * admins and owners also get the blocker override their built-in roles have.
 */
export function addTaskDoneActions(
  role: string,
  permission: string,
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

  const wanted = OVERRIDE_ROLES.has(role)
    ? ["move_to_done", "override_blockers"]
    : ["move_to_done"];
  const added = wanted.filter((action) => !task.includes(action));
  if (added.length === 0) return null;

  return JSON.stringify({ ...statements, task: [...task, ...added] });
}
