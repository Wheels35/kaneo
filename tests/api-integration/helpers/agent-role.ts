import db, { schema } from "../../../apps/api/src/database";

// An agent role as the fork's docs describe it: it edits tasks, but has none
// of Move to Done, Override blockers or Remove blockers.
export const AGENT_PERMISSIONS = {
  project: ["read"],
  task: ["read", "create", "update"],
};

export async function addAgentRole(workspaceId: string) {
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId,
    role: "agent",
    permission: JSON.stringify(AGENT_PERMISSIONS),
  });
}
