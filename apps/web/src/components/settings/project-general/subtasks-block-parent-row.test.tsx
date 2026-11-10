import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SubtasksBlockParentRow } from "./subtasks-block-parent-row";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  updateProject: vi.fn(),
  getProject: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { id: "p1", subtasksBlockParent: false } }),
}));
vi.mock("@/fetchers/project/get-project", () => ({
  default: mocks.getProject,
}));
vi.mock("@/hooks/mutations/project/use-update-project", () => ({
  default: () => ({ mutateAsync: mocks.updateProject }),
}));

function renderRow() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SubtasksBlockParentRow
        projectId="p1"
        workspaceId="ws"
        canEdit
        flushPendingSave={mocks.flush}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.calls.length = 0;
});

describe("SubtasksBlockParentRow", () => {
  it("finishes pending edits, then saves with the server's current values", async () => {
    mocks.flush.mockImplementation(async () => {
      mocks.calls.push("flush");
      return true;
    });
    mocks.getProject.mockImplementation(async () => {
      mocks.calls.push("fetch");
      return {
        id: "p1",
        name: "Renamed on the server",
        slug: "PLAN",
        description: null,
        icon: "Layout",
        isPublic: true,
      };
    });
    mocks.updateProject.mockImplementation(async () => {
      mocks.calls.push("update");
      return {};
    });
    renderRow();

    fireEvent.click(
      screen.getByRole("switch", {
        name: "settings:projectGeneral.subtasksBlockParentTitle",
      }),
    );

    await vi.waitFor(() =>
      expect(mocks.updateProject).toHaveBeenCalledWith({
        id: "p1",
        name: "Renamed on the server",
        slug: "PLAN",
        description: "",
        icon: "Layout",
        isPublic: true,
        subtasksBlockParent: true,
      }),
    );
    expect(mocks.calls).toEqual(["flush", "fetch", "update"]);
  });
});
