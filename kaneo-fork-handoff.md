# Kaneo fork: handoff

Fork of usekaneo/kaneo (MIT, Bun/TypeScript monorepo: `apps/api`, `apps/web`, Postgres). Source was checked at main `d46edf2` (2026-11-05). Line numbers may drift; re-grep before editing.

## Context

Kaneo is being deployed self-hosted as a dumping ground for ideas first, then as the task layer for an agent hub (replacing markdown worklogs). Agents will use the REST API / MCP with API keys. Stock Kaneo comes first; this fork adds three things.

Board layout in use:
- **Ideas board**: one board; ideas move to Done when they've been turned into a project.
- **Project board** ("Project A"): holds the master phase list as cards.
- **Phase boards** ("Project A: <phase>"): hold that phase's tasks.
- All in ONE workspace. Phase cards (parents) are linked to tasks on other boards via `subtask` relations, set via API because the UI picker only offers tasks from the current board.

Verified on the user's instance: cross-board subtask relations work and the parent card shows `1/1`.

## Wanted changes (in priority order)

### 1. Show the parent on a subtask (small)

**a. Detail page, cross-project fix (~15 min).** `apps/web/src/components/task/task-details-content.tsx` already renders a "Subtask of <KEY> <title>" link from:
```ts
relations.find(r => r.relationType === "subtask" && r.targetTaskId === taskId)?.sourceTask
```
Two bugs when the parent is on a different board:
- The key is built from the CURRENT project's `project.slug`, so it shows the wrong prefix.
- Navigation uses the CURRENT `projectId`, so the route is wrong.

Fix: navigate with `parentTask.projectId`, and build the key from the parent's own project slug. `task-subtasks.tsx` already does this via `useProjectSlugs(workspaceId)` and `displayIdOf(projectId, number)`. Reuse that.

**b. Kanban card and list row (~half a day).** Cards (`apps/web/src/components/kanban-board/task-card/task-card-content.tsx`) and list rows have no parent indicator. Board API tasks carry `subtaskCounts` but no parent info.
- API: in `apps/api/src/task/controllers/get-tasks.ts`, add one batched query modeled on `apps/api/src/task/get-subtask-counts.ts`. Select from `taskRelationTable` where `relationType='subtask'` and `targetTaskId IN (page task ids)`. Join the parent task and its project (id, number, title, project slug). Keep the same workspace and `projectAccessCondition` filters. Return `parent?: { id, number, title, projectId, projectSlug }`.
- Add `parent` to `apps/api/src/task/response.ts` and `apps/web/src/types/task/index.ts`.
- Web: a small line above the title, "↑ ZE-5 Parent title", clickable, shown only when `task.parent` exists. Optionally the same in list-view rows.
- Single level only. Skip the full ancestor chain (not needed for this layout).
- Note: `response.ts` already has a `parentSubtaskCounts` field. I did not read what it does; check it before adding anything that overlaps.

### 2. Done guard: role-based permission to move to Done (medium)

