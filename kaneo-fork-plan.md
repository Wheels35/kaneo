# Kaneo fork: parent display + Done/validation guard

Task checklist: [kaneo-fork-tasks.md](./kaneo-fork-tasks.md).

## Context

Private fork (`Wheels35/kaneo`), used as an ideas dump and as the task layer for an agent hub. Boards: Ideas, a Project board of phase cards, and per-phase boards. Phase cards link to tasks on other boards through cross-project `subtask` relations. Source brief: `kaneo-fork-handoff.md`.

Problems:
1. A subtask doesn't show its parent correctly. The detail page builds the wrong key and link when the parent is on another board, and cards/list rows show no parent at all.
2. Nothing stops an agent from moving a card to Done before the user validates it. Nothing stops a card with unfinished blockers from entering "For validation" or Done.

### Decisions (from the user)
- **Rule 1, role permission "Move to Done"** (`task:move_to_done`). A role without it can never move a task into a final (`isFinal`) column. Agents go to "For validation" instead. Not overridable.
- **Rule 2, column switch "Block while blocked"** (`column.blockWhileBlocked`). A task can't enter a column with the switch on while it has unfinished "blocked by" tasks. **Off everywhere by default**; the user turns it on per column (e.g. For validation, Done). Subtasks don't block by themselves (2026-11-09: "this just allows us to separate subtasks from blocking"). The user approved this and the renames below with "yep perfect"; the names themselves are Claude's.
- **Rule 2 override, role permission "Override blockers"** (`task:override_blockers`, admin and owner by default). The server rejects with a warning listing the open blockers; a role with the permission can retry with `force=true`. The web UI turns this into a confirm dialog.
- **Project setting "Subtasks block their parent"** (2026-11-09; the name is Claude's). When it is on for the parent's board ("always the parents board"), linking a subtask also creates a `blocks` link from the child to the parent ("a parent being blocked by its children"). Only links made after it is turned on ("only new").
- **Unlinking a subtask keeps its `blocks` link.** The web UI then shows a notice offering "Remove block". Chosen 2026-11-09 ("B works for me") over removing it with an undo.
- Agents log in as **their own Kaneo user** with an agent role; API keys are created as that user.
- **Git automation is untouched**: GitHub/Gitea/GitLab webhooks, issue importers, sync resume and workspace import keep moving cards as today.
- **Web only** for the dialog and the unlink notice; mobile untouched. Parent line on **cards and list rows**.
- **One branch** (`feature/prevent-transitions`), one commit per step below, commits only when asked.

Corrections to the handoff: the repo uses pnpm + Vite+ (`vp`), not Bun. The i18n source is root `i18n/en-US.json`. `parentSubtaskCounts` is unrelated: it carries parent progress counters for live updates. The AGENTS.md "external contributor" file rule doesn't apply to work in your own fork. Upstreaming isn't planned, though the user mentioned it as a possibility on 2026-11-09 ("if i were to eventually make this into a PR into the main").

---

## Step 1: Detail page cross-project parent fix (1a) — done, `b9e15956`

The bug was in `apps/web/src/components/task/task-details-content.tsx`: the key used the current `project.slug` and the link used the current `projectId`.

- `apps/web/src/components/task/use-open-task.ts`: `useOpenTask(workspaceId, sheetProjectId?)`. Opens a task under its own project's full route. Board and list views pass their project id so tasks from that project open in the side sheet (`?taskId=`) instead; the full task page has no sheet, so detail views omit it.
- `task-details-content.tsx`: `findParentRelation`, the key from `useProjectSlugs(workspaceId)` (hidden when `null`), navigation with `useOpenTask`.
- Same fix in `task-relations.tsx` (blocks/related links), the open-parent/open-subtask shortcuts in `task-shortcuts.tsx`, and `subtasks-chip.tsx`.

## Step 2: Parent line on cards and list rows (1b)

**API**
- `apps/api/src/task/get-task-parents.ts`, modeled on `get-subtask-counts.ts` with the join reversed: `targetTaskId IN (taskIds)`, `relationType = 'subtask'`, the same `workspaceId` and `projectAccessCondition(userId, …)` filters, no `archivedAt` filter. Returns `Map<childId, { id, number, title, projectId, projectSlug }>`; the oldest link wins.
- `get-tasks.ts` sets `parent` on every board task; public boards (`publicOnly`) always get `null`. `get-task.ts` (`view=board`) includes it too.
- `response.ts`: nullable optional `parent` on `boardTaskSchema` and `taskWithAssigneeSchema`.
- Live refresh of the child's board: `task-relation/refresh-child-board.ts` publishes `subtask-parents.refresh` for the child's project when a cross-project `subtask` link is created or deleted. A renamed parent stays stale on child boards until their next refetch; this is accepted.

**Web**
- `parent` on the web `Task` type; `task-chips/parent-task-link.tsx` renders `↑ KEY-5 Parent title` (`tasks:parent.open` aria-label).
- Above the title on kanban cards; after the title in list rows when `depth === 0`, and on backlog rows.
- The CLI `BoardTask` schema already ignores unknown keys; mobile and MCP pass the field through.

## Step 3: New permissions + backfill

- `packages/permissions/src/index.ts`:
  - `task` gains `"move_to_done"` and `"override_blockers"`.
  - `member` gets `move_to_done`; `admin` and `owner` get both.
  - Update `index.test.ts`, which asserts the exact `task` array.
- Add a one-time data migration, `apps/api/src/migrations/task-done-permissions-migration.ts`, modeled on `column-migration.ts`. It uses `pg_advisory_xact_lock` plus the `dataMigrationTable` marker `task-done-permissions-v1`.
  - For every `workspace_role` row, default and custom: if `task` includes `update`, add `move_to_done`.
  - If the row's role is `admin`, also add `override_blockers`.
  - Update rows in place. Never insert: duplicate rows OR together in `rolesAllow`.
  - Call it at boot in `apps/api/src/index.ts`, next to `seedDefaultWorkspaceRoles` (~1052).
  - Why it's needed: the seed only inserts missing rows, and a stored row fully replaces the built-in role (`role-permissions.ts:59-67`). Owner is static, so it picks the change up from the package.
  - Result: nobody loses anything on upgrade. You then create the agent role with both switches off.
- Roles editor (`apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/roles.tsx`): the switches appear automatically from `statement`. Add entries to `PERMISSION_LABELS`, and add the i18n keys `settings.workspaceRoles.permissions.task.{move_to_done,override_blockers}.{label,description}` in `i18n/en-US.json`. Then run `pnpm i18n:check:fix` to fill the other 20 locales. (`pnpm i18n:schema` regenerates a file upstream leaves far out of date and nothing reads; leave it out of this branch unless asked.)
- Not changed: scoped API keys. The UI only creates unscoped keys, and agents use their own user. Instance admins bypass role checks (`hasWorkspacePermission`), so an agent user must never be an instance admin.

## Step 4: "Block while blocked" column setting

- Schema: `columnTable.blockWhileBlocked`, `boolean("block_while_blocked").default(false).notNull()` (`apps/api/src/database/schema.ts:600`). Run `pnpm --filter @kaneo/api db:generate` and inspect the SQL. Default false means no data migration.
- API: add `blockWhileBlocked` to `apps/api/src/column/schema.ts` (create + update bodies), `column/response.ts` (with an OpenAPI description), `column/index.ts` (pass-through), `controllers/create-column.ts` and `controllers/update-column.ts`. The existing `project.updated` publish refreshes boards.
- Web column editor (Settings → project → Workflow):
  - Add a second `Switch` in `apps/web/src/components/project/columns/column-row.tsx`, next to the Done switch, with a header label in `column-list.tsx`.
  - Update the `ProjectColumn` type, the `fetchers/column/{create,update}-column.ts` fetchers, and `use-update-column.ts`.
  - Add i18n keys under `settings:columnEditor`.

## Step 5: "Subtasks block their parent" project setting

- Schema: `projectTable.subtasksBlockParent`, `boolean("subtasks_block_parent").default(false).notNull()`. Generate the migration and inspect it. No backfill ("only new").
- API: add the field to the project update body and response (`apps/api/src/project/schema.ts`, `response.ts`, `controllers/update-project.ts`) with an OpenAPI description.
- `task-relation/controllers/create-task-relation.ts`: in the same transaction, when `relationType` is `subtask` and the parent's (source's) project has the setting on, also insert a `blocks` link with the child as source and the parent as target, unless a `blocks` link already joins them in either direction. Publish a relation event for it. Web, API keys and MCP all create links through this route, so all get it.
- Web settings: a switch in the project settings Tasks section (`components/settings/project-general/project-tasks-section.tsx`), the `Project` type, the update fetcher and hook, and i18n keys.
- Unlink notice (web): wherever the web UI removes a `subtask` link, check whether the child still blocks the old parent. If it does, show a toast ("BUILD-3 still blocks PLAN-5") with a "Remove block" action that deletes that link. Today the only such path is swapping the parent in `task-relations.tsx` `handleLinkTask`; the remove-parent control proposed below would be the second. One helper beside them, e.g. `components/task/offer-block-removal.ts`. The API doesn't change.

