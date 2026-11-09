import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import TaskDetailsContent from "./task-details-content";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  relations: [] as unknown[],
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock("@/hooks/queries/external-link/use-external-links", () => ({
  default: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => ({ data: mocks.relations }),
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({
    data: [
      { id: "project-1", slug: "PHASE" },
      { id: "project-2", slug: "PLAN" },
    ],
  }),
}));
vi.mock("@/components/external-links/external-links-accordion", () => ({
  ExternalLinksAccordion: () => null,
}));
vi.mock("./task-activity", () => ({ TaskActivity: () => null }));
vi.mock("./task-description", () => ({ default: () => null }));
vi.mock("./task-relations", () => ({ default: () => null }));
vi.mock("./task-subtasks", () => ({ default: () => null }));
vi.mock("./task-title", () => ({ default: () => null }));

function parentRelation(parentProjectId: string) {
  return {
    id: "link",
    sourceTaskId: "parent-1",
    targetTaskId: "task-1",
    relationType: "subtask",
    sourceTask: {
      id: "parent-1",
      number: 5,
      title: "Build phase",
      projectId: parentProjectId,
    },
    targetTask: { id: "task-1", number: 9, projectId: "project-1" },
  };
}

function renderContent() {
  render(
    <TaskDetailsContent
      taskId="task-1"
      projectId="project-1"
      workspaceId="workspace-1"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskDetailsContent parent link", () => {
  it("shows a parent on another board with its own key and opens it there", () => {
    mocks.relations = [parentRelation("project-2")];
    renderContent();

    fireEvent.click(screen.getByRole("button", { name: /PLAN-5/ }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: {
        workspaceId: "workspace-1",
        projectId: "project-2",
        taskId: "parent-1",
      },
    });
  });

  it("hides the key when the parent's project is not listed", () => {
    mocks.relations = [parentRelation("project-archived")];
    renderContent();

    const link = screen.getByRole("button", { name: /Build phase/ });
    expect(link.textContent).not.toMatch(/-5/);
  });

  it("renders no link without a parent", () => {
    mocks.relations = [];
    renderContent();

    expect(screen.queryByRole("button")).toBeNull();
  });
});
