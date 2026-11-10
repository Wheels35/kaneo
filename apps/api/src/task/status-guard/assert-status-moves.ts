import { ApiError } from "../../errors/api-error";
import type { DbOrTx } from "../../project-access/db-or-tx";
import {
  changesColumn,
  classifyMoves,
  type StatusMove,
} from "./classify-moves";
import { getColumnFlags } from "./get-column-flags";
import { getOpenBlockers } from "./get-open-blockers";
import { openBlockersError } from "./open-blockers-error";
import type { StatusGuard } from "./status-guard";

/**
 * Enforce the column rules on a request's moves. Call it inside the write's
 * transaction, after the write, so tasks moved together see each other's new
 * columns and a rejection rolls everything back.
 *
 * Returns how many open blockers each task was forced past.
 */
export async function assertStatusMoves(
  database: DbOrTx,
  moves: StatusMove[],
  guard: StatusGuard | undefined,
) {
  const forced = new Map<string, number>();
  const changing = moves.filter(changesColumn);
  if (!guard || changing.length === 0) return forced;

  const columnAt = await getColumnFlags(
    database,
    changing.flatMap((move) => (move.from ? [move.from, move.to] : [move.to])),
  );
  const { intoFinal, intoGated } = classifyMoves(changing, columnAt);

  const [finalColumn] = intoFinal;
  if (finalColumn && !(await guard.can(database, { task: ["move_to_done"] }))) {
    throw new ApiError(403, {
      message: `Moving a task to "${finalColumn.name}" needs the Move to Done permission. Move it to a validation column instead.`,
      code: "MISSING_PERMISSION",
      missingPermissions: ["task:move_to_done"],
    });
  }

  const blockers = await getOpenBlockers(
    database,
    intoGated,
    guard.workspaceId,
    guard.userId,
  );
  if (blockers.length === 0) return forced;

  const overridable = await guard.can(database, {
    task: ["override_blockers"],
  });
  if (!guard.force || !overridable)
    throw openBlockersError(blockers, overridable);

  for (const { taskId } of blockers)
    forced.set(taskId, (forced.get(taskId) ?? 0) + 1);
  return forced;
}