## Step 6: Server guard on every user status-write path

Built. Where the build differs from the plan below, Claude's choices while building it:
- `can(database, perms)` runs its role lookup on the open transaction's connection. `workspacePermissionChecker` and `isInstanceAdmin` gained an optional `database` parameter for this. Taking a second pooled connection while holding the transaction could stall under load.
- `assertStatusMoves` runs after the write, inside the transaction. Tasks moved together then see each other's new columns: a bulk move of a task and its blocker into Done succeeds. A rejection rolls the write back.
- Column flags come from one more small file, `get-column-flags.ts`.
- A hidden blocker's `id` is redacted too, not only its key and title. The message counts hidden blockers ("1 task you can't see") without naming them.
- `move-task` now also requires the task's status to be unchanged since it was read, so the rules judge the move from the right column. Otherwise it returns its existing "moved concurrently" 409.
- Import checks every row up front and refuses the whole import with a 403, so nothing is created.
- The bulk route has no move-to-board operation; only `updateStatus` is guarded. The web moves tasks to another board through `move-task`.
- The five web fetchers pass `query: {}` until step 7 adds `force`.

New folder `apps/api/src/task/status-guard/`, one concern per file, with tests beside them:
- `status-guard.ts`: `statusGuard(c)` returns `{ force, can(perms) }`. `can` lazily memoizes `workspacePermissionChecker(c)` (`apps/api/src/utils/require-workspace-permission.ts:95`), so roles are looked up at most once per request, and only when a move hits a guarded column. That keeps reorders within a column free.
- `classify-moves.ts` (pure): for each move, compare before and after. A move is "into final" when the destination column is `isFinal` and the task isn't currently completed. It is "into gated" when the destination has `blockWhileBlocked` and the task is changing column or project. A full `PUT` that resends the same status never fires.
- `get-open-blockers.ts`: one batched query for all moving tasks.
  - It returns unfinished "blocked by" tasks: `relationType = 'blocks'`, `target = task`, source not completed. Subtask links are not read.
  - Completion uses `taskIsCompleted` (`apps/api/src/task/task-is-completed.ts`) in each blocker's own project. Workspace filter, no `archivedAt` filter.
  - It selects `projectAccessCondition(userId, …)` as a `visible` flag. Hidden blockers still block, but their key and title are redacted.
