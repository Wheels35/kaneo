import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorIssue = { path: string; message: string };

// An unfinished "blocked by" task. Its fields are null when the caller can't
// see its project.
export type ApiErrorBlocker = {
  taskId: string;
  id: string | null;
  key: string | null;
  title: string | null;
};

export type ApiErrorBody = {
  message: string;
  code: string;
  issues?: ApiErrorIssue[];
  missingPermissions?: string[];
  overridable?: boolean;
  blockers?: ApiErrorBlocker[];
};

export class ApiError extends HTTPException {
  readonly code: string;
  readonly issues?: ApiErrorIssue[];
  readonly missingPermissions?: string[];
  readonly overridable?: boolean;
  readonly blockers?: ApiErrorBlocker[];

  constructor(status: ContentfulStatusCode, body: ApiErrorBody) {
    super(status, { message: body.message });
    this.code = body.code;
    this.issues = body.issues;
    this.missingPermissions = body.missingPermissions;
    this.overridable = body.overridable;
    this.blockers = body.blockers;
  }
}
