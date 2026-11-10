import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { projectTable, taskRelationTable, taskTable } from "../database/schema";
import { projectAccessCondition } from "../project-access/project-access-condition";
import type { TaskReadDatabase } from "./bounded-read";

export type TaskParent = {
  id: string;
  number: number | null;
  title: string;
  projectId: string;
  projectSlug: string;
};

/**
 * Load each task's subtask parent for the entire page. A task with several
 * parents shows the oldest link. Parents on archived boards still count, like
 * the children in getSubtaskCounts.
 */
export async function getTaskParents(
  db: TaskReadDatabase,
  taskIds: string[],
  workspaceId: string,
  userId?: string,
) {
  if (taskIds.length === 0) return new Map<string, TaskParent>();

  const parent = alias(taskTable, "parent");
  const rows = await db
    .selectDistinctOn([taskRelationTable.targetTaskId], {
      childId: taskRelationTable.targetTaskId,
      id: parent.id,
      number: parent.number,
      title: parent.title,
      projectId: parent.projectId,
      projectSlug: projectTable.slug,
    })
    .from(taskRelationTable)
    .innerJoin(parent, eq(taskRelationTable.sourceTaskId, parent.id))
    .innerJoin(projectTable, eq(parent.projectId, projectTable.id))
    .where(
      and(
        inArray(taskRelationTable.targetTaskId, taskIds),
        eq(taskRelationTable.relationType, "subtask"),
        eq(projectTable.workspaceId, workspaceId),
        userId ? projectAccessCondition(userId, projectTable.id) : undefined,
      ),
    )
    .orderBy(
      asc(taskRelationTable.targetTaskId),
      asc(taskRelationTable.createdAt),
      asc(taskRelationTable.id),
    );

  return new Map<string, TaskParent>(
    rows.map(({ childId, ...taskParent }) => [childId, taskParent]),
  );
}
