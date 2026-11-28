<script setup>
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { select } from "d3";
import {
  createEdgePath,
  createFlowLayout,
  NODE_RADIUS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "./layout";

const props = defineProps({
  nodes: {
    type: Array,
    default: () => [],
  },
  edges: {
    type: Array,
    default: () => [],
  },
  showHandler: {
    type: Boolean,
    default: true,
  },
  branchFromNode: {
    type: Boolean,
    default: false,
  },
  branchLineType: {
    type: String,
    default: "direct",
    validator: (value) => ["direct", "orthogonal"].includes(value),
  },
  activeNodeId: {
    type: [String, Number],
    default: null,
  },
  beforeChange: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(["click", "change", "update:activeNodeId"]);

const rootRef = ref();
const canvasRef = ref();
const svgRef = ref();
const errorMessage = ref("");
const currentNodeId = ref(props.activeNodeId);
const tooltip = reactive({
  visible: false,
  name: "",
  handler: "",
  x: 0,
  y: 0,
});

let resizeObserver;
let lastWidth = 0;

const getStatus = (node) => STATUS_COLORS[node.status] ? node.status : "pending";
const getColor = (node) => STATUS_COLORS[getStatus(node)];
const isSwitchable = (node) => getStatus(node) !== "pending";
const isActive = (node) => node.id === currentNodeId.value;
const canShowHandler = (node) => props.showHandler && isSwitchable(node);
const getNodeData = (id) => props.nodes.find((node) => node.id === id);

function hideTooltip() {
  tooltip.visible = false;
}

function moveTooltip(event) {
  if (!tooltip.visible || !rootRef.value) return;
  const rootRect = rootRef.value.getBoundingClientRect();
  const targetRect = event.currentTarget.getBoundingClientRect();
  const keyboardEvent = event.type === "focus";
  const clientX = keyboardEvent
    ? targetRect.left + targetRect.width / 2
    : event.clientX;
  const clientY = keyboardEvent ? targetRect.top : event.clientY;

  tooltip.x = clientX - rootRect.left;
  tooltip.y = clientY - rootRect.top;
}

function showTooltip(event, node) {
  if (!canShowHandler(node)) return;
  tooltip.name = node.name;
  tooltip.handler = node.handler || "未记录";
  tooltip.visible = true;
  moveTooltip(event);
}

function handleNodeClick(event, positionedNode) {
  if (!isSwitchable(positionedNode)) return;
  const node = getNodeData(positionedNode.id) || positionedNode;
  emit("click", node, event);
  if (isActive(node)) return;

  const previousNode = getNodeData(currentNodeId.value) || null;
  if (props.beforeChange && props.beforeChange(node, previousNode) !== true) {
    return;
  }

  currentNodeId.value = node.id;
  emit("update:activeNodeId", node.id);
  emit("change", node, previousNode);
}

function handleKeydown(event, node) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  handleNodeClick(event, node);
}

function renderChart() {
  hideTooltip();
  errorMessage.value = "";
  const svg = select(svgRef.value);
  svg.selectAll("*").remove();
  if (!props.nodes.length) return;

  let layout;
  try {
    layout = createFlowLayout(
      props.nodes,
      props.edges,
      canvasRef.value?.clientWidth,
    );
  } catch (error) {
    errorMessage.value = error.message;
    return;
  }

  svg
    .attr("width", layout.width)
    .attr("height", layout.height)
    .attr("viewBox", `0 0 ${layout.width} ${layout.height}`)
    .attr("role", "img")
    .attr("aria-label", "电子流程图");

  svg
    .append("g")
    .selectAll("path")
    .data(layout.edges)
    .join("path")
    .attr("class", "electronic-flow__edge")
    .attr("d", (edge) =>
      createEdgePath(edge, {
        branchFromNode: props.branchFromNode,
        branchLineType: props.branchLineType,
      }),
    );

  const nodeGroups = svg
    .append("g")
    .selectAll("g")
    .data(layout.nodes, (node) => node.id)
    .join("g")
    .attr("class", (node) =>
      `electronic-flow__node${isActive(node) ? " is-active" : ""}`,
    )
    .attr("transform", (node) => `translate(${node.x}, ${node.y})`);

  nodeGroups
    .append("circle")
    .attr("class", (node) =>
      `electronic-flow__circle${isSwitchable(node) ? " is-clickable" : ""}`,
    )
    .attr("r", NODE_RADIUS)
    .attr("fill", getColor)
    .attr("stroke", (node) => (isActive(node) ? getColor(node) : "#fff"))
    .attr("stroke-width", (node) => (isActive(node) ? 5 : 3))
    .attr("tabindex", (node) => (isSwitchable(node) ? 0 : null))
    .attr("role", (node) => (isSwitchable(node) ? "button" : "img"))
    .attr("aria-disabled", (node) => (isSwitchable(node) ? "false" : "true"))
    .attr("aria-pressed", (node) =>
      isSwitchable(node) ? String(isActive(node)) : null,
    )
    .attr("aria-label", (node) =>
      `${node.name}，${STATUS_LABELS[getStatus(node)]}`,
    )
    .on("mouseenter focus", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseleave blur", hideTooltip);

  nodeGroups
    .filter(isSwitchable)
    .select(".electronic-flow__circle")
    .on("click", handleNodeClick)
    .on("keydown", handleKeydown);

  nodeGroups
    .append("text")
    .attr("class", "electronic-flow__node-name")
    .attr("text-anchor", "middle")
    .attr("y", -28)
    .attr("fill", getColor)
    .text((node) => node.name);

  nodeGroups
    .append("text")
    .attr("class", "electronic-flow__node-time")
    .attr("text-anchor", "middle")
    .attr("y", 35)
    .attr("fill", getColor)
    .text((node) => node.time || "--");
}

function handleWindowResize() {
  renderChart();
}

watch(
  () => props.activeNodeId,
  (value) => {
    currentNodeId.value = value;
  },
);

watch(currentNodeId, () => nextTick(renderChart));

watch(
  () => [
    props.nodes,
    props.edges,
    props.showHandler,
    props.branchFromNode,
    props.branchLineType,
  ],
  () => nextTick(renderChart),
  { deep: true, flush: "post" },
);

onMounted(() => {
  renderChart();
  lastWidth = canvasRef.value?.clientWidth || 0;

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || 0;
      if (Math.abs(width - lastWidth) <= 1) return;
      lastWidth = width;
      renderChart();
    });
    resizeObserver.observe(canvasRef.value);
  } else {
    window.addEventListener("resize", handleWindowResize);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", handleWindowResize);
});

defineExpose({ refresh: renderChart });
</script>

<template>
  <div ref="rootRef" class="electronic-flow">
    <div
      v-show="nodes.length && !errorMessage"
      ref="canvasRef"
      class="electronic-flow__canvas"
      @scroll="hideTooltip"
    >
      <svg ref="svgRef" class="electronic-flow__svg" />
    </div>

    <div v-if="errorMessage" class="electronic-flow__state electronic-flow__state--error">
      {{ errorMessage }}
    </div>
    <div v-else-if="!nodes.length" class="electronic-flow__state">
      暂无流程数据
    </div>

    <div
      v-if="tooltip.visible"
      class="electronic-flow__tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      role="tooltip"
    >
      <div class="electronic-flow__tooltip-name">{{ tooltip.name }}</div>
      <div>处理人：{{ tooltip.handler }}</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.electronic-flow {
  position: relative;
  width: 100%;
  min-width: 0;

  &__canvas {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-gutter: stable;
  }

  &__svg {
    display: block;
    max-width: none;
    margin: 0 auto;
  }

  &__state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    color: #909399;
    font-size: 14px;
  }

  &__state--error {
    color: #f56c6c;
  }

  &__tooltip {
    position: absolute;
    z-index: 10;
    max-width: 220px;
    padding: 8px 12px;
    border-radius: 4px;
    background: #303133;
    box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
    color: #fff;
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 12px));
  }

  &__tooltip-name {
    margin-bottom: 2px;
    font-weight: 600;
  }

  :deep(.electronic-flow__edge) {
    fill: none;
    stroke: #c3c9d4;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :deep(.electronic-flow__circle) {
    cursor: default;
    outline: none;
    transition: filter 0.15s ease;
  }

  :deep(.electronic-flow__circle.is-clickable) {
    cursor: pointer;
  }

  :deep(.electronic-flow__circle.is-clickable:hover),
  :deep(.electronic-flow__circle.is-clickable:focus) {
    filter: drop-shadow(0 2px 4px rgb(0 0 0 / 25%));
  }

  :deep(.electronic-flow__node-name) {
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
    user-select: none;
  }

  :deep(.electronic-flow__node-time) {
    font-size: 12px;
    pointer-events: none;
    user-select: none;
  }
}
</style>
