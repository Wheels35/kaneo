import { describe, expect, it } from "vite-plus/test";
import {
  type ColumnFlags,
  classifyMoves,
  type TaskPlace,
} from "./classify-moves";

const columns: Record<string, ColumnFlags> = {
  "board:to-do": { name: "To do", isFinal: false, blockWhileBlocked: false },
  "board:validation": {
    name: "For validation",
    isFinal: false,
    blockWhileBlocked: true,
  },
  "board:done": { name: "Done", isFinal: true, blockWhileBlocked: true },
  "board:closed": { name: "Closed", isFinal: true, blockWhileBlocked: false },
  "other:done": { name: "Shipped", isFinal: true, blockWhileBlocked: false },
};
const columnAt = ({ projectId, status }: TaskPlace) =>
  columns[`${projectId}:${status}`];
const at = (status: string, projectId = "board") => ({ projectId, status });

describe("classifyMoves", () => {
  it("finds moves into a final column and into a Block while blocked column", () => {
    expect(
      classifyMoves(
        [
          { taskId: "a", from: at("to-do"), to: at("validation") },
          { taskId: "b", from: at("to-do"), to: at("done") },
        ],
        columnAt,
      ),
    ).toEqual({ intoFinal: [columns["board:done"]], intoGated: ["a", "b"] });
  });

  it("ignores a task that stays in its column", () => {
    expect(
      classifyMoves(
        [
          { taskId: "a", from: at("done"), to: at("done") },
          { taskId: "b", from: at("validation"), to: at("validation") },
        ],
        columnAt,
      ),
    ).toEqual({ intoFinal: [], intoGated: [] });
  });

  it("does not count a completed task moving between final columns as finishing it", () => {
    const { intoFinal } = classifyMoves(
      [
        { taskId: "a", from: at("closed"), to: at("done") },
        { taskId: "b", from: at("done"), to: at("done", "other") },
      ],
      columnAt,
    );
    expect(intoFinal).toEqual([]);
  });

  it("judges a move to another board by the destination's columns", () => {
    expect(
      classifyMoves(
        [{ taskId: "a", from: at("to-do", "other"), to: at("done") }],
        columnAt,
      ),
    ).toEqual({ intoFinal: [columns["board:done"]], intoGated: ["a"] });
  });

  it("checks only the final column for a task being created", () => {
    expect(classifyMoves([{ to: at("done") }], columnAt)).toEqual({
      intoFinal: [columns["board:done"]],
      intoGated: [],
    });
  });

  it("treats a status without a column, such as planned, as unguarded", () => {
    expect(
      classifyMoves(
        [
          { taskId: "a", from: at("done"), to: at("planned") },
          { taskId: "b", from: at("archived"), to: at("to-do") },
        ],
        columnAt,
      ),
    ).toEqual({ intoFinal: [], intoGated: [] });
  });
});