- `open-blockers-error.ts` (pure): builds the 409.
- `assert-status-moves.ts`: `assertStatusMoves(tx, moves[], guard)`.
  1. **Rule 1:** any into-final move without `can({ task: ["move_to_done"] })` gets a **403** `MISSING_PERMISSION` with `missingPermissions: ["task:move_to_done"]` and a readable message ("…needs the Move to Done permission; move it to a validation column instead"). This is 403 rather than the handoff's 409 because Kaneo already uses 403 for permission failures, and the web and CLI already parse it. `force` never bypasses it.
  2. **Rule 2:** for into-gated moves, load blockers. If there are none, allow. If the request has `force` and `can({ task: ["override_blockers"] })`, allow and return the forced counts. Otherwise return **409** `OPEN_BLOCKERS` with `overridable` and `blockers: [{ taskId, id, key, title }]`. The `message` lists keys and titles (at most 5, then "and N more"), because MCP and the CLI only show `message`.

Error contract:
- Extend `ApiErrorBody` and `ApiError` (`apps/api/src/errors/api-error.ts`), the `errorBody` in `http-exception-response.ts`, and `api-error-schema.ts` with optional `overridable` and `blockers`.

Call sites. Each runs inside its transaction against the locked before-row, and each handler builds `statusGuard(c)` and passes it in. Shared `forceQuery` (`force: "true" | "false"` optional) on the moving routes in `apps/api/src/task/index.ts`:
- `PUT /task/status/{id}`: `controllers/update-task-status.ts`, inside `withLockedTask` after `assertValidTaskStatus`.
- `PUT /task/{id}`: `controllers/update-task.ts`, against the locked row read (~91-107).
- `PATCH /task/bulk`: `controllers/bulk-update-tasks.ts`, `updateStatus` and move-to-board branches. All or nothing; blockers grouped by `taskId`.
- `POST /task/reorder`: `controllers/reorder-tasks.ts`, only rows whose `status` changes.
- `PUT /task/move/{id}`: `controllers/move-task.ts`. Finality and gating are judged against the **destination** project's columns.
- Rule 1 only (a new task has no blockers yet): `POST /task/{projectId}` (`create-task.ts`), `POST /task/duplicate/{id}` (`duplicate-task.ts`), `POST /task/import/{projectId}` (`import-tasks.ts`). The recurrence path (`recurrence/create-next-occurrence.ts`) is a system path, never targets a final column, and passes no guard.
- Update route descriptions, run `pnpm openapi:check:fix`, and commit `apps/docs/openapi.json`.
- MCP is covered automatically: both MCP servers call these REST routes over HTTP (`apps/api/src/mcp/tools.ts`, `packages/mcp/src/kaneo/client.ts`). No `force` parameter is added to the MCP tools.