**Rule (user's words):** "I don't want an agent to move a card to done until I verify it, or its child/linked steps."

**Required behavior:**
- A request that violates the rule is REJECTED synchronously with a clear reason, so the caller (agent) sees why. Suggested response: HTTP 409 with a JSON body like `{ "error": "...", "reason": "...", "blockers": [...] }`.
- Callers whose role lacks the new `task:complete` permission cannot move any task into a final column (`isFinal`). That is the user's verification step; agents get a role without it.
- Everyone, including humans: cannot move a parent into a final column while any subtask child is not completed. Optionally the same for unfinished "blocked by" tasks (`blocks` relation where this task is the target and the source is not completed).
- A child counts as completed when it is in a final column of its OWN project (see `apps/api/src/task/task-is-completed.ts`).

**Implementation:** one helper, e.g. `assertStatusAllowed(ctx, task, newStatus)`, called from EVERY path that can write task status. Candidates to find and verify by grep, not trust:
- `update-task-status`
- `update-task` (full update with a status field)
- `bulk-update-tasks` (status branch)
- card reorder / move-cards
- `move-task`
- imports
- integration workflow rules (e.g. GitHub/Gitea automation that sets status)
- the MCP tool handlers at `/api/mcp`, if they call these paths directly rather than going through the same functions

Why not a webhook sidecar: Kaneo's outgoing webhooks fire after the move. A sidecar can only revert it, and the mover is never told why. An earlier sidecar (`kaneo-parent-guard.ts`, untested) exists as a fallback only.

**Why not roles:** Kaneo permissions are `resource:action` (`task:update` etc.). Nothing separates "move to a final column" from `task:update`, so it can't be done with roles alone.

**Decision (from the user): the permission is role-level, like Jira.** Whether a role may move cards into a final column is a role permission that can be switched on or off per role. There is no hard-coded "agent". An agent is just a user (or API-key owner) whose role lacks the permission.

How to build it (verified in source, `d46edf2`):
- `packages/permissions/src/index.ts` defines `statement` (`task: ["create","read","update","delete","assign"]`, etc.) and the built-in roles viewer/member/admin/owner. Add a new action to `task`, e.g. `"complete"` (move into a final column), and grant it to `member`, `admin` and `owner` by default so nothing changes for existing roles.
- Custom roles and the editable default roles are stored as JSON in `workspace_role` rows. Rows seeded before the change won't contain the new action, so the boot-time backfill (see `DEFAULT_ROLE_NAMES` / `defaultRolePayloads`) must add `complete` to existing member/admin rows, or those roles silently lose the ability to finish tasks.
- The roles editor (`apps/web/.../settings/workspace/roles.tsx`) builds its checkbox groups from the resources/actions, so the new action should appear there; it needs an i18n label (`settings:workspaceRoles...`). Confirm this when building.
- Enforcement: in `assertStatusAllowed`, if the target column is final, require `{ task: ["complete"] }` via the existing helpers in `apps/api/src/utils/role-permissions.ts` (`rolesAllow`, `rolesMissingPermissions`). The latter already produces a missing-permission list for the error body. Reuse `requireTaskPermission` / `require-workspace-permission` patterns for how routes currently fetch the caller's roles.
- Not checked: how API keys map to roles/scopes (route docs mention "API key scope"). Confirm that an agent's key is limited by its owner's role and that a key scope can't bypass the new check.
- The parent/children rule (unfinished subtask children, and optionally unfinished blockers) is separate from the role permission. It is a WARNING that can be overridden, not a hard wall (next section).

**Admin override ("force move to Done").** Required by the user: an admin must still be able to force a card to Done even when children are unfinished. It should warn first, but it must be possible.
- Add a second `task` action, e.g. `"force_complete"`, granted by default to `admin` and `owner` only (not `member`). Backfill it into existing admin rows the same way as `complete`.
- Flow: a move into a final column that has unfinished children/blockers returns 409 with the reason and a machine-readable flag (e.g. `{ "code": "OPEN_CHILDREN", "overridable": true, "blockers": [...] }`).
- The caller may retry the same request with an explicit `force: true` (body field or query param on every status-write path). The server allows it only if the caller's role has `task:force_complete`; otherwise the 409 stands.
- The web UI turns the 409 into a confirm dialog listing the open children ("N subtasks aren't done. Move to Done anyway?"). Only show the confirm button if the user has `task:force_complete`; otherwise show the reason only. Check the drag-and-drop and context-menu move paths in `apps/web` (task card context menu, board drag end, bulk actions).
- The role check (`task:complete`) is NOT overridable by `force`. A role without `complete` can never move to Done, so `force` never lets an agent around the user's verification step.
- Record forced moves in the task's activity log if that's cheap (e.g. "moved to Done with N open subtasks").

## Data model facts

- Hierarchy: workspace → projects (`slug` = task-key prefix, `archivedAt`) → columns (`slug`, `isFinal`) → tasks (`status` = column slug).
- `taskRelation.relationType` ∈ `subtask | blocks | related`.
  - For `subtask`: `sourceTaskId` = PARENT, `targetTaskId` = CHILD.
  - For `blocks`: source blocks target. The UI's "Blocked by" is the same relation entered from the other side (`buildRelationLink` in `apps/web/src/components/task/task-relation-link.ts`).
- Relations work across projects within one workspace.
- `GET /task-relation/{taskId}` returns `sourceTask`/`targetTask` with `isCompleted` and `projectId`.
- Useful endpoints: `GET /task/by-ticket-id/{KEY-N}`, `POST /task-relation`, `PUT /task/status/{id}`, `GET /column/{projectId}`, `PUT /project/{id}/archive`.

## Upstream constraints and references

- Issue #1170 (open): nested subtasks on the board. Option A hides children and cascades; option B nests cards. No maintainer response yet; not labeled `ready-for-contribution`. This fork does NOT hide children from the board.
- PR #2085 (draft, unmerged, bot-flagged bugs): ancestor breadcrumbs on cards plus an opt-in cascade prompt. It adds `getTaskAncestors` (batched recursive query, 32 levels) in `apps/api/src/task/get-task-ancestors.ts` and `task-card-breadcrumbs.tsx`. Use as design reference only.
- Kaneo requires outside PRs to link an issue labeled `ready-for-contribution` (since Oct 5, 2026). This is a private fork, so upstreaming is not a goal.

## Out of scope

- Full ancestor chains and nested rendering on the board.
- Cascade moves (parent moves children).
- Changing the relation picker to offer cross-board tasks (optional later; links are made via API today).

## Suggested order

1. Detail-page cross-project fix (1a).
2. Card parent line plus API field (1b).
3. Add the `task:complete` permission, then `assertStatusAllowed` with the role check and the parent/children rule.
4. Test against a real instance. The guard logic has never been run against a live Kaneo.

## Constraints the code must respect

- Archived children still count. `apps/api/src/task/get-subtask-counts.ts` never filters on `archivedAt`, and the guard must behave the same way: an unfinished child on an archived board still blocks its parent. Don't add an `archivedAt` filter to any child lookup.
- The "Subtask of" link on the detail page exists in main as of `d46edf2`. The user's running build may be older, so check before assuming the link is missing.

## Test checklist for the guard

- A user whose role lacks `task:complete` moves any task into a final column: rejected with a 409 and a readable reason. The same user with the permission switched on in the roles editor: allowed.
- Existing member/admin roles still have `task:complete` after upgrading (backfill worked).
- Human with `task:complete` moves a parent with an unfinished child on another board: 409 with the child's key and title in the reason.
- Same move retried with `force: true` by an admin (`task:force_complete`): allowed. By a member without it: still 409.
- A role without `task:complete` sending `force: true`: still rejected.
- Same with the child on an archived board.
- Human moves a parent after all children are done: allowed.
- Every status-write path is covered, including bulk, reorder, MCP, and full-task update with a `status` field.
