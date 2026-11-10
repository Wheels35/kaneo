import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { publishEvent } from "../../events";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { refreshChildBoard } from "../refresh-child-board";

async function deleteTaskRelation(
  id: string,
  userId: string,
  workspaceId: string,
  // Asked only when the link is a "blocks" link.
  canRemoveBlockers: () => Promise<boolean> = async () => false,
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

  // Check both endpoints in every statement. Legacy cross-tenant rows must
  // not bypass the same boundary enforced on creation and reads.
  const inWorkspace = and(
    eq(taskRelationTable.id, id),
    inArray(taskRelationTable.sourceTaskId, workspaceTasks),
    inArray(taskRelationTable.targetTaskId, workspaceTasks),
  );
  const notFound = () =>
    new HTTPException(404, { message: "Task relation not found" });

  // A link's type never changes, so checking it before the delete is safe.
  const [existing] = await db
    .select({ relationType: taskRelationTable.relationType })
    .from(taskRelationTable)
    .where(inWorkspace);
  if (!existing) throw notFound();
  if (existing.relationType === "blocks" && !(await canRemoveBlockers()))
    throw new ApiError(403, {
      message:
        "Removing a blocks link needs the Remove blockers permission. Finish the blocking task instead.",
      code: "MISSING_PERMISSION",
      missingPermissions: ["task:remove_blockers"],
    });

  const [relation] = await db
    .delete(taskRelationTable)
    .where(inWorkspace)
    .returning();
  if (!relation) throw notFound();

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
