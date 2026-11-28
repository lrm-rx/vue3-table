export const NODE_RADIUS = 10;

export const STATUS_COLORS = {
  pending: "#a8abb2",
  completed: "#67c23a",
  processing: "#409eff",
  rejected: "#e6a23c",
};

export const STATUS_LABELS = {
  pending: "未流转",
  completed: "已完成",
  processing: "进行中",
  rejected: "已驳回",
};

const HORIZONTAL_PADDING = 96;
const VERTICAL_PADDING = 64;
const MIN_COLUMN_GAP = 180;
const ROW_GAP = 112;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
const DEFAULT_WIDTH = 960;

function createGraph(nodes, edges) {
  const nodeMap = new Map();
  const incoming = new Map();
  const outgoing = new Map();
  const indegree = new Map();

  nodes.forEach((node) => {
    if (node.id === undefined || node.id === null || node.id === "") {
      throw new Error("每个流程节点都必须包含 id");
    }
    if (nodeMap.has(node.id)) {
      throw new Error(`流程节点 id 重复：${node.id}`);
    }
    nodeMap.set(node.id, node);
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      throw new Error(`连线 ${edge.source} → ${edge.target} 引用了不存在的节点`);
    }
    outgoing.get(edge.source).push(edge.target);
    incoming.get(edge.target).push(edge.source);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  });

  return { nodeMap, incoming, outgoing, indegree };
}

function getRanks(nodes, graph) {
  const { incoming, outgoing, indegree } = graph;
  const ranks = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index];
    visited += 1;
    outgoing.get(sourceId).forEach((targetId) => {
      ranks.set(targetId, Math.max(ranks.get(targetId), ranks.get(sourceId) + 1));
      indegree.set(targetId, indegree.get(targetId) - 1);
      if (indegree.get(targetId) === 0) queue.push(targetId);
    });
  }

  if (visited !== nodes.length) {
    throw new Error("流程连线不能形成循环，请检查节点之间的指向关系");
  }

  const columns = Array.from(
    { length: Math.max(...ranks.values()) + 1 },
    () => [],
  );
  nodes.forEach((node) => columns[ranks.get(node.id)].push(node));

  // 重心排序只用于减少交叉，不改变图结构。
  return { columns, incoming, outgoing, ranks };
}

function averageNeighborPosition(nodeId, neighbors, positions) {
  const values = (neighbors.get(nodeId) || [])
    .map((id) => positions.get(id))
    .filter((value) => value !== undefined);
  if (!values.length) return positions.get(nodeId) || 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function orderColumns(columns, incoming, outgoing) {
  const positions = new Map();
  const updatePositions = (column) => {
    column.forEach((node, index) => positions.set(node.id, index));
  };
  columns.forEach(updatePositions);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let index = 1; index < columns.length; index += 1) {
      columns[index].sort(
        (a, b) =>
          averageNeighborPosition(a.id, incoming, positions) -
          averageNeighborPosition(b.id, incoming, positions),
      );
      updatePositions(columns[index]);
    }
    for (let index = columns.length - 2; index >= 0; index -= 1) {
      columns[index].sort(
        (a, b) =>
          averageNeighborPosition(a.id, outgoing, positions) -
          averageNeighborPosition(b.id, outgoing, positions),
      );
      updatePositions(columns[index]);
    }
  }
}

