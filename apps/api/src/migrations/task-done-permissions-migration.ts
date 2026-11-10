import { addTaskDoneActions } from "./add-task-done-actions";
import { updateStoredRoles } from "./update-stored-roles";

/**
 * Rows saved before `task:move_to_done` existed would otherwise stop their
 * members from finishing tasks.
 */
export async function migrateTaskDonePermissions() {
  const updated = await updateStoredRoles(
    "task-done-permissions-v1",
    addTaskDoneActions,
  );
  if (updated > 0)
    console.log(
      `✅ Added the Move to Done permission to ${updated} workspace role(s).`,
    );
}
