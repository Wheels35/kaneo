import type { Context } from "hono";
import type { DbOrTx } from "../../project-access/db-or-tx";
import { workspacePermissionChecker } from "../../utils/require-workspace-permission";
import type { PermissionMap } from "../../utils/role-permissions";

export type StatusGuard = {
  force: boolean;
  userId: string;
  workspaceId: string;
  can: (database: DbOrTx, permissions: PermissionMap) => Promise<boolean>;
};

/**
 * The caller's side of the column rules, built by each route that moves or
 * creates tasks. Integrations and recurrence call the controllers without one.
 * Roles load on the first check, so moves that never reach a guarded column
 * cost no lookup.
 */
export function statusGuard(c: Context): StatusGuard {
  let checker: ReturnType<typeof workspacePermissionChecker> | undefined;
  return {
    force: c.req.query("force") === "true",
    userId: c.get("userId"),
    workspaceId: c.get("workspaceId"),
    can: async (database, permissions) => {
      checker ??= workspacePermissionChecker(c, database);
      return (await checker)(permissions);
    },
  };
}
