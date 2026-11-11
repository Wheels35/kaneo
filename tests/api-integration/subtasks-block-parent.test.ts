import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import createTaskRelation from "../../apps/api/src/task-relation/controllers/create-task-relation";
import deleteTaskRelation from "../../apps/api/src/task-relation/controllers/delete-task-relation";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addTask } from "./helpers/tasks";

beforeEach(resetTestDatabase);

async function setup({ parentBoardOn = true, childBoardOn = false } = {}) {
  const member = await createWorkspaceMember({ role: "owner" });
  const plan = await createProjectFixture({ workspaceId: member.workspace.id });
  const phase = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  for (const [project, on] of [
    [plan, parentBoardOn],
    [phase, childBoardOn],
  ] as const) {
    await db
      .update(schema.projectTable)
      .set({ subtasksBlockParent: on })
      .where(eq(schema.projectTable.id, project.project.id));
  }
  const parent = await addTask(plan.project.id, { title: "Phase card" });
  const child = await addTask(phase.project.id, { title: "Phase task" });
  const link = (
    relationType: string,
    sourceTaskId: string,
    targetTaskId: string,
  ) =>
    createTaskRelation({
      sourceTaskId,
      targetTaskId,
      relationType,
      userId: member.user.id,
      workspaceId: member.workspace.id,
    });
  return { member, plan, phase, parent, child, link };
}

async function blocksBetween(sourceTaskId: string, targetTaskId: string) {
  return db
    .select()
    .from(schema.taskRelationTable)
    .where(
      and(
        eq(schema.taskRelationTable.relationType, "blocks"),
        eq(schema.taskRelationTable.sourceTaskId, sourceTaskId),
        eq(schema.taskRelationTable.targetTaskId, targetTaskId),
      ),
    );
}

describe("Subtasks block their parent", () => {
  it("links a new subtask as blocking its parent when the parent's board has it on", async () => {
    const { parent, child, link } = await setup();

    const relation = await link("subtask", parent.id, child.id);

    expect(relation.relationType).toBe("subtask");
    expect(await blocksBetween(child.id, parent.id)).toHaveLength(1);
  });

  it("does nothing when only the child's board has it on", async () => {
    const { parent, child, link } = await setup({
      parentBoardOn: false,
      childBoardOn: true,
    });

    await link("subtask", parent.id, child.id);

    expect(await blocksBetween(child.id, parent.id)).toHaveLength(0);
  });

  it("only acts on subtask links", async () => {
    const { parent, child, link } = await setup();

    await link("related", parent.id, child.id);

    expect(await blocksBetween(child.id, parent.id)).toHaveLength(0);
  });

  it("keeps an existing blocks link in either direction as it is", async () => {
    const same = await setup();
    await same.link("blocks", same.child.id, same.parent.id);
    await same.link("subtask", same.parent.id, same.child.id);
    expect(await blocksBetween(same.child.id, same.parent.id)).toHaveLength(1);

    const reverse = await setup();
    await reverse.link("blocks", reverse.parent.id, reverse.child.id);
    await reverse.link("subtask", reverse.parent.id, reverse.child.id);
    expect(
      await blocksBetween(reverse.child.id, reverse.parent.id),
    ).toHaveLength(0);
  });

  it("leaves the block in place when the subtask is unlinked", async () => {
    const { member, parent, child, link } = await setup();
    const relation = await link("subtask", parent.id, child.id);

    await deleteTaskRelation(relation.id, member.user.id, member.workspace.id);

    expect(await blocksBetween(child.id, parent.id)).toHaveLength(1);
  });

  it("is set through the project API and kept when a client omits it", async () => {
    const { member, plan } = await setup({ parentBoardOn: false });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const update = (body: object) =>
      app.request(`/api/project/${plan.project.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: plan.project.name,
          icon: plan.project.icon ?? "Layout",
          slug: plan.project.slug,
          description: "",
          isPublic: false,
          ...body,
        }),
      });

    const switchedOn = await update({ subtasksBlockParent: true });
    expect(switchedOn.status).toBe(200);
    expect(await switchedOn.json()).toMatchObject({
      subtasksBlockParent: true,
    });

    const renamed = await update({ name: "Renamed" });
    expect(await renamed.json()).toMatchObject({
      name: "Renamed",
      subtasksBlockParent: true,
    });
  });
});
