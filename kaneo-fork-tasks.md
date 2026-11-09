# Kaneo fork: task list

Work items for [kaneo-fork-plan.md](./kaneo-fork-plan.md); design details and file references live there. Each section is one commit on `feature/prevent-transitions`.

## 1. Detail page cross-project parent fix

- [ ] Add `useOpenTask(workspaceId, currentProjectId)` in `apps/web/src/components/task/use-open-task.ts`
- [ ] Fix the parent key and link in `task-details-content.tsx` (`findParentRelation`, `useProjectSlugs`, `useOpenTask`)
- [ ] Switch `subtasks-chip.tsx` and `task-relations.tsx` navigation to `useOpenTask`
- [ ] Check: a parent on another board shows its own key and opens its own board

## 2. Parent line on cards and list rows

- [ ] Add `apps/api/src/task/get-task-parents.ts` (batched, access-filtered, archived boards included)
- [ ] Attach `parent` in `get-tasks.ts` (not on public boards)
- [ ] Include `parent` in `get-task.ts` for `view=board`
- [ ] Add `parent` to `boardTaskSchema` and `taskWithAssigneeSchema`
- [ ] Refresh the child's board when a cross-project subtask is linked or unlinked
- [ ] Add `parent` to the web `Task` type
- [ ] Add the `ParentTaskLink` component and the `tasks:parent.open` i18n key
- [ ] Render it above the title on kanban cards
- [ ] Render it in list rows when `depth === 0`
- [ ] Check that the CLI `BoardTask` schema accepts the new key
- [ ] Tests: `tests/api-integration/task-parent.test.ts`, `task-card.test.tsx`, `task-row.test.tsx`
- [ ] `pnpm openapi:check:fix`

## 3. Permissions and backfill

- [ ] Add `move_to_done` and `override_open_subtasks` to `task` in `packages/permissions/src/index.ts`; grant `move_to_done` to member, both to admin and owner
- [ ] Update `packages/permissions/src/index.test.ts`
- [ ] Add the one-time migration `apps/api/src/migrations/task-done-permissions-migration.ts` and run it at boot
- [ ] Test: `tests/api-integration/task-done-permissions-migration.test.ts`
- [ ] Roles editor: `PERMISSION_LABELS` entries and i18n keys; run `pnpm i18n:schema` and `pnpm i18n:check:fix`

## 4. "Block open subtasks" column switch

- [ ] Add `block_open_subtasks` to `columnTable`; generate the migration and inspect its SQL
- [ ] Column API: create and update bodies, response, controllers
- [ ] Column editor: second switch, `ProjectColumn` type, fetchers, hook, i18n keys
- [ ] `pnpm openapi:check:fix`

## 5. Server guard

- [ ] Add `apps/api/src/task/status-guard/`: `status-guard.ts`, `classify-moves.ts`, `get-open-blockers.ts`, `open-subtasks-error.ts`, `assert-status-moves.ts`, with unit tests beside them
- [ ] Extend `ApiError`, `errorBody` and `api-error-schema.ts` with `overridable` and `blockers`
- [ ] Add the `force` query to the moving routes
- [ ] Wire both rules into `update-task-status`, `update-task`, `bulk-update-tasks`, `reorder-tasks`, `move-task`
- [ ] Wire rule 1 into `create-task`, `duplicate-task`, `import-tasks`
- [ ] Test: `tests/api-integration/task-status-guard.test.ts` (every path, roles, force, archived child, blocked-by, redaction)
- [ ] Test: 409 `message` reaches MCP tool results in `tests/api/mcp-tools.test.ts`
- [ ] Update route descriptions; `pnpm openapi:check:fix`

## 6. Web dialog and force retry

- [ ] Carry `overridable` and `blockers` in `parse-api-error-body.ts` and `http-error.ts`; add `is-open-subtasks-error.ts`
- [ ] Add the open-subtasks store, dialog and `handle-status-move-error.ts`; mount the dialog in the authenticated layout
- [ ] Add a `force` option to the five task fetchers
- [ ] Wire the handler into board drag and keyboard moves
- [ ] Wire it into the context menu, detail status, subtask checkbox and subtask group status
- [ ] Wire it into move-to-project and bulk actions
- [ ] Wire it into list view drag, and add the missing rollback there
- [ ] Add `tasks:openSubtasks.*` i18n keys
- [ ] Test the dialog

## 7. Activity note and docs

- [ ] Pass `forcedOpenSubtasks` through `task.status_changed` into activity `eventData` and render it
- [ ] Docs: permissions in the role table, an agent role setup section, and `OPEN_SUBTASKS` / `force` on the errors page

## Final checks

- [ ] `pnpm build:dependencies`, `pnpm typecheck`, `pnpm lint`, `pnpm openapi:check`, `pnpm i18n:check`
- [ ] `pnpm test` and `pnpm test:integration`
- [ ] Browser check in `pnpm dev`: parent line, detail link, gated drag with the dialog, activity entry
- [ ] Real instance: create the Agent role (both switches off), an agent user and key, then curl a status move (403 into Done, 200 into For validation, 409 with open subtasks)
