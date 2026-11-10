import { expect } from "vite-plus/test";

export type ApiErrorBody = {
  message: string;
  code: string;
  issues?: Array<{ path: string; message: string }>;
  missingPermissions?: string[];
  overridable?: boolean;
  blockers?: Array<{
    taskId: string;
    id: string | null;
    key: string | null;
    title: string | null;
  }>;
};

export async function readErrorBody(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/json");
  return (await response.json()) as ApiErrorBody;
}
