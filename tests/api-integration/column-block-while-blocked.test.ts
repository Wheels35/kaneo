import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function setup() {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  mockAuthenticatedSession(user);
  const { app } = createApp();
  const send = (method: string, path: string, body?: object) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { project, columns, send };
}

describe("column Block while blocked switch", () => {
  it("is off for existing and new columns unless set", async () => {
    const { project, send } = await setup();

    const created = await send("POST", `/api/column/${project.id}`, {
      name: "Validation",
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ blockWhileBlocked: false });

    const list = await send("GET", `/api/column/${project.id}`);
    const columns = (await list.json()) as { blockWhileBlocked: boolean }[];
    expect(columns.every((column) => !column.blockWhileBlocked)).toBe(true);
  });

  it("can be set on create and switched on update", async () => {
    const { project, columns, send } = await setup();

    const created = await send("POST", `/api/column/${project.id}`, {
      name: "Validation",
      blockWhileBlocked: true,
    });
    expect(await created.json()).toMatchObject({ blockWhileBlocked: true });

    const updated = await send("PUT", `/api/column/${columns.done.id}`, {
      blockWhileBlocked: true,
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      blockWhileBlocked: true,
      isFinal: true,
      name: columns.done.name,
    });

    const reverted = await send("PUT", `/api/column/${columns.done.id}`, {
      blockWhileBlocked: false,
    });
    expect(await reverted.json()).toMatchObject({ blockWhileBlocked: false });
  });
});
