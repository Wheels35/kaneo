# Kaneo fork: parent display + Done/validation guard

## Context

Private fork (`Wheels35/kaneo`), used as an ideas dump and as the task layer for an agent hub. Boards: Ideas, a Project board of phase cards, and per-phase boards. Phase cards link to tasks on other boards through cross-project `subtask` relations. Source brief: `kaneo-fork-handoff.md`.

Problems:
1. A subtask doesn't show its parent correctly. The detail page builds the wrong key and link when the parent is on another board, and cards/list rows show no parent at all.
2. Nothing stops an agent from moving a card to Done before the user validates it. Nothing stops a card with unfinished subtasks from entering "For validation" or Done.

### Decisions (from the user)
- **Rule 1, role permission "Move to Done"** (`task:move_to_done`). A role without it can never move a task into a final (`isFinal`) column. Agents go to "For validation" instead. Not overridable.
- **Rule 2, column switch "Block open subtasks"** (`column.blockOpenSubtasks`). A task can't enter a column with the switch on while it has unfinished subtask children or unfinished "blocked by" tasks. **Off everywhere by default**; the user turns it on per column (e.g. For validation, Done).
- **Rule 2 override, role permission "Override open subtasks"** (`task:override_open_subtasks`, admin and owner by default). The server rejects with a warning listing the open items; a role with the permission can retry with `force=true`. The web UI turns this into a confirm dialog.
- Agents log in as **their own Kaneo user** with an agent role; API keys are created as that user.
- **Git automation is untouched**: GitHub/Gitea/GitLab webhooks, issue importers, sync resume and workspace import keep moving cards as today.
- **Web only** for the dialog; mobile untouched. Parent line on **cards and list rows**.
- **One branch** (`feature/prevent-transitions`), one commit per step below, commits only when asked.

Corrections to the handoff: the repo uses pnpm + Vite+ (`vp`), not Bun. The i18n source is root `i18n/en-US.json`. `parentSubtaskCounts` is unrelated: it carries parent progress counters for live updates. The AGENTS.md "external contributor" file rule doesn't apply: this is your own fork and upstreaming isn't a goal.

---

## Step 1: Detail page cross-project parent fix (1a)

The bug is in `apps/web/src/components/task/task-details-content.tsx:43-74`: the key uses the current `project.slug` and the link uses the current `projectId`.

- [ ] Add `apps/web/src/components/task/use-open-task.ts`, a `useOpenTask(workspaceId, currentProjectId)` hook. For a same-project task it calls `navigate({ to: ".", search: { taskId } })`. For another project it opens the full route `/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId` with the task's own `projectId`. The logic is lifted from `SubtasksChip.openTask` (`apps/web/src/components/task-chips/subtasks-chip.tsx:33-47`).
- [ ] `task-details-content.tsx`:
  - Use `findParentRelation` (`apps/web/src/components/task/task-relation-link.ts`).
  - Build the key with `useProjectSlugs(workspaceId)` (`apps/web/src/components/task/sections/use-project-slugs.ts`) as `displayIdOf(parentTask.projectId, parentTask.number)`. Hide the key when it is `null` (archived parent project).
  - Navigate with `useOpenTask`.
- [ ] Use `useOpenTask` in `subtasks-chip.tsx` and `task-relations.tsx:231-236`, which has the same wrong-`projectId` bug for blocks/related links.

## Step 2: Parent line on cards and list rows (1b)

**API**
- [ ] Add `apps/api/src/task/get-task-parents.ts`, modeled on `get-subtask-counts.ts` with the join reversed:
  - Filter `targetTaskId IN (taskIds)` and `relationType = 'subtask'`. Join the parent task and its project.
  - Keep the same `workspaceId` and `projectAccessCondition(userId, …)` filters. No `archivedAt` filter.
  - Return `Map<childId, { id, number, title, projectId, projectSlug }>`. When a task has several parents, use the oldest relation.
- [ ] `apps/api/src/task/controllers/get-tasks.ts`: call it next to `getSubtaskCounts` (~212) and set `parent: parents.get(task.id) ?? null` in the three mappers (~436/446/455). Skip it on public boards (`publicOnly`): no private parent can leak, and the public revision hash stays untouched.
- [ ] `apps/api/src/task/controllers/get-task.ts` (`view=board`): include `parent`, so live single-task refreshes keep it current.
- [ ] `apps/api/src/task/response.ts`: add a nullable optional `parent` to `boardTaskSchema` and `taskWithAssigneeSchema`.
- [ ] Live refresh of the child's board. `create-task-relation.ts:134` and `delete-task-relation.ts:60` publish only to the parent's project. For a cross-project `subtask` relation, also `publishEvent("subtask-parents.refresh", { projects: [{ projectId: childProjectId }] })`. That event reuses `refreshParentBoards` (`apps/api/src/ws/index.ts:958`). A renamed parent stays stale on child boards until their next refetch; this is accepted.

