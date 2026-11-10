import { and, eq, or } from "drizzle-orm";
import type db from "../database";
import { taskRelationTable } from "../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Records a new subtask as blocking its parent, for boards with "Subtasks
 * block their parent" on. Returns null when a `blocks` link already joins the
 * two tasks in either direction: an existing one is the user's own choice.
 */
export async function addSubtaskBlock(
  tx: Transaction,
  parentId: string,
  childId: string,
) {
  const [existing] = await tx
    .select({ id: taskRelationTable.id })
    .from(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.relationType, "blocks"),
        or(
          and(
            eq(taskRelationTable.sourceTaskId, childId),
            eq(taskRelationTable.targetTaskId, parentId),
          ),
          and(
            eq(taskRelationTable.sourceTaskId, parentId),
            eq(taskRelationTable.targetTaskId, childId),
          ),
        ),
      ),
    )
    .limit(1);
  if (existing) return null;

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
