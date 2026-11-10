import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { eventContext } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { getPublicProject } from "../../apps/api/src/project/controllers/get-public-project";
import getTasks from "../../apps/api/src/task/controllers/get-tasks";
import createTaskRelation from "../../apps/api/src/task-relation/controllers/create-task-relation";
import deleteTaskRelation from "../../apps/api/src/task-relation/controllers/delete-task-relation";
import {
  addConnection,
  initializeWebSocketAdapter,
  removeConnection,
  shutdownWebSocketAdapter,
} from "../../apps/api/src/ws";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function addTask(
  projectId: string,
  title = "Task",
  number: number | null = null,
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId, title, status: "to-do", number })
    .returning();
  return task;
}

async function relate(
  sourceTaskId: string,
  targetTaskId: string,
  createdAt?: Date,
) {
  const [relation] = await db
    .insert(schema.taskRelationTable)
    .values({
      sourceTaskId,
      targetTaskId,
      relationType: "subtask",
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();
  return relation;
}

async function parentOf(projectId: string, taskId: string, userId?: string) {
  const { data } = await getTasks(projectId, {}, userId);
  return [
    ...data.columns.flatMap((column) => column.tasks),
    ...data.plannedTasks,
    ...data.archivedTasks,
  ].find((task) => task.id === taskId)?.parent;
}

async function phaseAndPlan() {
  const member = await createWorkspaceMember();
  const plan = await createProjectFixture({
    workspaceId: member.workspace.id,
    slug: "PLAN",
  });
  const phase = await createProjectFixture({
    workspaceId: member.workspace.id,
    slug: "PHASE",
  });
  const parent = await addTask(plan.project.id, "Build phase", 5);
  const child = await addTask(phase.project.id, "Write the parser", 2);
  return { member, plan, phase, parent, child };
}

describe("API integration: task parent on boards", () => {
  beforeEach(resetTestDatabase);

  it("shows a parent on another board with that board's key", async () => {
    const { member, plan, phase, parent, child } = await phaseAndPlan();
    await relate(parent.id, child.id);

    mockAuthenticatedSession(member.user);
    const response = await createApp().app.request(
      `/api/task/tasks/${phase.project.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const card = body.data.columns
      .flatMap((column: { tasks: { id: string }[] }) => column.tasks)
      .find((task: { id: string }) => task.id === child.id);
    expect(card.parent).toEqual({
      id: parent.id,
      number: 5,
      title: "Build phase",
      projectId: plan.project.id,
      projectSlug: "PLAN",
    });
    expect(await parentOf(plan.project.id, parent.id)).toBeNull();
  });

  it("includes the parent in a task's board view", async () => {
    const { member, parent, child } = await phaseAndPlan();
    await relate(parent.id, child.id);

    mockAuthenticatedSession(member.user);
    const response = await createApp().app.request(
      `/api/task/${child.id}?view=board`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      parent: { id: parent.id, projectSlug: "PLAN", number: 5 },
    });
  });

  it("uses the oldest link when a task has several parents", async () => {
    const { plan, phase, parent, child } = await phaseAndPlan();
    const older = await addTask(plan.project.id, "Older parent", 1);
    await relate(parent.id, child.id, new Date("2026-02-01T00:00:00Z"));
    await relate(older.id, child.id, new Date("2026-01-01T00:00:00Z"));

    expect((await parentOf(phase.project.id, child.id))?.id).toBe(older.id);
  });

  it("keeps a parent whose board is archived", async () => {
    const { plan, phase, parent, child } = await phaseAndPlan();
    await relate(parent.id, child.id);
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, plan.project.id));

    expect((await parentOf(phase.project.id, child.id))?.id).toBe(parent.id);
  });

  it("hides a parent on a board the viewer cannot see", async () => {
    const { member, phase, parent, child } = await phaseAndPlan();
    await relate(parent.id, child.id);
    await db.insert(schema.workspaceMemberAccessTable).values({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      projectAccess: "selected",
    });
    await db.insert(schema.workspaceMemberProjectTable).values({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      projectId: phase.project.id,
    });

    expect(
      await parentOf(phase.project.id, child.id, member.user.id),
    ).toBeNull();
  });

  it("ignores a parent in another workspace", async () => {
    const { phase, child } = await phaseAndPlan();
    const stranger = await createWorkspaceMember();
    const foreign = await createProjectFixture({
      workspaceId: stranger.workspace.id,
    });
    const foreignParent = await addTask(foreign.project.id, "Foreign", 1);
    // A legacy malformed relation must not cross the workspace boundary.
    await relate(foreignParent.id, child.id);

    expect(await parentOf(phase.project.id, child.id)).toBeNull();
  });

  it("shows no parent on public boards", async () => {
    const { plan, phase, parent, child } = await phaseAndPlan();
    await relate(parent.id, child.id);
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, phase.project.id));
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, plan.project.id));

    const board = await getPublicProject(phase.project.id);
    const card = board.columns
      .flatMap((column) => column.tasks)
      .find((task) => task.id === child.id);
    expect(card?.parent ?? null).toBeNull();
  });

  it("refreshes the child's board when a cross-board subtask link is added or removed", async () => {
    const { member, phase, parent, child } = await phaseAndPlan();
    await initializeWebSocketAdapter();
    const send = vi.fn();
    const connection = addConnection(
      phase.project.id,
      { send } as never,
      member.user.id,
      "same-window",
      member.workspace.id,
    );
    try {
      const relation = await eventContext.run(
        { initiatorId: "same-window" },
        () =>
          createTaskRelation({
            sourceTaskId: parent.id,
            targetTaskId: child.id,
            relationType: "subtask",
            userId: member.user.id,
            workspaceId: member.workspace.id,
          }),
      );
      await vi.waitFor(() => expect(send).toHaveBeenCalled());
      expect(JSON.parse(send.mock.calls[0][0])).toEqual({
        type: "TASK_RELATION_UPDATED",
        projectId: phase.project.id,
        taskId: "",
      });

      send.mockClear();
      await eventContext.run({ initiatorId: "same-window" }, () =>
        deleteTaskRelation(relation.id, member.user.id, member.workspace.id),
      );
      await vi.waitFor(() => expect(send).toHaveBeenCalled());
      expect(JSON.parse(send.mock.calls[0][0])).toEqual({
        type: "TASK_RELATION_UPDATED",
        projectId: phase.project.id,
        taskId: "",
      });
    } finally {
      removeConnection(phase.project.id, connection);
      await shutdownWebSocketAdapter();
    }
  });
});
