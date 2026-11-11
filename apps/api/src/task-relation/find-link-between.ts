import { and, eq, or } from "drizzle-orm";
import type { DbOrTx } from "../project-access/db-or-tx";
import { taskRelationTable } from "../database/schema";

// A link of this type between the two tasks, in either direction.
export async function findLinkBetween(
  database: DbOrTx,
  relationType: string,
  taskA: string,
  taskB: string,
) {
  const [link] = await database
    .select({ id: taskRelationTable.id })
    .from(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.relationType, relationType),
        or(
          and(
            eq(taskRelationTable.sourceTaskId, taskA),
            eq(taskRelationTable.targetTaskId, taskB),
          ),
          and(
            eq(taskRelationTable.sourceTaskId, taskB),
            eq(taskRelationTable.targetTaskId, taskA),
          ),
        ),
      ),
    )
    .limit(1);
  return link;
}
