import { useNavigate } from "@tanstack/react-router";

type OpenableTask = { id: string; projectId: string };

/**
 * Opens a task on its own project's route. Board and list views pass their
 * project id so tasks from that project open in the side sheet (`?taskId=`)
 * instead; the full task page has no sheet, so detail views omit it.
 */
export function useOpenTask(workspaceId: string, sheetProjectId?: string) {
  const navigate = useNavigate();

  return (task: OpenableTask) => {
    if (task.projectId === sheetProjectId) {
      navigate({ to: ".", search: { taskId: task.id } });
      return;
    }
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: { workspaceId, projectId: task.projectId, taskId: task.id },
    });
  };
}
