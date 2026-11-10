import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import getProject from "@/fetchers/project/get-project";
import useUpdateProject from "@/hooks/mutations/project/use-update-project";
import { toast } from "@/lib/toast";

/**
 * Saves the "Subtasks block their parent" switch. Project updates replace
 * every field, so it first lets the page's autosave finish, then sends the
 * server's current values: cached ones could undo a rename still in flight.
 */
export function useSaveSubtasksBlockParent(
  projectId: string,
  workspaceId: string,
  flushPendingSave: () => Promise<boolean>,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutateAsync: updateProject } = useUpdateProject();

  return async (subtasksBlockParent: boolean) => {
    try {
      await flushPendingSave();
      const project = await queryClient.fetchQuery({
        queryKey: ["projects", workspaceId, projectId],
        queryFn: () => getProject({ id: projectId, workspaceId }),
        staleTime: 0,
      });
      await updateProject({
        id: projectId,
        name: project.name,
        slug: project.slug,
        description: project.description ?? "",
        icon: project.icon ?? "Layout",
        isPublic: !!project.isPublic,
        subtasksBlockParent,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({
          queryKey: ["projects", workspaceId, projectId],
        }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:projectGeneral.toastUpdateError"),
      );
    }
  };
}