## Step 7: Web dialog and force retry

- `apps/web/src/lib/parse-api-error-body.ts` and `lib/http-error.ts`: carry `overridable` and `blockers`. Add `lib/is-open-blockers-error.ts`, modeled on `is-workspace-archived-error.ts`.
- Add `apps/web/src/components/open-blockers/`:
  - `open-blockers-store.ts` (zustand): holds `{ error, retry }`.
  - `open-blockers-dialog.tsx`: built on `ConfirmDialog` (`components/settings/confirm-dialog.tsx`). It lists the blockers ("2 blocking tasks aren't done"). It shows "Move anyway" only when `overridable`; otherwise it shows the reason with a Close button. It is mounted once in the authenticated layout.
  - `handle-status-move-error.ts`: shows the dialog for `OPEN_BLOCKERS`; otherwise shows a toast with the server message.
- Fetchers take `force?: boolean` and send it as the query `force=true`: `fetchers/task/{update-task-status,update-task,reorder-tasks,move-task,bulk-operation}.ts`.
- Wire every status path to the handler:
  - Board drag and keyboard move (`kanban-board/index.tsx` `commitMove`: roll back, then show the dialog; confirming re-runs with force).
  - Context menu (`task-card-context-menu-content.tsx`).
  - Detail status (`task-status-popover.tsx`).
  - Subtask checkbox (`use-toggle-task-completion.ts`).
  - Subtask group status (`subtask-status-popover.tsx`).
  - Move to project (`use-move-task.ts`).
  - Bulk (`use-bulk-operations.ts` `run()`).
  - List view drag (`list-view/index.tsx` `moveTask`). This path has no `onError` today; add a rollback as well.
- Add i18n keys for the dialog under `tasks:openBlockers.*`.

## Step 8: Activity note and docs

- Forced moves: pass `forcedOpenBlockers: N` through the `task.status_changed` payload (`task-mutation-effects.ts:72-82`) into `eventData` (`apps/api/src/activity/index.ts:288`). Render "moved to Done with N open blockers" in `apps/web/src/components/activity/index.tsx`.
- Docs:
  - `apps/docs/core/functional/collaborate-with-team.mdx`: add the two permissions to the role table and a short "agent role" setup section (custom role, both switches off, no `project:update`, own user and key).
  - Document the "Block while blocked" column switch and the "Subtasks block their parent" project setting where columns and project settings are described.
  - `apps/docs/api-reference/errors.mdx`: document `OPEN_BLOCKERS`, `overridable`, `blockers` and `force`.