**Web**
- [ ] `apps/web/src/types/task/index.ts`: add `parent?: { id; number; title; projectId; projectSlug } | null`.
- [ ] Add `apps/web/src/components/task-chips/parent-task-link.tsx`:
  - Renders `↑ KEY-5 Parent title` as a truncated `<button>` with `stopCardEvents` (`task-chips/stop-card-events`) and `useOpenTask`.
  - Renders nothing without `task.parent`.
  - The aria-label comes from a new i18n key `tasks:parent.open`.
- [ ] Kanban: render it above the title in `apps/web/src/components/kanban-board/task-card/task-card-content.tsx` (~186).
- [ ] List: render it in `apps/web/src/components/list-view/task-row-body.tsx` near the title, only when the row isn't already nested under its parent (`depth === 0`). Backlog rows reuse `TaskRowBody`.
- [ ] Confirm that the `BoardTask` Effect schema in `packages/cli/src/api/schemas.ts` ignores unknown keys. Mobile and MCP pass the field through.

## Step 3: New permissions + backfill

- [ ] `packages/permissions/src/index.ts`:
  - `task` gains `"move_to_done"` and `"override_open_subtasks"`.
  - `member` gets `move_to_done`; `admin` and `owner` get both.
  - Update `index.test.ts`, which asserts the exact `task` array.
- [ ] Add a one-time data migration, `apps/api/src/migrations/task-done-permissions-migration.ts`, modeled on `column-migration.ts`. It uses `pg_advisory_xact_lock` plus the `dataMigrationTable` marker `task-done-permissions-v1`.
  - For every `workspace_role` row, default and custom: if `task` includes `update`, add `move_to_done`.
  - If the row's role is `admin`, also add `override_open_subtasks`.
  - Update rows in place. Never insert: duplicate rows OR together in `rolesAllow`.
  - Call it at boot in `apps/api/src/index.ts`, next to `seedDefaultWorkspaceRoles` (~1052).
  - Why it's needed: the seed only inserts missing rows, and a stored row fully replaces the built-in role (`role-permissions.ts:59-67`). Owner is static, so it picks the change up from the package.
  - Result: nobody loses anything on upgrade. You then create the agent role with both switches off.
- [ ] Roles editor (`apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/roles.tsx`): the switches appear automatically from `statement`. Add entries to `PERMISSION_LABELS`, and add the i18n keys `settings.workspaceRoles.permissions.task.{move_to_done,override_open_subtasks}.{label,description}` in `i18n/en-US.json`. Then run `pnpm i18n:schema` and `pnpm i18n:check:fix` to fill the other 21 locales.
- Not changed: scoped API keys. The UI only creates unscoped keys, and agents use their own user. Instance admins bypass role checks (`hasWorkspacePermission`), so an agent user must never be an instance admin.

## Step 4: "Block open subtasks" column setting

- [ ] Schema: `columnTable.blockOpenSubtasks`, `boolean("block_open_subtasks").default(false).notNull()` (`apps/api/src/database/schema.ts:600`). Run `pnpm --filter @kaneo/api db:generate` and inspect the SQL. Default false means no data migration.
- [ ] API: add `blockOpenSubtasks` to `apps/api/src/column/schema.ts` (create + update bodies), `column/response.ts` (with an OpenAPI description), `column/index.ts` (pass-through), `controllers/create-column.ts` and `controllers/update-column.ts`. The existing `project.updated` publish refreshes boards.
- [ ] Web column editor:
  - Add a second `Switch` in `apps/web/src/components/project/columns/column-row.tsx`, next to the Done switch, with a header label in `column-list.tsx`.
  - Update the `ProjectColumn` type, the `fetchers/column/{create,update}-column.ts` fetchers, and `use-update-column.ts`.
  - Add i18n keys under `settings:columnEditor`.

## Step 5: Server guard on every user status-write path

