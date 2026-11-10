import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { migrateTaskDonePermissions } from "../../apps/api/src/migrations/task-done-permissions-migration";
import { roleAllows } from "../../apps/api/src/utils/role-permissions";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

// Role rows as they were stored before the task actions existed.
const legacyRoles = {
  viewer: { task: ["read"] },
  member: { project: ["create", "read"], task: ["create", "read", "update"] },
  admin: { task: ["create", "read", "update", "delete", "assign"] },
  agent: { project: ["read"], task: ["create", "read", "update"] },
};

async function seedLegacyRoles() {
  const { workspace } = await createWorkspaceMember();
  const rows = await db
    .insert(schema.workspaceRoleTable)
    .values(
      Object.entries(legacyRoles).map(([role, permission]) => ({
        workspaceId: workspace.id,
        role,
        permission: JSON.stringify(permission),
      })),
    )
    .returning();
  return Object.fromEntries(rows.map((row) => [row.role, row.id]));
}

async function stored(id: string) {
  const [row] = await db
    .select()
    .from(schema.workspaceRoleTable)
    .where(eq(schema.workspaceRoleTable.id, id));
  return row;
}

describe("task Done permissions migration", () => {
  beforeEach(resetTestDatabase);

  it("keeps every role that could edit tasks able to finish them", async () => {
    const ids = await seedLegacyRoles();

    await migrateTaskDonePermissions();

    const member = await stored(ids.member);
    expect(JSON.parse(member.permission)).toEqual({
      project: ["create", "read"],
      task: ["create", "read", "update", "move_to_done"],
    });
    expect(
      roleAllows(member.role, member.permission, { task: ["move_to_done"] }),
    ).toBe(true);
    expect(
      roleAllows(member.role, member.permission, {
        task: ["override_blockers"],
      }),
    ).toBe(false);
    expect(JSON.parse((await stored(ids.admin)).permission).task).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "assign",
      "move_to_done",
      "override_blockers",
    ]);
    expect(JSON.parse((await stored(ids.agent)).permission).task).toEqual([
      "create",
      "read",
      "update",
      "move_to_done",
    ]);
    expect(JSON.parse((await stored(ids.viewer)).permission)).toEqual({
      task: ["read"],
    });
  });

  it("runs once, so an action switched off afterwards stays off", async () => {
    const ids = await seedLegacyRoles();
    await migrateTaskDonePermissions();
    await db
      .update(schema.workspaceRoleTable)
      .set({ permission: JSON.stringify(legacyRoles.agent) })
      .where(eq(schema.workspaceRoleTable.id, ids.agent));

    await migrateTaskDonePermissions();

    expect(JSON.parse((await stored(ids.agent)).permission)).toEqual(
      legacyRoles.agent,
    );
    expect(await db.select().from(schema.dataMigrationTable)).toEqual([
      expect.objectContaining({ id: "task-done-permissions-v1" }),
    ]);
  });

  it("skips a malformed role row without blocking startup", async () => {
    const { workspace } = await createWorkspaceMember();
    const [row] = await db
      .insert(schema.workspaceRoleTable)
      .values({ workspaceId: workspace.id, role: "broken", permission: "{" })
      .returning();

    await expect(migrateTaskDonePermissions()).resolves.toBeUndefined();

    expect((await stored(row.id)).permission).toBe("{");
  });
});
