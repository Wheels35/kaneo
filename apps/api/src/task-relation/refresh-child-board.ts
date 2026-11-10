import { publishEvent } from "../events";

/**
 * Relation events reach the parent's board only. A subtask link across boards
 * also changes the parent line on the child's board, so refresh that one too.
 */
export async function refreshChildBoard(
  relationType: string,
  sourceProjectId: string,
  targetProjectId: string | undefined,
) {
  if (
    relationType !== "subtask" ||
    !targetProjectId ||
    targetProjectId === sourceProjectId
  )
    return;
  await publishEvent("subtask-parents.refresh", {
    projects: [{ projectId: targetProjectId }],
  });
}
