import { Ban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { Switch } from "@/components/ui/switch";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { usePendingToggle } from "@/hooks/use-pending-toggle";
import { useSaveSubtasksBlockParent } from "./use-save-subtasks-block-parent";

type SubtasksBlockParentRowProps = {
  projectId: string;
  workspaceId: string;
  canEdit: boolean;
  flushPendingSave: () => Promise<boolean>;
};

export function SubtasksBlockParentRow({
  projectId,
  workspaceId,
  canEdit,
  flushPendingSave,
}: SubtasksBlockParentRowProps) {
  const { t } = useTranslation();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const save = useSaveSubtasksBlockParent(
    projectId,
    workspaceId,
    flushPendingSave,
  );
  const [checked, toggle] = usePendingToggle(
    project?.subtasksBlockParent ?? false,
    save,
  );
  const title = t("settings:projectGeneral.subtasksBlockParentTitle");

  return (
    <SettingsRow
      icon={<Ban />}
      title={title}
      description={t("settings:projectGeneral.subtasksBlockParentDescription")}
    >
      <Switch
        aria-label={title}
        checked={checked}
        disabled={!canEdit || !project}
        onCheckedChange={(value) => void toggle(value)}
      />
    </SettingsRow>
  );
}
