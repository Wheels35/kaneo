import { expect } from "vite-plus/test";
import type { ApiErrorBody } from "../../../apps/api/src/errors/api-error";

export type { ApiErrorBody };

export async function readErrorBody(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/json");
  return (await response.json()) as ApiErrorBody;
}
