import { z } from "../openapi";

const blockWhileBlocked = z.boolean().optional().openapi({
  description:
    "When on, a task cannot move into this column while a task blocking it is unfinished. A caller with task:override_blockers can send force=true to move it anyway.",
});

export const projectIdParam = z.object({ projectId: z.string() });

export const columnParam = z.object({ id: z.string() });

export const createColumnBody = z.object({
  name: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  isFinal: z.boolean().optional(),
  blockWhileBlocked,
});

export const updateColumnBody = z.object({
  name: z.string().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isFinal: z.boolean().optional(),
  blockWhileBlocked,
});

export const reorderColumnsBody = z.object({
  columns: z.array(z.object({ id: z.string(), position: z.number() })).openapi({
    description:
      "Every column keeps its new position. Columns from another project are rejected.",
  }),
});
