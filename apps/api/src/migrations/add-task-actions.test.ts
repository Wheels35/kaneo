import { describe, expect, it } from "vite-plus/test";
import { addTaskActions } from "./add-task-actions";

describe("addTaskActions", () => {
  it("adds only the missing actions to a role that edits tasks", () => {
    const stored = JSON.stringify({
      project: ["read"],
      task: ["update", "move_to_done"],
    });

    expect(
      JSON.parse(
        addTaskActions(stored, ["move_to_done", "remove_blockers"]) ?? "null",
      ),
    ).toEqual({
      project: ["read"],
      task: ["update", "move_to_done", "remove_blockers"],
    });
  });

  it("leaves a role that can't edit tasks, or already has them, alone", () => {
    expect(
      addTaskActions(JSON.stringify({ task: ["read"] }), ["remove_blockers"]),
    ).toBeNull();
    expect(
      addTaskActions(JSON.stringify({ task: ["update", "remove_blockers"] }), [
        "remove_blockers",
      ]),
    ).toBeNull();
  });

  it.each(["{", "null", "[]", '"text"', JSON.stringify({ task: "update" })])(
    "skips malformed permission %s",
    (stored) => {
      expect(addTaskActions(stored, ["remove_blockers"])).toBeNull();
    },
  );
});
