# Kaneo fork: task list

Work items for [kaneo-fork-plan.md](./kaneo-fork-plan.md); design details and file references live there. Each section is one commit on `feature/prevent-transitions`.

## 1. Detail page cross-project parent fix

- [x] Add `useOpenTask(workspaceId, sheetProjectId?)` in `apps/web/src/components/task/use-open-task.ts`
- [x] Fix the parent key and link in `task-details-content.tsx` (`findParentRelation`, `useProjectSlugs`, `useOpenTask`)
- [x] Switch `subtasks-chip.tsx` and `task-relations.tsx` navigation to `useOpenTask`
- [ ] Check: a parent on another board shows its own key and opens its own board

## 2. Parent line on cards and list rows

- [x] Add `apps/api/src/task/get-task-parents.ts` (batched, access-filtered, archived boards included)
- [x] Attach `parent` in `get-tasks.ts` (not on public boards)
- [x] Include `parent` in `get-task.ts` for `view=board`
- [x] Add `parent` to `boardTaskSchema` and `taskWithAssigneeSchema`
- [x] Refresh the child's board when a cross-project subtask is linked or unlinked
- [x] Add `parent` to the web `Task` type
- [x] Add the `ParentTaskLink` component and the `tasks:parent.open` i18n key
- [x] Render it above the title on kanban cards
- [x] Render it in list rows when `depth === 0`
- [x] Check that the CLI `BoardTask` schema accepts the new key
- [x] Tests: `tests/api-integration/task-parent.test.ts`; board and list views in `list-view/task-row.test.tsx`
- [x] `pnpm openapi:check:fix`

## 3. Permissions and backfill

- [ ] Add `move_to_done` and `override_blockers` to `task` in `packages/permissions/src/index.ts`; grant `move_to_done` to member, both to admin and owner
- [ ] Update `packages/permissions/src/index.test.ts`
- [ ] Add the one-time migration `apps/api/src/migrations/task-done-permissions-migration.ts` and run it at boot
- [ ] Test: `tests/api-integration/task-done-permissions-migration.test.ts`
- [ ] Roles editor: `PERMISSION_LABELS` entries and i18n keys; run `pnpm i18n:check:fix`

## 4. "Block while blocked" column switch

- [ ] Add `block_while_blocked` to `columnTable`; generate the migration and inspect its SQL
- [ ] Column API: create and update bodies, response, controllers
- [ ] Column editor: second switch, `ProjectColumn` type, fetchers, hook, i18n keys
- [ ] `pnpm openapi:check:fix`

## 5. "Subtasks block their parent" project setting

- [ ] Add `subtasks_block_parent` to `projectTable`; generate the migration and inspect its SQL
- [ ] Project API: update body, response, controller
- [ ] `create-task-relation.ts`: add the child-blocks-parent link when the parent's board has the setting on, without duplicates
- [ ] Project settings: switch in the Tasks section, `Project` type, fetcher, hook, i18n keys
- [ ] Unlink notice: "still blocks" toast with "Remove block" when the web UI removes a subtask link
- [ ] Test: `tests/api-integration/subtasks-block-parent.test.ts`; unlink notice test
- [ ] `pnpm openapi:check:fix`

## 6. Server guard

- [ ] Add `apps/api/src/task/status-guard/`: `status-guard.ts`, `classify-moves.ts`, `get-open-blockers.ts`, `open-blockers-error.ts`, `assert-status-moves.ts`, with unit tests beside them
- [ ] Extend `ApiError`, `errorBody` and `api-error-schema.ts` with `overridable` and `blockers`
- [ ] Add the `force` query to the moving routes
- [ ] Wire both rules into `update-task-status`, `update-task`, `bulk-update-tasks`, `reorder-tasks`, `move-task`
- [ ] Wire rule 1 into `create-task`, `duplicate-task`, `import-tasks`
- [ ] Test: `tests/api-integration/task-status-guard.test.ts` (every path, roles, force, archived blocker, subtask without a block, redaction)
- [ ] Test: 409 `message` reaches MCP tool results in `tests/api/mcp-tools.test.ts`
- [ ] Update route descriptions; `pnpm openapi:check:fix`

## 7. Web dialog and force retry

- [ ] Carry `overridable` and `blockers` in `parse-api-error-body.ts` and `http-error.ts`; add `is-open-blockers-error.ts`
- [ ] Add the open-blockers store, dialog and `handle-status-move-error.ts`; mount the dialog in the authenticated layout
- [ ] Add a `force` option to the five task fetchers
- [ ] Wire the handler into board drag and keyboard moves
- [ ] Wire it into the context menu, detail status, subtask checkbox and subtask group status
- [ ] Wire it into move-to-project and bulk actions
- [ ] Wire it into list view drag, and add the missing rollback there
- [ ] Add `tasks:openBlockers.*` i18n keys
- [ ] Test the dialog

## 8. Activity note and docs

- [ ] Pass `forcedOpenBlockers` through `task.status_changed` into activity `eventData` and render it
- [ ] Docs: permissions in the role table, an agent role setup section, the column switch and project setting, and `OPEN_BLOCKERS` / `force` on the errors page

## Final checks

- [ ] `pnpm build:dependencies`, `pnpm typecheck`, `pnpm lint`, `pnpm openapi:check`, `pnpm i18n:check`
- [ ] `pnpm test` and `pnpm test:integration`
- [ ] Browser check in `pnpm dev`: parent line, detail link, auto block link and unlink notice, gated drag with the dialog, activity entry
- [ ] Real instance: create the Agent role (both switches off), an agent user and key, then curl a status move (403 into Done, 200 into For validation, 409 with open blockers)
