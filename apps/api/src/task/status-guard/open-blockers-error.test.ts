import { describe, expect, it } from "vite-plus/test";
import type { OpenBlocker } from "./get-open-blockers";
import { openBlockersError } from "./open-blockers-error";

const blocker = (
  number: number,
  overrides: Partial<OpenBlocker> = {},
): OpenBlocker => ({
  taskId: "card",
  id: `b${number}`,
  key: `BUILD-${number}`,
  title: `Task ${number}`,
  visible: true,
  ...overrides,
});

describe("openBlockersError", () => {
  it("is a 409 that names the blockers and offers force when overridable", () => {
    const error = openBlockersError([blocker(3)], true);

    expect(error.status).toBe(409);
    expect(error.code).toBe("OPEN_BLOCKERS");
    expect(error.overridable).toBe(true);
    expect(error.message).toBe(
      'This task is still blocked by BUILD-3 "Task 3". Finish it first, or retry with force=true to move it anyway.',
    );
    expect(error.blockers).toEqual([
      { taskId: "card", id: "b3", key: "BUILD-3", title: "Task 3" },
    ]);
  });

  it("leaves out the force hint when the caller can't override", () => {
    expect(openBlockersError([blocker(3)], false).message).toBe(
      'This task is still blocked by BUILD-3 "Task 3". Finish it first.',
    );
  });

  it("lists five blockers, then counts the rest", () => {
    const error = openBlockersError(
      [1, 2, 3, 4, 5, 6, 7].map((number) => blocker(number)),
      false,
    );

    expect(error.message).toBe(
      'This task is still blocked by BUILD-1 "Task 1", BUILD-2 "Task 2", BUILD-3 "Task 3", BUILD-4 "Task 4", BUILD-5 "Task 5" and 2 more. Finish them first.',
    );
    expect(error.blockers).toHaveLength(7);
  });

  it("counts a shared blocker once across the tasks it blocks", () => {
    const error = openBlockersError(
      [blocker(3), blocker(3, { taskId: "other" }), blocker(4)],
      true,
    );

    expect(error.message).toBe(
      '2 tasks are still blocked by BUILD-3 "Task 3" and BUILD-4 "Task 4". Finish them first, or retry with force=true to move them anyway.',
    );
    expect(error.blockers).toHaveLength(3);
  });

  it("hides blockers the caller can't see, counting them only", () => {
    const hidden = blocker(9, { visible: false, title: "Secret" });

    expect(openBlockersError([hidden], false).message).toBe(
      "This task is still blocked by 1 task you can't see. Finish it first.",
    );
    const mixed = openBlockersError([hidden, blocker(3)], false);
    expect(mixed.message).toBe(
      'This task is still blocked by BUILD-3 "Task 3" and 1 more. Finish them first.',
    );
    expect(mixed.blockers).toEqual([
      { taskId: "card", id: null, key: null, title: null },
      { taskId: "card", id: "b3", key: "BUILD-3", title: "Task 3" },
    ]);
  });

  it("names a blocker without a number by its title", () => {
    expect(openBlockersError([blocker(3, { key: null })], false).message).toBe(
      'This task is still blocked by "Task 3". Finish it first.',
    );
  });
});