New folder `apps/api/src/task/status-guard/`, one concern per file, with tests beside them:
- `status-guard.ts`: `statusGuard(c)` returns `{ force, can(perms) }`. `can` lazily memoizes `workspacePermissionChecker(c)` (`apps/api/src/utils/require-workspace-permission.ts:95`), so roles are looked up at most once per request, and only when a move hits a guarded column. That keeps reorders within a column free.
- `classify-moves.ts` (pure): for each move, compare before and after. A move is "into final" when the destination column is `isFinal` and the task isn't currently completed. It is "into gated" when the destination has `blockOpenSubtasks` and the task is changing column or project. A full `PUT` that resends the same status never fires.
- `get-open-blockers.ts`: one batched query for all moving tasks.
  - It returns unfinished subtask children (`source = task`) and unfinished "blocked by" tasks (`relationType = 'blocks'`, `target = task`).
  - Completion uses `taskIsCompleted` (`apps/api/src/task/task-is-completed.ts`) in each task's own project. Workspace filter, no `archivedAt` filter.
  - It selects `projectAccessCondition(userId, …)` as a `visible` flag. Hidden items still block, but their key and title are redacted.
- `open-subtasks-error.ts` (pure): builds the 409.
- `assert-status-moves.ts`: `assertStatusMoves(tx, moves[], guard)`.
  1. **Rule 1:** any into-final move without `can({ task: ["move_to_done"] })` gets a **403** `MISSING_PERMISSION` with `missingPermissions: ["task:move_to_done"]` and a readable message ("…needs the Move to Done permission; move it to a validation column instead"). This is 403 rather than the handoff's 409 because Kaneo already uses 403 for permission failures, and the web and CLI already parse it. `force` never bypasses it.
  2. **Rule 2:** for into-gated moves, load blockers. If there are none, allow. If the request has `force` and `can({ task: ["override_open_subtasks"] })`, allow and return the forced counts. Otherwise return **409** `OPEN_SUBTASKS` with `overridable` and `blockers: [{ taskId, id, key, title, relation: "subtask" | "blocked_by" }]`. The `message` lists keys and titles (at most 5, then "and N more"), because MCP and the CLI only show `message`.

Error contract:
- [ ] Extend `ApiErrorBody` and `ApiError` (`apps/api/src/errors/api-error.ts`), the `errorBody` in `http-exception-response.ts`, and `api-error-schema.ts` with optional `overridable` and `blockers`.

Call sites. Each runs inside its transaction against the locked before-row, and each handler builds `statusGuard(c)` and passes it in. Shared `forceQuery` (`force: "true" | "false"` optional) on the moving routes in `apps/api/src/task/index.ts`:
- [ ] `PUT /task/status/{id}`: `controllers/update-task-status.ts`, inside `withLockedTask` after `assertValidTaskStatus`.
- [ ] `PUT /task/{id}`: `controllers/update-task.ts`, against the locked row read (~91-107).
- [ ] `PATCH /task/bulk`: `controllers/bulk-update-tasks.ts`, `updateStatus` and move-to-board branches. All or nothing; blockers grouped by `taskId`.
- [ ] `POST /task/reorder`: `controllers/reorder-tasks.ts`, only rows whose `status` changes.
- [ ] `PUT /task/move/{id}`: `controllers/move-task.ts`. Finality and gating are judged against the **destination** project's columns.
- [ ] Rule 1 only (new tasks have no children): `POST /task/{projectId}` (`create-task.ts`), `POST /task/duplicate/{id}` (`duplicate-task.ts`), `POST /task/import/{projectId}` (`import-tasks.ts`). The recurrence path (`recurrence/create-next-occurrence.ts`) is a system path, never targets a final column, and passes no guard.
- [ ] Update route descriptions, run `pnpm openapi:check:fix`, and commit `apps/docs/openapi.json`.
- MCP is covered automatically: both MCP servers call these REST routes over HTTP (`apps/api/src/mcp/tools.ts`, `packages/mcp/src/kaneo/client.ts`). No `force` parameter is added to the MCP tools.

## Step 6: Web dialog and force retry

- [ ] `apps/web/src/lib/parse-api-error-body.ts` and `lib/http-error.ts`: carry `overridable` and `blockers`. Add `lib/is-open-subtasks-error.ts`, modeled on `is-workspace-archived-error.ts`.
- [ ] Add `apps/web/src/components/open-subtasks/`:
  - `open-subtasks-store.ts` (zustand): holds `{ error, retry }`.
  - `open-subtasks-dialog.tsx`: built on `ConfirmDialog` (`components/settings/confirm-dialog.tsx`). It lists the blockers ("2 subtasks aren't done"). It shows "Move anyway" only when `overridable`; otherwise it shows the reason with a Close button. It is mounted once in the authenticated layout.
  - `handle-status-move-error.ts`: shows the dialog for `OPEN_SUBTASKS`; otherwise shows a toast with the server message.
