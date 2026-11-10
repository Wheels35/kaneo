import { z } from "@hono/zod-openapi";

export const apiErrorSchema = z
  .object({
    message: z.string().openapi({
      description: "Human-readable description of the error.",
      example: "Task not found",
    }),
    code: z.string().openapi({
      description:
        "Stable UPPER_SNAKE_CASE code. Derived from the status unless a more specific code applies, such as VALIDATION_ERROR, MISSING_PERMISSION or OPEN_BLOCKERS.",
      example: "NOT_FOUND",
    }),
    issues: z
      .array(
        z.object({
          path: z.string().openapi({
            description:
              "Dotted path to the invalid input, prefixed with the request part (body, query, params, header).",
            example: "body.title",
          }),
          message: z.string().openapi({ example: "Required" }),
        }),
      )
      .optional()
      .openapi({
        description: "Every validation issue, for VALIDATION_ERROR.",
      }),
    missingPermissions: z
      .array(z.string())
      .optional()
      .openapi({
        description:
          "Permissions the caller lacks for this route, as resource:action, for MISSING_PERMISSION and API_KEY_SCOPE.",
        example: ["task:update"],
      }),
    overridable: z.boolean().optional().openapi({
      description:
        "For OPEN_BLOCKERS: true when the caller has task:override_blockers and can retry with force=true to move the task anyway.",
    }),
    blockers: z
      .array(
        z.object({
          taskId: z.string().openapi({
            description: "The task that can't move.",
          }),
          id: z.string().nullable().openapi({
            description:
              "The unfinished task it is blocked by. Null, like key and title, when the caller can't see that task's project.",
          }),
          key: z.string().nullable().openapi({ example: "BUILD-3" }),
          title: z.string().nullable().openapi({ example: "Write the parser" }),
        }),
      )
      .optional()
      .openapi({
        description:
          "For OPEN_BLOCKERS: one entry per unfinished blocked-by task of each task that can't move.",
      }),
  })
  .openapi("ApiError");
