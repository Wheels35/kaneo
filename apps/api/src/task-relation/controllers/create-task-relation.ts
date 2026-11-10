import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { assertProjectAccess } from "../../project-access/assert-project-access";
import { addSubtaskBlock } from "../add-subtask-block";
import { refreshChildBoard } from "../refresh-child-board";

async function createTaskRelation({
  sourceTaskId,
  targetTaskId,
  relationType,
  userId,
  workspaceId,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
  userId: string;
  workspaceId: string;
}) {
  if (sourceTaskId === targetTaskId) {
    throw new HTTPException(400, {
      message: "Cannot create a relation between a task and itself",
    });
  }

  const created = await db.transaction(async (tx) => {
    // Serialize relation creation with project moves before validating either
    // workspace. A move must see this relation or this request must see the move.
    await tx
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(
        inArray(
          projectTable.id,
          tx
            .select({ projectId: taskTable.projectId })
            .from(taskTable)
            .where(inArray(taskTable.id, [sourceTaskId, targetTaskId])),
        ),
      )
      .orderBy(projectTable.id)
      .for("share");
    const [sourceTask] = await tx
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        workspaceId: projectTable.workspaceId,
        subtasksBlockParent: projectTable.subtasksBlockParent,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        and(
          eq(taskTable.id, sourceTaskId),
          eq(projectTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!sourceTask) {
      throw new HTTPException(404, { message: "Source task not found" });
    }

    const [targetTask] = await tx
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        workspaceId: projectTable.workspaceId,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        and(
          eq(taskTable.id, targetTaskId),
          eq(projectTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!targetTask) {
      throw new HTTPException(404, { message: "Target task not found" });
    }

    await assertProjectAccess(userId, targetTask.projectId);

    const existing = await tx
      .select({ id: taskRelationTable.id })
      .from(taskRelationTable)
      .where(
        and(
          eq(taskRelationTable.relationType, relationType),
          or(
            and(
              eq(taskRelationTable.sourceTaskId, sourceTaskId),
              eq(taskRelationTable.targetTaskId, targetTaskId),
            ),
            and(
              eq(taskRelationTable.sourceTaskId, targetTaskId),
              eq(taskRelationTable.targetTaskId, sourceTaskId),
            ),
          ),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new HTTPException(409, {
        message: "This relation already exists",
      });
    }

    const [relation] = await tx
      .insert(taskRelationTable)
      .values({
        sourceTaskId,
        targetTaskId,
        relationType,
      })
      .returning();

    if (!relation) {
      throw new HTTPException(500, {
        message: "Failed to create task relation",
      });
    }

    const block =
      relationType === "subtask" && sourceTask.subtasksBlockParent
        ? await addSubtaskBlock(tx, sourceTaskId, targetTaskId)
        : null;

    return { relation, block, sourceTask, targetTask };
  });
  const { relation, block, sourceTask, targetTask } = created;

  await publishEvent("task-relation.created", {
    ...relation,
    taskId: sourceTaskId,
    projectId: sourceTask.projectId,
    userId,
  });
  await refreshChildBoard(
    relationType,
    sourceTask.projectId,
    targetTask.projectId,
  );
  if (block)
    await publishEvent("task-relation.created", {
      ...block,
      taskId: block.sourceTaskId,
      projectId: targetTask.projectId,
      userId,
    });

  return relation;
}

export default createTaskRelation;
