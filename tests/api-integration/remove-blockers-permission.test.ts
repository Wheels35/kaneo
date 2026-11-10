import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { migrateRemoveBlockersPermission } from "../../apps/api/src/migrations/remove-blockers-permission-migration";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// Background notifications could race the next test's TRUNCATE.
vi.mock(
  "../../apps/api/src/notification/controllers/create-notification",
  () => ({ default: vi.fn(async () => null) }),
);

beforeEach(resetTestDatabase);

const AGENT = { project: ["read"], task: ["read", "create", "update"] };

async function setup(role: string) {
  const member = await createWorkspaceMember({ role });
  if (role === "agent")
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role,
      permission: JSON.stringify(AGENT),
    });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const [blocker, card] = await db
    .insert(schema.taskTable)
    .values(
      ["Blocker", "Card"].map((title, index) => ({
        projectId: project.id,
        title,
        status: "to-do",
        number: index + 1,
      })),
    )
    .returning();

  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const link = async (relationType: string) => {
    const response = await app.request("/api/task-relation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceTaskId: blocker.id,
        targetTaskId: card.id,
        relationType,
      }),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { id: string }).id;
  };
  const unlink = (id: string) =>
    app.request(`/api/task-relation/${id}`, { method: "DELETE" });

  return { link, unlink };
}

async function relationExists(id: string) {
  const rows = await db
    .select()
    .from(schema.taskRelationTable)
    .where(eq(schema.taskRelationTable.id, id));
  return rows.length === 1;
}

describe("Remove blockers permission", () => {
  it("lets a role without it add a blocks link but not delete one", async () => {
    const { link, unlink } = await setup("agent");
    const blocks = await link("blocks");

    const refused = await unlink(blocks);

    expect(refused.status).toBe(403);
    expect(await readErrorBody(refused)).toMatchObject({
      code: "MISSING_PERMISSION",
      missingPermissions: ["task:remove_blockers"],
    });
    expect(await relationExists(blocks)).toBe(true);
  });

  it("leaves other links to task:update", async () => {
    const { link, unlink } = await setup("agent");

    expect((await unlink(await link("related"))).status).toBe(200);
  });

  it("lets a member delete a blocks link", async () => {
    const { link, unlink } = await setup("member");
    const blocks = await link("blocks");

    expect((await unlink(blocks)).status).toBe(200);
    expect(await relationExists(blocks)).toBe(false);
  });
});

describe("Remove blockers permission migration", () => {
  async function seed() {
    const { workspace } = await createWorkspaceMember();
    const rows = await db
      .insert(schema.workspaceRoleTable)
      .values(
        [
          ["viewer", { task: ["read"] }],
          ["member", { task: ["create", "read", "update", "move_to_done"] }],
          ["agent", AGENT],
        ].map(([role, permission]) => ({
          workspaceId: workspace.id,
          role: role as string,
          permission: JSON.stringify(permission),
        })),
      )
      .returning();
    return Object.fromEntries(rows.map((row) => [row.role, row.id]));
  }
  const taskActions = async (id: string) => {
    const [row] = await db
      .select()
      .from(schema.workspaceRoleTable)
      .where(eq(schema.workspaceRoleTable.id, id));
    return JSON.parse(row.permission).task;
  };

  it("keeps every role that could edit tasks able to delete blocks links", async () => {
    const ids = await seed();

    await migrateRemoveBlockersPermission();

    expect(await taskActions(ids.member)).toEqual([
      "create",
      "read",
      "update",
      "move_to_done",
      "remove_blockers",
    ]);
    expect(await taskActions(ids.agent)).toContain("remove_blockers");
    expect(await taskActions(ids.viewer)).toEqual(["read"]);
  });

  it("runs once, so the switch stays off on a role you turn it off for", async () => {
    const ids = await seed();
    await migrateRemoveBlockersPermission();
    await db
      .update(schema.workspaceRoleTable)
      .set({ permission: JSON.stringify(AGENT) })
      .where(eq(schema.workspaceRoleTable.id, ids.agent));

    await migrateRemoveBlockersPermission();

    expect(await taskActions(ids.agent)).toEqual(AGENT.task);
  });
});
