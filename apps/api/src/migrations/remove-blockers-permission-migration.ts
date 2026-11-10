import { addTaskActions } from "./add-task-actions";
import { updateStoredRoles } from "./update-stored-roles";

/**
 * Deleting a "blocks" link needed only task:update before
 * `task:remove_blockers` existed, so rows saved earlier keep that ability.
 */
export async function migrateRemoveBlockersPermission() {
  const updated = await updateStoredRoles(
    "remove-blockers-permission-v1",
    (_role, permission) => addTaskActions(permission, ["remove_blockers"]),
  );
  if (updated > 0)
    console.log(
      `✅ Added the Remove blockers permission to ${updated} workspace role(s).`,
    );
}
