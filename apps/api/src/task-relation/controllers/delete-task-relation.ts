import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { refreshChildBoard } from "../refresh-child-board";

async function deleteTaskRelation(
  id: string,
  userId: string,
  workspaceId: string,
) {
  const workspaceTasks = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        projectAccessCondition(userId, taskTable.projectId),
      ),
    );

  // Check both endpoints in the delete statement itself. Legacy cross-tenant
  // rows must not bypass the same boundary enforced on creation and reads.
  const [relation] = await db
    .delete(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.id, id),
        inArray(taskRelationTable.sourceTaskId, workspaceTasks),
        inArray(taskRelationTable.targetTaskId, workspaceTasks),
      ),
    )
    .returning();

  if (!relation) {
    throw new HTTPException(404, {
      message: "Task relation not found",
    });
  }

  const tasks = await db
    .select({ id: taskTable.id, projectId: taskTable.projectId })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(taskTable.id, [relation.sourceTaskId, relation.targetTaskId]),
        eq(projectTable.workspaceId, workspaceId),
      ),
    );
  const projectOf = (taskId: string) =>
    tasks.find((task) => task.id === taskId)?.projectId;
  const sourceProjectId = projectOf(relation.sourceTaskId);

  if (sourceProjectId) {
    await publishEvent("task-relation.deleted", {
      ...relation,
      taskId: relation.sourceTaskId,
      projectId: sourceProjectId,
      userId,
    });
    await refreshChildBoard(
      relation.relationType,
      sourceProjectId,
      projectOf(relation.targetTaskId),
    );
  }

  return relation;
}

export default deleteTaskRelation;
