import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useOfferBlockRemoval } from "./use-offer-block-removal";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  deleteRelation: vi.fn(),
  relations: [] as unknown[],
  canRemoveBlockers: true,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { info: mocks.info } }));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => ({ data: mocks.relations }),
}));
vi.mock("@/hooks/mutations/task-relation/use-delete-task-relation", () => ({
  default: () => ({ mutate: mocks.deleteRelation }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canRemoveBlockers: () => mocks.canRemoveBlockers,
  }),
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({
    data: [
      { id: "phase", slug: "BUILD" },
      { id: "plan", slug: "PLAN" },
    ],
  }),
}));

const child = { title: "Parser", projectId: "phase", number: 3 };
const parent = { title: "Build phase", projectId: "plan", number: 5 };

const childBlocksParent = {
  id: "block-1",
  relationType: "blocks",
  sourceTaskId: "child",
  targetTaskId: "parent",
  sourceTask: child,
  targetTask: parent,
};

afterEach(() => {
  vi.clearAllMocks();
  mocks.canRemoveBlockers = true;
});

describe("useOfferBlockRemoval", () => {
  it("offers to remove the block the child still has on its old parent", () => {
    mocks.relations = [childBlocksParent];
    const { result } = renderHook(() => useOfferBlockRemoval("child", "ws"));

    result.current("parent");

    expect(mocks.info).toHaveBeenCalledWith(
      'tasks:relations.stillBlocks {"child":"BUILD-3","parent":"PLAN-5"}',
      {
        action: {
          label: "tasks:relations.removeBlock",
          onClick: expect.any(Function),
        },
      },
    );
    mocks.info.mock.calls[0][1].action.onClick();
    expect(mocks.deleteRelation).toHaveBeenCalledWith("block-1");
  });

  it("only reports the block to a role without Remove blockers", () => {
    mocks.relations = [childBlocksParent];
    mocks.canRemoveBlockers = false;
    const { result } = renderHook(() => useOfferBlockRemoval("child", "ws"));

    result.current("parent");

    expect(mocks.info).toHaveBeenCalledWith(
      'tasks:relations.stillBlocks {"child":"BUILD-3","parent":"PLAN-5"}',
      undefined,
    );
  });

  it("stays quiet when the child does not block that parent", () => {
    mocks.relations = [
      {
        id: "block-1",
        relationType: "blocks",
        sourceTaskId: "parent",
        targetTaskId: "child",
        sourceTask: parent,
        targetTask: child,
      },
      {
        id: "related-1",
        relationType: "related",
        sourceTaskId: "child",
        targetTaskId: "parent",
        sourceTask: child,
        targetTask: parent,
      },
    ];
    const { result } = renderHook(() => useOfferBlockRemoval("child", "ws"));

    result.current("parent");

    expect(mocks.info).not.toHaveBeenCalled();
  });
});