export function createFlowLayout(nodes, edges, availableWidth) {
  if (!nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };

  const graph = createGraph(nodes, edges);
  const { columns, incoming, outgoing, ranks } = getRanks(nodes, graph);
  const hasLongEdges = edges.some(
    (edge) => ranks.get(edge.target) - ranks.get(edge.source) > 1,
  );
  orderColumns(columns, incoming, outgoing);

  const containerWidth = Number.isFinite(availableWidth) && availableWidth > 0
    ? availableWidth
    : DEFAULT_WIDTH;
  const targetWidth = Math.max(containerWidth, MIN_WIDTH);
  const columnCount = columns.length;
  const columnGap = columnCount > 1
    ? Math.max(
        MIN_COLUMN_GAP,
        (targetWidth - HORIZONTAL_PADDING * 2) / (columnCount - 1),
      )
    : 0;
  const width = columnCount > 1
    ? HORIZONTAL_PADDING * 2 + columnGap * (columnCount - 1)
    : targetWidth;
  const maxRows = Math.max(...columns.map((column) => column.length));
  const height = Math.max(
    MIN_HEIGHT,
    VERTICAL_PADDING * 2 + (maxRows - 1) * ROW_GAP,
  ) + (hasLongEdges ? ROW_GAP : 0);

  const positionedNodes = columns.flatMap((column, columnIndex) => {
    const x = columnCount === 1
      ? width / 2
      : HORIZONTAL_PADDING + columnIndex * columnGap;
    return column.map((node, rowIndex) => ({
      ...node,
      x,
      y: height / 2 + (rowIndex - (column.length - 1) / 2) * ROW_GAP,
      rank: columnIndex,
    }));
  });
  const positionedMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedEdges = edges.map((edge) => ({
    source: positionedMap.get(edge.source),
    target: positionedMap.get(edge.target),
  }));
  const outgoingEdges = new Map(positionedNodes.map((node) => [node.id, []]));
  const incomingEdges = new Map(positionedNodes.map((node) => [node.id, []]));
  positionedEdges.forEach((edge) => {
    outgoingEdges.get(edge.source.id).push(edge);
    incomingEdges.get(edge.target.id).push(edge);
  });

  positionedEdges.forEach((edge) => {
    const siblings = outgoingEdges.get(edge.source.id);
    const predecessors = incomingEdges.get(edge.target.id);
    edge.isBranch = siblings.length > 1;
    edge.isMerge = predecessors.length > 1;
    edge.isLong = edge.target.rank - edge.source.rank > 1;
    if (edge.isBranch) {
      edge.branchX = edge.source.x + columnGap * 0.45;
    }
    if (edge.isMerge) {
      edge.mergeX = edge.target.x - columnGap * 0.45;
    }
    if (!edge.isLong) return;

    edge.departX = edge.isBranch
      ? edge.branchX
      : edge.source.x + columnGap * 0.5;
    edge.arriveX = edge.isMerge
      ? edge.mergeX
      : edge.target.x - columnGap * 0.5;
    const intermediateY = positionedNodes
      .filter((node) => node.rank > edge.source.rank && node.rank < edge.target.rank)
      .map((node) => node.y);
    const upperRouteY = Math.min(...intermediateY) - ROW_GAP / 2;
    const lowerRouteY = Math.max(...intermediateY) + ROW_GAP / 2;
    const desiredY = (edge.source.y + edge.target.y) / 2;
    edge.routeY = Math.abs(upperRouteY - desiredY) <= Math.abs(lowerRouteY - desiredY)
      ? upperRouteY
      : lowerRouteY;
  });

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    width,
    height,
  };
}

function createDirectPath(edge) {
  const deltaX = edge.target.x - edge.source.x;
  const deltaY = edge.target.y - edge.source.y;
  const distance = Math.hypot(deltaX, deltaY);
  const offset = NODE_RADIUS + 2;
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const startX = edge.source.x + unitX * offset;
  const startY = edge.source.y + unitY * offset;
  const endX = edge.target.x - unitX * offset;
  const endY = edge.target.y - unitY * offset;

  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

function createLongOrthogonalPath(edge) {
  const offset = NODE_RADIUS + 2;
  const startX = edge.source.x + offset;
  const endX = edge.target.x - offset;

  return `M ${startX} ${edge.source.y} H ${edge.departX} V ${edge.routeY} H ${edge.arriveX} V ${edge.target.y} H ${endX}`;
}

function createNodeOrthogonalPath(edge) {
  if (edge.isLong) return createLongOrthogonalPath(edge);
  const offset = NODE_RADIUS + 2;
  const startX = edge.source.x + offset;
  const endX = edge.target.x - offset;
  const middleX = (startX + endX) / 2;
  if (edge.source.y === edge.target.y) {
    return `M ${startX} ${edge.source.y} H ${middleX} H ${endX}`;
  }

  return `M ${startX} ${edge.source.y} H ${middleX} V ${edge.target.y} H ${endX}`;
}

function clampTurnPosition(value, startX, endX) {
  const min = startX + 12;
  const max = endX - 12;
  return Math.min(max, Math.max(min, value));
}

function createExternalBranchPath(edge) {
  if (edge.isLong) return createLongOrthogonalPath(edge);
  const offset = NODE_RADIUS + 2;
  const startX = edge.source.x + offset;
  const endX = edge.target.x - offset;
  const startY = edge.source.y;
  const endY = edge.target.y;
  const middleX = (startX + endX) / 2;
  const branchX = edge.isBranch
    ? clampTurnPosition(edge.branchX ?? middleX, startX, endX)
    : null;
  const mergeX = edge.isMerge
    ? clampTurnPosition(edge.mergeX ?? middleX, startX, endX)
    : null;

  if (branchX !== null && mergeX !== null && branchX < mergeX) {
    if (startY === endY) {
      return `M ${startX} ${startY} H ${branchX} H ${mergeX} H ${endX}`;
    }
    const middleY = (startY + endY) / 2;
    return `M ${startX} ${startY} H ${branchX} V ${middleY} H ${mergeX} V ${endY} H ${endX}`;
  }

  const turnX = branchX !== null && mergeX !== null
    ? middleX
    : branchX ?? mergeX ?? middleX;
  if (startY === endY) {
    return `M ${startX} ${startY} H ${turnX} H ${endX}`;
  }
  return `M ${startX} ${startY} H ${turnX} V ${endY} H ${endX}`;
}

export function createEdgePath(edge, options = {}) {
  const { branchFromNode = false, branchLineType = "direct" } = options;
  const isMultiBranch = edge.isBranch || edge.isMerge;
  if (!isMultiBranch) return createDirectPath(edge);
  if (!branchFromNode) return createExternalBranchPath(edge);
  if (branchLineType === "orthogonal") return createNodeOrthogonalPath(edge);
  return createDirectPath(edge);
}
