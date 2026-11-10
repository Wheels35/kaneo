import { addTaskActions } from "./add-task-actions";

const OVERRIDE_ROLES = new Set(["admin", "owner"]);

/**
 * Any role that can edit tasks could already move them to Done; admins and
 * owners also get the blocker override their built-in roles have.
 */
export function addTaskDoneActions(
  role: string,
  permission: string,
): string | null {
  return addTaskActions(
    permission,
    OVERRIDE_ROLES.has(role)
      ? ["move_to_done", "override_blockers"]
      : ["move_to_done"],
  );
}
