import { z } from "../openapi";

export const projectParam = z.object({ id: z.string() });

export const workspaceIdQuery = z.object({ workspaceId: z.string() });

export const listProjectsQuery = z.object({
  workspaceId: z.string(),
  includeArchived: z.string().optional().openapi({
    description: 'Pass "true" to include archived projects in the list.',
  }),
});

export const createProjectBody = z.object({
  name: z.string(),
  workspaceId: z.string(),
  icon: z.string(),
  slug: z.string(),
});

export const updateProjectBody = z.object({
  name: z.string(),
  icon: z.string(),
  slug: z.string(),
  description: z.string(),
  isPublic: z.boolean(),
  subtasksBlockParent: z.boolean().optional().openapi({
    description:
      "When true, linking a subtask to a task on this board also links the subtask as blocking that task, so it cannot enter a Block while blocked column until the subtask is done. Affects only links made while it is on. Omit to keep the current value.",
  }),
});

export const reorderProjectsBody = z.object({
  // Positions express a relative order only; the controller renumbers the
  // workspace to 0..n-1, so the values just have to be sane.
  projects: z
    .array(z.object({ id: z.string(), position: z.number().int().min(0) }))
    .min(1),
});

export const uploadProjectBackgroundBody = z.object({
  contentType: z.string(),
  size: z.number(),
});

export const finalizeProjectBackgroundBody = z.object({
  key: z.string(),
  contentType: z.string(),
  version: z.string(),
  size: z.number(),
});
export const moveProjectBody = z.object({ workspaceId: z.string().min(1) });
