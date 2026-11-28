import { describe, expect, it } from "vitest";
import {
  createEdgePath,
  createFlowLayout,
  NODE_RADIUS,
} from "../../src/components/electronicFlow/layout";

const nodes = [
  { id: "start", name: "开始" },
  { id: "split", name: "分支" },
  { id: "a", name: "分支 A" },
  { id: "b", name: "分支 B" },
  { id: "c", name: "分支 C" },
  { id: "merge", name: "合并" },
  { id: "end", name: "结束" },
];

const edges = [
  { source: "start", target: "split" },
  { source: "split", target: "a" },
  { source: "split", target: "b" },
  { source: "split", target: "c" },
  { source: "a", target: "merge" },
  { source: "b", target: "merge" },
  { source: "c", target: "merge" },
  { source: "merge", target: "end" },
];

const getNode = (layout, id) => layout.nodes.find((node) => node.id === id);
const ROUTE_CLEARANCE = 56;

describe("electronicFlow layout", () => {
  it("同层分支纵向排列，合并节点位于全部分支之后", () => {
    const layout = createFlowLayout(nodes, edges, 1000);
    const branchNodes = ["a", "b", "c"].map((id) => getNode(layout, id));
    const split = getNode(layout, "split");
    const merge = getNode(layout, "merge");

    expect(new Set(branchNodes.map((node) => node.x)).size).toBe(1);
    expect(new Set(branchNodes.map((node) => node.y)).size).toBe(3);
    expect(branchNodes.every((node) => node.x > split.x)).toBe(true);
    expect(merge.x).toBeGreaterThan(branchNodes[0].x);
    expect(merge.y).toBe(
      branchNodes.reduce((sum, node) => sum + node.y, 0) / branchNodes.length,
    );
    expect(layout.edges).toHaveLength(edges.length);
  });

  it("容器变宽时增加列间距，空间不足时保留最小可读尺寸", () => {
    const narrow = createFlowLayout(nodes, edges, 500);
    const wide = createFlowLayout(nodes, edges, 1200);

    expect(narrow.width).toBe(912);
    expect(wide.width).toBe(1200);
    expect(getNode(wide, "end").x - getNode(wide, "start").x).toBeGreaterThan(
      getNode(narrow, "end").x - getNode(narrow, "start").x,
    );
  });

  it("合并节点会等待层级更深的所有前置分支", () => {
    const layout = createFlowLayout(
      [
        { id: "root" },
        { id: "short" },
        { id: "long-1" },
        { id: "long-2" },
        { id: "target" },
      ],
      [
        { source: "root", target: "short" },
        { source: "root", target: "long-1" },
        { source: "long-1", target: "long-2" },
        { source: "short", target: "target" },
        { source: "long-2", target: "target" },
      ],
      1000,
    );

    expect(getNode(layout, "target").x).toBeGreaterThan(getNode(layout, "long-2").x);
  });

  it("默认在节点外的公共点分岔，并使用直角线", () => {
    const layout = createFlowLayout(nodes, edges, 1000);
    const edge = layout.edges.find(
      (item) => item.source.id === "split" && item.target.id === "a",
    );
    const path = createEdgePath(edge);

    expect(edge.isBranch).toBe(true);
    expect(path).toBe(
      `M ${edge.source.x + NODE_RADIUS + 2} ${edge.source.y} H ${edge.branchX} V ${edge.target.y} H ${edge.target.x - NODE_RADIUS - 2}`,
    );
    expect(edge.branchX).toBeGreaterThan(edge.source.x + NODE_RADIUS + 2);

    const mergeEdge = layout.edges.find(
      (item) => item.source.id === "a" && item.target.id === "merge",
    );
    expect(createEdgePath(mergeEdge)).toBe(
      `M ${mergeEdge.source.x + NODE_RADIUS + 2} ${mergeEdge.source.y} H ${mergeEdge.mergeX} V ${mergeEdge.target.y} H ${mergeEdge.target.x - NODE_RADIUS - 2}`,
    );

    const horizontalEdge = layout.edges.find(
      (item) => item.source.id === "split" && item.target.id === "b",
    );
    expect(horizontalEdge.source.y).toBe(horizontalEdge.target.y);
    expect(createEdgePath(horizontalEdge)).toContain(`H ${horizontalEdge.branchX}`);
  });

  it("跨层且同时分岔汇合时，所有分支都经过正确的共享连接点", () => {
    const layout = createFlowLayout(
      [
        { id: "root" },
        { id: "a" },
        { id: "b" },
        { id: "c" },
        { id: "merge" },
      ],
      [
        { source: "root", target: "a" },
        { source: "root", target: "b" },
        { source: "root", target: "merge" },
        { source: "b", target: "c" },
        { source: "a", target: "merge" },
        { source: "c", target: "merge" },
      ],
      1000,
    );

    layout.edges
      .filter((edge) => edge.source.id === "root")
      .forEach((edge) => {
        expect(createEdgePath(edge)).toContain(`H ${edge.branchX}`);
      });
    layout.edges
      .filter((edge) => edge.target.id === "merge")
      .forEach((edge) => {
        expect(createEdgePath(edge)).toContain(`H ${edge.mergeX}`);
      });

    const crossLevelEdge = layout.edges.find(
      (edge) => edge.source.id === "root" && edge.target.id === "merge",
    );
    expect(crossLevelEdge.isBranch).toBe(true);
    expect(crossLevelEdge.isMerge).toBe(true);
    expect(crossLevelEdge.isLong).toBe(true);
    expect(createEdgePath(crossLevelEdge)).toContain(`V ${crossLevelEdge.routeY}`);
    expect(createEdgePath(crossLevelEdge, {
      branchFromNode: true,
      branchLineType: "orthogonal",
    })).toContain(`V ${crossLevelEdge.routeY}`);

    const intermediateNodes = layout.nodes.filter(
      (node) => node.rank > crossLevelEdge.source.rank && node.rank < crossLevelEdge.target.rank,
    );
    intermediateNodes.forEach((node) => {
      expect(Math.abs(node.y - crossLevelEdge.routeY)).toBeGreaterThanOrEqual(ROUTE_CLEARANCE);
    });
  });

  it("开启从节点出发后，默认使用圆周间直连线", () => {
    const layout = createFlowLayout(nodes, edges, 1000);
    const edge = layout.edges.find(
      (item) => item.source.id === "split" && item.target.id === "a",
    );
    const path = createEdgePath(edge, { branchFromNode: true });
    const coordinates = path.match(/-?\d+(?:\.\d+)?/g).map(Number);

    expect(path).toContain(" L ");
    expect(path).not.toContain(" V ");
    expect(Math.hypot(
      coordinates[0] - edge.source.x,
      coordinates[1] - edge.source.y,
    )).toBeCloseTo(NODE_RADIUS + 2, 6);
    expect(Math.hypot(
      coordinates[2] - edge.target.x,
      coordinates[3] - edge.target.y,
    )).toBeCloseTo(NODE_RADIUS + 2, 6);
  });

  it("开启从节点出发后可切换为直角线", () => {
    const layout = createFlowLayout(nodes, edges, 1000);
    const edge = layout.edges.find(
      (item) => item.source.id === "split" && item.target.id === "a",
    );
    const path = createEdgePath(edge, {
      branchFromNode: true,
      branchLineType: "orthogonal",
    });

    expect(path).toContain(" H ");
    expect(path).toContain(" V ");
    expect(path.startsWith(`M ${edge.source.x + NODE_RADIUS + 2} ${edge.source.y}`)).toBe(true);
  });

  it("拒绝重复节点、无效连线和循环流程", () => {
    expect(() => createFlowLayout([{ id: "a" }, { id: "a" }], [], 500)).toThrow(
      "id 重复",
    );
    expect(() =>
      createFlowLayout([{ id: "a" }], [{ source: "a", target: "missing" }], 500),
    ).toThrow("不存在的节点");
    expect(() =>
      createFlowLayout(
        [{ id: "a" }, { id: "b" }],
        [
          { source: "a", target: "b" },
          { source: "b", target: "a" },
        ],
        500,
      ),
    ).toThrow("不能形成循环");
  });
});