### Accepted gaps (documented, not built)
- Integrations, webhooks, issue importers, sync resume and workspace import bypass both rules.
- Turning on `isFinal` or `blockWhileBlocked` for a column doesn't re-check cards already in it. Adding a blocker to a card already in a gated column isn't blocked. Changing columns needs `project:update`, which the agent role shouldn't have.
- Turning on "Subtasks block their parent" adds no `blocks` links for existing subtasks ("only new").
- Unlinking a subtask through the API or MCP leaves its `blocks` link with no notice; only the web UI offers "Remove block".
- Mobile shows its generic error. No `force` parameter in MCP or the CLI.

## Proposed / open (not scheduled)

Not designed or ordered yet. The descriptions are Claude's wording; quotes are the user's.

### Subtask linking in the web UI

The user, on 2026-11-09, about the three items below: "absolutely will want them". Also: "i dont have a way to make a subtaks tied to a parent, and that would be something i think we should be able to do (in the ui somehwere)".

- Remove a task's parent without deleting the child. Today the only options are Ctrl+Shift+P (which swaps in a different parent) or `DELETE /api/task-relation/{id}`. The trash icon in the parent's Sub-tasks section deletes the child task itself. This control would also show step 5's unlink notice.
- Add an existing task as a subtask from the parent's Sub-tasks section. Today its "+" only creates a new task, and parent mode in the relation picker is reachable only through Ctrl+Shift+P.
- Let the relation picker search the whole workspace, so cross-board links can be made in the UI. Today it lists only the current board's tasks.

### Backfill `blocks` links for existing subtasks

A one-off command that adds the `blocks` link to existing subtask links on chosen boards, as if "Subtasks block their parent" had been on when they were made. Not needed for the user's own instance ("i dont have anything myself already for this"), but "if i were to eventually make this into a PR into the main, i would probably need it".

### Still open

- Deleting a relation needs only `task:update`, which the agent role keeps. An agent could delete a `blocks` link and then move the parent into a gated column such as For validation. Done stays protected by Rule 1. The subtask-based design had the same exposure through deleting the subtask link. Not discussed yet.

---

## Verification

**Automated** (report what ran):
- Unit tests:
  - `classify-moves.test.ts` and `open-blockers-error.test.ts`
  - permissions `index.test.ts`
  - `parse-api-error-body` test
  - the open-blockers dialog test and the unlink notice test
  - the parent line (board and list views) in `list-view/task-row.test.tsx`
- Integration tests (real Postgres `_test` database, `pnpm test:integration`):
  - `tests/api-integration/task-parent.test.ts`. Covers a cross-project parent, the board view, the oldest link, an archived board, a parent hidden by project access, cross-workspace isolation, public boards, and the child-board refresh.
  - `tests/api-integration/task-done-permissions-migration.test.ts`. Pattern: `column-migration-once.test.ts`. Existing member, admin and custom rows gain the actions, it runs only once, and an action removed after the migration stays removed.
  - `tests/api-integration/subtasks-block-parent.test.ts`: setting on for the parent's board → linking a subtask adds the `blocks` link, also across boards; setting off → no link; the child's board setting doesn't count; an existing `blocks` link in either direction isn't duplicated; unlinking leaves the `blocks` link.
  - `tests/api-integration/task-status-guard.test.ts`, over HTTP with role rows. Pattern: `workspace-rbac.test.ts` plus the `relate` helper.
    - Agent role → Done: 403. Agent → For validation: 200.
    - Same role with the permission switched on: 200.
    - Gated column with an open blocker on another board: 409 with the blocker's key and title.
    - An open subtask with no `blocks` link doesn't block.
    - Admin `force=true`: 200. Member `force=true`: 409 with `overridable: false`. Agent `force=true` → Done: 403.
    - A blocker on an archived board still blocks. All blockers done: 200. Ungated column with open blockers: 200.
    - A blocker the caller can't see is redacted.
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
- With "Subtasks block their parent" on for the Project board, link a phase task: the phase card shows it under "Blocked by". Swap the parent: the "still blocks" notice appears and "Remove block" works.
- Drag a blocked card into a gated column: the dialog appears, "Move anyway" works as admin, and an activity entry is written.
- Then, on a real instance:
  1. Create an Agent role with both switches off.
  2. Create an agent user with that role and give it an API key.
  3. `curl -X PUT /api/task/status/{id}` with the agent key: 403 into Done, 200 into For validation, 409 when the card has open blockers.
