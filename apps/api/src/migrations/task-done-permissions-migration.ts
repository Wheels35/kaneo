import { eq, sql } from "drizzle-orm";
import db from "../database";
import { dataMigrationTable, workspaceRoleTable } from "../database/schema";
import { addTaskDoneActions } from "./add-task-done-actions";

const COMPLETION_ID = "task-done-permissions-v1";

/**
 * A stored workspace_role row replaces its built-in role entirely, so rows
 * saved before `task:move_to_done` existed would otherwise stop their members
 * from finishing tasks. Runs once: an action removed afterwards in the roles
 * editor must stay removed.
 */
export async function migrateTaskDonePermissions() {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${COMPLETION_ID}))`,
    );
    const [done] = await tx
      .select({ id: dataMigrationTable.id })
      .from(dataMigrationTable)
      .where(eq(dataMigrationTable.id, COMPLETION_ID))
      .limit(1);
    if (done) return;

    const rows = await tx
      .select({
        id: workspaceRoleTable.id,
        role: workspaceRoleTable.role,
        permission: workspaceRoleTable.permission,
      })
      .from(workspaceRoleTable);
    let updated = 0;
    for (const row of rows) {
      const permission = addTaskDoneActions(row.role, row.permission);
      if (!permission) continue;
      await tx
        .update(workspaceRoleTable)
        .set({ permission })
        .where(eq(workspaceRoleTable.id, row.id));
      updated += 1;
    }

    await tx.insert(dataMigrationTable).values({ id: COMPLETION_ID });
    if (updated > 0)
      console.log(
        `✅ Added the Move to Done permission to ${updated} workspace role(s).`,
      );
  });
}
