import { eq, sql } from "drizzle-orm";
import db from "../database";
import { dataMigrationTable, workspaceRoleTable } from "../database/schema";

/**
 * Rewrites every stored workspace_role row once, under `completionId`. A
 * stored row replaces its built-in role entirely, so a new action must be
 * added to the rows themselves. Running once means an action switched off
 * afterwards in the roles editor stays off. Returns how many rows changed.
 */
export async function updateStoredRoles(
  completionId: string,
  transform: (role: string, permission: string) => string | null,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${completionId}))`,
    );
    const [done] = await tx
      .select({ id: dataMigrationTable.id })
      .from(dataMigrationTable)
      .where(eq(dataMigrationTable.id, completionId))
      .limit(1);
    if (done) return 0;

    const rows = await tx
      .select({
        id: workspaceRoleTable.id,
        role: workspaceRoleTable.role,
        permission: workspaceRoleTable.permission,
      })
      .from(workspaceRoleTable);
    let updated = 0;
    for (const row of rows) {
      const permission = transform(row.role, row.permission);
      if (!permission) continue;
      await tx
        .update(workspaceRoleTable)
        .set({ permission })
        .where(eq(workspaceRoleTable.id, row.id));
      updated += 1;
    }

    await tx.insert(dataMigrationTable).values({ id: completionId });
    return updated;
  });
}
