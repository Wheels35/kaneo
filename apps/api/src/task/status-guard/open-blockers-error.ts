import { ApiError } from "../../errors/api-error";
import type { OpenBlocker } from "./get-open-blockers";

const LISTED = 5;

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

function blockerList(blockers: OpenBlocker[]) {
  const listed = blockers.filter((blocker) => blocker.visible).slice(0, LISTED);
  const names = listed.map(({ key, title }) =>
    key ? `${key} "${title}"` : `"${title}"`,
  );
  const rest = blockers.length - listed.length;
  if (names.length === 0)
    return `${rest} ${plural(rest, "task", "tasks")} you can't see`;
  const last = rest > 0 ? `${rest} more` : names.pop();
  return names.length > 0 ? `${names.join(", ")} and ${last}` : `${last}`;
}

// The message names the blockers because MCP and the CLI show only `message`.
export function openBlockersError(
  blockers: OpenBlocker[],
  overridable: boolean,
) {
  const distinct = [
    ...new Map(blockers.map((blocker) => [blocker.id, blocker])).values(),
  ];
  const blocked = new Set(blockers.map((blocker) => blocker.taskId)).size;
  const subject = blocked === 1 ? "This task is" : `${blocked} tasks are`;
  const finish = `Finish ${plural(distinct.length, "it", "them")} first`;
  const retry = overridable
    ? `, or retry with force=true to move ${plural(blocked, "it", "them")} anyway.`
    : ".";

  return new ApiError(409, {
    message: `${subject} still blocked by ${blockerList(distinct)}. ${finish}${retry}`,
    code: "OPEN_BLOCKERS",
    overridable,
    blockers: blockers.map(({ taskId, id, key, title, visible }) =>
      visible
        ? { taskId, id, key, title }
        : { taskId, id: null, key: null, title: null },
    ),
  });
}
