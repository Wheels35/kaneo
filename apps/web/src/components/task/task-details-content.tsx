import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLinksAccordion } from "@/components/external-links/external-links-accordion";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import useGetTask from "@/hooks/queries/task/use-get-task";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { cn } from "@/lib/cn";
import type { ExternalLink } from "@/types/external-link";
import { useProjectSlugs } from "./sections/use-project-slugs";
import { TaskActivity } from "./task-activity";
import TaskDescription from "./task-description";
import { findParentRelation } from "./task-relation-link";
import TaskRelations from "./task-relations";
import TaskSubtasks from "./task-subtasks";
import TaskTitle from "./task-title";
import { useOpenTask } from "./use-open-task";

type TaskDetailsContentProps = {
  taskId: string | undefined;
  projectId: string;
  workspaceId: string;
  className?: string;
  variant?: "sheet" | "page";
  properties?: ReactNode;
};

export default function TaskDetailsContent({
  taskId,
  projectId,
  workspaceId,
  className,
  variant = "sheet",
  properties,
}: TaskDetailsContentProps) {
  const { t } = useTranslation();
  const { data: task } = useGetTask(taskId ?? "");
  const { data: externalLinks = [], isLoading: isLoadingExternalLinks } =
    useExternalLinks(taskId ?? "");
  const { data: relations = [] } = useGetTaskRelations(taskId ?? "");
  const displayIdOf = useProjectSlugs(workspaceId);
  const openTask = useOpenTask(workspaceId);

  if (!taskId) return null;

  const parentTask = findParentRelation(taskId, relations)?.sourceTask;
  const parentKey =
    parentTask && displayIdOf(parentTask.projectId, parentTask.number);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-col gap-2.5 pb-4">
        {parentTask && (
          <button
            type="button"
            className="flex w-fit min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground text-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => openTask(parentTask)}
          >
            <ArrowUpRight className="size-3 shrink-0" />
            <span className="shrink-0">{t("tasks:detail.subtaskOf")}</span>
            {parentKey && (
              <span className="shrink-0 font-mono">{parentKey}</span>
            )}
            <span className="truncate font-medium text-foreground/80">
              {parentTask.title}
            </span>
          </button>
        )}
        <TaskTitle taskId={taskId} size={variant === "page" ? "lg" : "md"} />
      </div>

      {properties}

      <TaskDescription taskId={taskId} />

      <div className="mt-6 flex flex-col gap-6">
        {task && (
          <TaskSubtasks
            taskId={taskId}
            projectId={projectId}
            workspaceId={workspaceId}
            parentStatus={task.status}
          />
        )}
        <TaskRelations
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
        />
        <ExternalLinksAccordion
          taskId={taskId}
          externalLinks={externalLinks as ExternalLink[]}
          isLoading={isLoadingExternalLinks}
        />
      </div>

      <TaskActivity
        taskId={taskId}
        projectId={projectId}
        className="mt-8 border-border border-t pt-6"
      />
    </div>
  );
}