- [ ] Fetchers take `force?: boolean` and send it as the query `force=true`: `fetchers/task/{update-task-status,update-task,reorder-tasks,move-task,bulk-operation}.ts`.
- [ ] Wire every status path to the handler:
  - Board drag and keyboard move (`kanban-board/index.tsx` `commitMove`: roll back, then show the dialog; confirming re-runs with force).
  - Context menu (`task-card-context-menu-content.tsx`).
  - Detail status (`task-status-popover.tsx`).
  - Subtask checkbox (`use-toggle-task-completion.ts`).
  - Subtask group status (`subtask-status-popover.tsx`).
  - Move to project (`use-move-task.ts`).
  - Bulk (`use-bulk-operations.ts` `run()`).
  - List view drag (`list-view/index.tsx` `moveTask`). This path has no `onError` today; add a rollback as well.
- [ ] Add i18n keys for the dialog under `tasks:openSubtasks.*`.

## Step 7: Activity note and docs

- [ ] Forced moves: pass `forcedOpenSubtasks: N` through the `task.status_changed` payload (`task-mutation-effects.ts:72-82`) into `eventData` (`apps/api/src/activity/index.ts:288`). Render "moved to Done with N open subtasks" in `apps/web/src/components/activity/index.tsx`.
- [ ] Docs:
  - `apps/docs/core/functional/collaborate-with-team.mdx`: add the two permissions to the role table and a short "agent role" setup section (custom role, both switches off, no `project:update`, own user and key).
  - `apps/docs/api-reference/errors.mdx`: document `OPEN_SUBTASKS`, `overridable`, `blockers` and `force`.

### Accepted gaps (documented, not built)
- Integrations, webhooks, issue importers, sync resume and workspace import bypass both rules.
- Turning on `isFinal` or `blockOpenSubtasks` for a column doesn't re-check cards already in it. Linking a new subtask to a card already in a gated column isn't blocked. Changing columns needs `project:update`, which the agent role shouldn't have.
- Mobile shows its generic error. No `force` parameter in MCP or the CLI.

---

## Verification

**Automated** (report what ran):
- Unit tests:
  - `classify-moves.test.ts` and `open-subtasks-error.test.ts`
  - permissions `index.test.ts`
  - `parse-api-error-body` test
  - the open-subtasks dialog test
  - the parent line in `task-card.test.tsx` and `task-row.test.tsx`
- Integration tests (real Postgres `_test` database, `pnpm test:integration`):
  - `tests/api-integration/task-parent.test.ts`. Pattern: `subtask-counts.test.ts`. Covers a cross-project parent, a parent hidden by project access, cross-workspace isolation, and a parent on an archived board.
  - `tests/api-integration/task-done-permissions-migration.test.ts`. Pattern: `column-migration-once.test.ts`. Existing member, admin and custom rows gain the actions, it runs only once, and an action removed after the migration stays removed.
  - `tests/api-integration/task-status-guard.test.ts`, over HTTP with role rows. Pattern: `workspace-rbac.test.ts` plus the `relate` helper.
    - Agent role → Done: 403. Agent → For validation: 200.
    - Same role with the permission switched on: 200.
    - Gated column with an open child on another board: 409 with the child's key and title.
    - Admin `force=true`: 200. Member `force=true`: 409 with `overridable: false`. Agent `force=true` → Done: 403.
    - Child on an archived board still blocks. An open "blocked by" blocks. All children done: 200. Ungated column with open children: 200.
    - A child the caller can't see is redacted.
    - A full `PUT` that resends the same status doesn't trigger.
    - Each path is covered: status, full update, bulk, reorder, move, create, duplicate, import.
  - `tests/api/mcp-tools.test.ts`: a 409's `message` reaches the tool result.
- Checks:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm openapi:check`
  - `pnpm i18n:check`
  - `pnpm build:dependencies` (rebuilds `@kaneo/permissions` before the API and web typecheck)

**Manual** (`pnpm dev`, browser):
- Parent line on a phase-board card links to the Project board card. The detail page key and link are correct.
- Drag a parent into a gated column: the dialog appears, "Move anyway" works as admin, and an activity entry is written.
- Then, on a real instance:
  1. Create an Agent role with both switches off.
  2. Create an agent user with that role and give it an API key.
  3. `curl -X PUT /api/task/status/{id}` with the agent key: 403 into Done, 200 into For validation, 409 when the card has open subtasks.
