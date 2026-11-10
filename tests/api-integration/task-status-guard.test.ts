import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

// Background notifications could race the next test's TRUNCATE.
vi.mock(
  "../../apps/api/src/notification/controllers/create-notification",
  () => ({ default: vi.fn(async () => null) }),
);

beforeEach(resetTestDatabase);

// An agent role as the fork's docs describe it: it edits tasks, but has
// neither Move to Done nor Override blockers.
const AGENT = { project: ["read"], task: ["read", "create", "update"] };

let taskNumber = 0;

async function setup(role = "agent") {
  const member = await createWorkspaceMember({ role });
  const workspaceId = member.workspace.id;
  if (role === "agent")
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId,
      role,
      permission: JSON.stringify(AGENT),
    });
  const board = await createProjectFixture({ workspaceId });
  const other = await createProjectFixture({ workspaceId });
  // "In review" stands in for For validation; Done is gated too.
  await db
    .update(schema.columnTable)
    .set({ blockWhileBlocked: true })
    .where(
      inArray(schema.columnTable.id, [
        board.columns.inReview.id,
        board.columns.done.id,
      ]),
    );

  const addTask = async (
    projectId = board.project.id,
    status = "to-do",
    title = "Card",
  ) => {
    taskNumber += 1;
    const [task] = await db
      .insert(schema.taskTable)
      .values({ projectId, title, status, number: taskNumber, position: 0 })
      .returning();
    return task;
  };
  const relate = (
    relationType: string,
    sourceTaskId: string,
    targetTaskId: string,
  ) =>
    db
      .insert(schema.taskRelationTable)
      .values({ relationType, sourceTaskId, targetTaskId });

  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const send = (method: string, path: string, body: unknown) =>
    app.request(`/api${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const setStatus = (taskId: string, status: string, query = "") =>
    send("PUT", `/task/status/${taskId}${query}`, { status });

  return { member, board, other, addTask, relate, send, setStatus };
}

async function statusOf(taskId: string) {
  const [task] = await db
    .select({ status: schema.taskTable.status })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));
  return task?.status;
}

const MOVE_TO_DONE_REFUSED = {
  code: "MISSING_PERMISSION",
  missingPermissions: ["task:move_to_done"],
};

describe("Move to Done permission", () => {
  it("keeps a role without it out of Done, and lets it use a validation column", async () => {
    const { addTask, setStatus } = await setup();
    const card = await addTask();

    const refused = await setStatus(card.id, "done");
    expect(refused.status).toBe(403);
    expect(await readErrorBody(refused)).toMatchObject({
      ...MOVE_TO_DONE_REFUSED,
      message: expect.stringContaining('"Done"'),
    });
    expect(await statusOf(card.id)).toBe("to-do");

    expect((await setStatus(card.id, "in-review")).status).toBe(200);
  });

  it("lets the role into Done once the permission is switched on", async () => {
    const { member, addTask, setStatus } = await setup();
    await db
      .update(schema.workspaceRoleTable)
      .set({
        permission: JSON.stringify({
          ...AGENT,
          task: [...AGENT.task, "move_to_done"],
        }),
      })
      .where(eq(schema.workspaceRoleTable.workspaceId, member.workspace.id));
    const card = await addTask();

    expect((await setStatus(card.id, "done")).status).toBe(200);
  });

  it("is not bypassed by force", async () => {
    const { addTask, setStatus } = await setup();
    const card = await addTask();

    const refused = await setStatus(card.id, "done", "?force=true");
    expect(refused.status).toBe(403);
    expect(await readErrorBody(refused)).toMatchObject(MOVE_TO_DONE_REFUSED);
  });

  it("leaves a full update that resends the current status alone", async () => {
    const { board, addTask, relate, send } = await setup();
    const card = await addTask(board.project.id, "done");
    const blocker = await addTask();
    await relate("blocks", blocker.id, card.id);

    const response = await send("PUT", `/task/${card.id}`, {
      title: "Renamed",
      status: "done",
      projectId: board.project.id,
      priority: "low",
      position: 0,
    });
    expect(response.status).toBe(200);
  });
});

describe("Block while blocked", () => {
  it("turns away a task blocked by an open task on another board", async () => {
    const { other, addTask, relate, setStatus } = await setup("member");
    const card = await addTask();
    const blocker = await addTask(
      other.project.id,
      "to-do",
      "Write the parser",
    );
    await relate("blocks", blocker.id, card.id);

    const refused = await setStatus(card.id, "in-review");

    expect(refused.status).toBe(409);
    const key = `${other.project.slug}-${blocker.number}`;
    expect(await readErrorBody(refused)).toEqual({
      code: "OPEN_BLOCKERS",
      message: `This task is still blocked by ${key} "Write the parser". Finish it first.`,
      overridable: false,
      blockers: [
        { taskId: card.id, id: blocker.id, key, title: "Write the parser" },
      ],
    });
    expect(await statusOf(card.id)).toBe("to-do");
  });

  it("lets the task into a column without the switch", async () => {
    const { addTask, relate, setStatus } = await setup("member");
    const card = await addTask();
    await relate("blocks", (await addTask()).id, card.id);

    expect((await setStatus(card.id, "in-progress")).status).toBe(200);
  });

  it("ignores an open subtask that has no blocks link", async () => {
    const { addTask, relate, setStatus } = await setup("member");
    const card = await addTask();
    await relate("subtask", card.id, (await addTask()).id);

    expect((await setStatus(card.id, "in-review")).status).toBe(200);
  });

  it("lets the task through once its blockers are done on their own board", async () => {
    const { other, addTask, relate, setStatus } = await setup("member");
    const card = await addTask();
    await relate(
      "blocks",
      (await addTask(other.project.id, "done")).id,
      card.id,
    );

    expect((await setStatus(card.id, "in-review")).status).toBe(200);
  });

  it("still counts a blocker on an archived board", async () => {
    const { other, addTask, relate, setStatus } = await setup("member");
    const card = await addTask();
    await relate("blocks", (await addTask(other.project.id)).id, card.id);
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, other.project.id));

    expect((await setStatus(card.id, "in-review")).status).toBe(409);
  });

  it("hides a blocker on a board the caller can't see", async () => {
    const { member, board, other, addTask, relate, setStatus } =
      await setup("member");
    await restrictToProjects(member.workspace.id, member.user.id, [
      board.project.id,
    ]);
    const card = await addTask();
    await relate(
      "blocks",
      (await addTask(other.project.id, "to-do", "Secret plan")).id,
      card.id,
    );

    const refused = await setStatus(card.id, "in-review");

    expect(refused.status).toBe(409);
    const body = await readErrorBody(refused);
    expect(body.message).toBe(
      "This task is still blocked by 1 task you can't see. Finish it first.",
    );
    expect(body.blockers).toEqual([
      { taskId: card.id, id: null, key: null, title: null },
    ]);
  });

  it("lets a role with Override blockers force the move", async () => {
    const { addTask, relate, setStatus } = await setup("admin");
    const card = await addTask();
    await relate("blocks", (await addTask()).id, card.id);

    const refused = await setStatus(card.id, "in-review");
    expect(refused.status).toBe(409);
    expect(await readErrorBody(refused)).toMatchObject({
      overridable: true,
      message: expect.stringContaining("retry with force=true"),
    });

    expect((await setStatus(card.id, "in-review", "?force=true")).status).toBe(
      200,
    );
  });

  it("ignores force from a role without Override blockers", async () => {
    const { addTask, relate, setStatus } = await setup("member");
    const card = await addTask();
    await relate("blocks", (await addTask()).id, card.id);

    const refused = await setStatus(card.id, "in-review", "?force=true");
    expect(refused.status).toBe(409);
    expect(await readErrorBody(refused)).toMatchObject({ overridable: false });
  });
});

describe("Every route that moves or creates tasks", () => {
  it("full update", async () => {
    const { board, addTask, send } = await setup();
    const card = await addTask();

    const response = await send("PUT", `/task/${card.id}`, {
      title: card.title,
      status: "done",
      projectId: board.project.id,
      priority: "low",
      position: 0,
    });
    expect(response.status).toBe(403);
    expect(await statusOf(card.id)).toBe("to-do");
  });

  it("bulk status change, all or nothing", async () => {
    const { addTask, relate, send } = await setup("member");
    const free = await addTask();
    const blocked = await addTask();
    await relate("blocks", (await addTask()).id, blocked.id);

    const response = await send("PATCH", "/task/bulk", {
      taskIds: [free.id, blocked.id],
      operation: "updateStatus",
      value: "in-review",
    });
    expect(response.status).toBe(409);
    expect(await statusOf(free.id)).toBe("to-do");
  });

  it("bulk status change that finishes a blocker with the task it blocks", async () => {
    const { addTask, relate, send } = await setup("member");
    const card = await addTask();
    const blocker = await addTask();
    await relate("blocks", blocker.id, card.id);

    const response = await send("PATCH", "/task/bulk", {
      taskIds: [card.id, blocker.id],
      operation: "updateStatus",
      value: "done",
    });
    expect(response.status).toBe(200);
  });

  it("reorder", async () => {
    const { board, addTask, relate, send } = await setup("member");
    const card = await addTask();
    await relate("blocks", (await addTask()).id, card.id);

    const response = await send("POST", "/task/reorder", {
      projectId: board.project.id,
      tasks: [{ id: card.id, position: 0, status: "in-review" }],
    });
    expect(response.status).toBe(409);
    expect(await statusOf(card.id)).toBe("to-do");
  });

  it("move to another board, judged by its columns", async () => {
    const { other, addTask, send } = await setup();
    const card = await addTask();

    const response = await send("PUT", `/task/move/${card.id}`, {
      destinationProjectId: other.project.id,
      destinationStatus: "done",
    });
    expect(response.status).toBe(403);
    expect(await readErrorBody(response)).toMatchObject(MOVE_TO_DONE_REFUSED);
  });

  it("create", async () => {
    const { board, send } = await setup();
    const create = (status: string) =>
      send("POST", `/task/${board.project.id}`, {
        title: "New",
        description: "",
        priority: "low",
        status,
      });

    expect((await create("done")).status).toBe(403);
    expect((await create("to-do")).status).toBe(200);
  });

  it("duplicate", async () => {
    const { board, addTask, send } = await setup();
    const card = await addTask(board.project.id, "done");

    expect((await send("POST", `/task/duplicate/${card.id}`, {})).status).toBe(
      403,
    );
  });

  it("import, refused before anything is created", async () => {
    const { board, send } = await setup();

    const response = await send("POST", `/task/import/${board.project.id}`, {
      tasks: [
        { title: "Open", status: "to-do" },
        { title: "Finished", status: "done" },
      ],
    });
    expect(response.status).toBe(403);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, board.project.id)),
    ).toHaveLength(0);
  });
});
