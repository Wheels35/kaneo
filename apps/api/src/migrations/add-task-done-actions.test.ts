import { describe, expect, it } from "vite-plus/test";
import { addTaskDoneActions } from "./add-task-done-actions";

const parse = (value: string | null) =>
  value === null ? null : JSON.parse(value);

describe("addTaskDoneActions", () => {
  it("lets any role that edits tasks move them to Done", () => {
    const stored = JSON.stringify({
      project: ["read"],
      task: ["create", "read", "update"],
    });

    expect(parse(addTaskDoneActions("agent", stored))).toEqual({
      project: ["read"],
      task: ["create", "read", "update", "move_to_done"],
    });
  });

  it.each(["admin", "owner"])("also gives %s the blocker override", (role) => {
    const stored = JSON.stringify({ task: ["read", "update", "delete"] });

    expect(parse(addTaskDoneActions(role, stored))?.task).toEqual([
      "read",
      "update",
      "delete",
      "move_to_done",
      "override_blockers",
    ]);
  });
});
