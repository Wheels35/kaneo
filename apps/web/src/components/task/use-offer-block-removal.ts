import { useTranslation } from "react-i18next";
import useDeleteTaskRelation from "@/hooks/mutations/task-relation/use-delete-task-relation";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { useProjectSlugs } from "./sections/use-project-slugs";

type LinkedTask = { title: string; projectId: string; number: number | null };

/**
 * Removing a subtask link leaves any link where the child blocks that parent,
 * whether "Subtasks block their parent" added it or someone did by hand. This
 * says so after the unlink and, for roles with Remove blockers, offers to
 * remove the block too.
 */
export function useOfferBlockRemoval(taskId: string, workspaceId: string) {
  const { t } = useTranslation();
  const { data: relations = [] } = useGetTaskRelations(taskId);
  const { mutate: deleteRelation } = useDeleteTaskRelation(taskId);
  const { canRemoveBlockers } = useWorkspacePermission();
  const displayIdOf = useProjectSlugs(workspaceId);
  const nameOf = (task: LinkedTask) =>
    displayIdOf(task.projectId, task.number) ?? task.title;

  return (parentId: string) => {
    const block = relations.find(
      (relation) =>
        relation.relationType === "blocks" &&
        relation.sourceTaskId === taskId &&
        relation.targetTaskId === parentId,
    );
    if (!block?.sourceTask || !block.targetTask) return;

    toast.info(
      t("tasks:relations.stillBlocks", {
        child: nameOf(block.sourceTask),
        parent: nameOf(block.targetTask),
      }),
      canRemoveBlockers()
        ? {
            action: {
              label: t("tasks:relations.removeBlock"),
              onClick: () => deleteRelation(block.id),
            },
          }
        : undefined,
    );
  };
}
