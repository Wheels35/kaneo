import { and, asc, eq, inArray, not } from "drizzle-orm";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import type { DbOrTx } from "../../project-access/db-or-tx";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { taskIsCompleted } from "../task-is-completed";

export type OpenBlocker = {
  // The task that can't move.
  taskId: string;
  id: string;
  key: string | null;
  title: string;
  // Whether the caller can see the blocker's project.
  visible: boolean;
};

/**
 * Load the unfinished "blocked by" tasks of every task in one query. Each
 * blocker's completion follows its own board's workflow. Blockers on archived
 * boards and in projects the caller can't see still count.
 */
export async function getOpenBlockers(
  database: DbOrTx,
  taskIds: string[],
  workspaceId: string,
  userId: string,
): Promise<OpenBlocker[]> {
  if (taskIds.length === 0) return [];

  const rows = await database
    .select({
      taskId: taskRelationTable.targetTaskId,
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      projectSlug: projectTable.slug,
      visible: projectAccessCondition(userId, projectTable.id),
    })
    .from(taskRelationTable)
    .innerJoin(taskTable, eq(taskRelationTable.sourceTaskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(taskRelationTable.targetTaskId, taskIds),
        eq(taskRelationTable.relationType, "blocks"),
        eq(projectTable.workspaceId, workspaceId),
        not(taskIsCompleted),
      ),
    )
    .orderBy(
      asc(taskRelationTable.targetTaskId),
      asc(taskRelationTable.createdAt),
      asc(taskRelationTable.id),
    );

  return rows.map(({ number, projectSlug, ...blocker }) => ({
    ...blocker,
    key: number === null ? null : `${projectSlug}-${number}`,
  }));
}
