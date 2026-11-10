import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOpenTask } from "@/components/task/use-open-task";
import { cn } from "@/lib/cn";
import type Task from "@/types/task";
import { stopCardEvents } from "./stop-card-events";

type ParentTaskLinkProps = {
  task: Task;
  workspaceId: string;
  className?: string;
};

export function ParentTaskLink({
  task,
  workspaceId,
  className,
}: ParentTaskLinkProps) {
  const { t } = useTranslation();
  const openTask = useOpenTask(workspaceId, task.projectId);
  const parent = task.parent;
  if (!parent) return null;

  const key =
    parent.number != null ? `${parent.projectSlug}-${parent.number}` : null;
  const name = key ? `${key} ${parent.title}` : parent.title;

  return (
    <button
      type="button"
      aria-label={t("tasks:parent.open", { name })}
      title={name}
      className={cn(
        "flex w-fit min-w-0 max-w-full items-center gap-1 rounded-sm text-[11px] text-muted-foreground leading-3.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...stopCardEvents}
      onClick={(event) => {
        event.stopPropagation();
        openTask(parent);
      }}
    >
      <ArrowUp className="size-3 shrink-0" />
      {key && <span className="shrink-0 font-mono">{key}</span>}
      <span className="truncate">{parent.title}</span>
    </button>
  );
}
