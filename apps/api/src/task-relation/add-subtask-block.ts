import type { DbOrTx } from "../project-access/db-or-tx";
import { taskRelationTable } from "../database/schema";
import { findLinkBetween } from "./find-link-between";

/**
 * Records a new subtask as blocking its parent, for boards with "Subtasks
 * block their parent" on. Returns null when a `blocks` link already joins the
 * two tasks in either direction: an existing one is the user's own choice.
 */
export async function addSubtaskBlock(
  tx: DbOrTx,
  parentId: string,
  childId: string,
) {
  if (await findLinkBetween(tx, "blocks", parentId, childId)) return null;

  const [block] = await tx
    .insert(taskRelationTable)
    .values({
      sourceTaskId: childId,
      targetTaskId: parentId,
      relationType: "blocks",
    })
    .returning();
  return block ?? null;
}
