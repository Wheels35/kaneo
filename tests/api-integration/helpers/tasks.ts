import db, { schema } from "../../../apps/api/src/database";

// A bare task row, for tests that only need it to exist in a column. It has
// no number unless given one, so several fit on one board.
export async function addTask(
  projectId: string,
  values: { title?: string; status?: string; number?: number | null } = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: "Task",
      status: "to-do",
      number: null,
      ...values,
    })
    .returning();
  return task;
}

export async function relate(
  relationType: "subtask" | "blocks" | "related",
  sourceTaskId: string,
  targetTaskId: string,
  createdAt?: Date,
) {
  const [relation] = await db
    .insert(schema.taskRelationTable)
    .values({
      relationType,
      sourceTaskId,
      targetTaskId,
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();
  return relation;
}
