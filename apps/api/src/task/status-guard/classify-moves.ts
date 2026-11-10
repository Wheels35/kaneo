export type TaskPlace = { projectId: string; status: string };

export type StatusMove = {
  // Both absent for a task that is being created.
  taskId?: string;
  from?: TaskPlace;
  to: TaskPlace;
};

export type ColumnFlags = {
  name: string;
  isFinal: boolean;
  blockWhileBlocked: boolean;
};

export type ColumnAt = (place: TaskPlace) => ColumnFlags | undefined;

export function changesColumn({ from, to }: StatusMove) {
  return !from || from.projectId !== to.projectId || from.status !== to.status;
}

/**
 * Sort moves by the rules they trigger. A move is into a final column only
 * when the task isn't already completed, and into a Block while blocked column
 * only when it changes column or project, so resending the current status
 * triggers neither.
 */
export function classifyMoves(moves: StatusMove[], columnAt: ColumnAt) {
  const intoFinal: ColumnFlags[] = [];
  const intoGated: string[] = [];

  for (const move of moves) {
    if (!changesColumn(move)) continue;
    const to = columnAt(move.to);
    if (!to) continue;

    const completed = move.from ? columnAt(move.from)?.isFinal : false;
    if (to.isFinal && !completed) intoFinal.push(to);
    // A task being created has no blockers yet.
    if (to.blockWhileBlocked && move.taskId && move.from)
      intoGated.push(move.taskId);
  }

  return { intoFinal, intoGated };
}
