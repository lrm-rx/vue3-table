<script setup>
import { computed, ref } from "vue";
import ElectronicFlow from "@/components/electronicFlow/index.vue";
import { STATUS_COLORS } from "@/components/electronicFlow/layout";

const showHandler = ref(true);
const allowChange = ref(true);
const branchFromNode = ref(false);
const branchLineType = ref("direct");
const activeNodeId = ref("submit");
const lastClick = ref("暂无");
const lastChange = ref("发起申请（初始节点）");

const nodes = [
  {
    id: "submit",
    name: "发起申请",
    time: "2026-11-28 09:00",
    handler: "张三",
    status: "completed",
  },
  {
    id: "department",
    name: "部门负责人审批",
    time: "2026-11-28 09:26",
    handler: "李四",
    status: "completed",
  },
  {
    id: "finance",
    name: "财务审批",
    time: "2026-11-28 10:30",
    handler: "王五",
    status: "processing",
  },
  {
    id: "hr",
    name: "人事会签",
    status: "pending",
  },
  {
    id: "compliance",
    name: "合规复核",
    time: "2026-11-28 10:18",
    handler: "赵六",
    status: "rejected",
  },
  {
    id: "manager",
    name: "分管负责人审批",
    status: "pending",
  },
  {
    id: "archive",
    name: "流程归档",
    status: "pending",
  },
];

const edges = [
  { source: "submit", target: "department" },
  { source: "department", target: "finance" },
  { source: "department", target: "hr" },
  { source: "department", target: "compliance" },
  { source: "finance", target: "manager" },
  { source: "hr", target: "manager" },
  { source: "compliance", target: "manager" },
  { source: "manager", target: "archive" },
];

const statusLegend = [
  { label: "未流转", color: STATUS_COLORS.pending },
  { label: "已完成", color: STATUS_COLORS.completed },
  { label: "进行中", color: STATUS_COLORS.processing },
  { label: "已驳回", color: STATUS_COLORS.rejected },
];

const activeNode = computed(
  () => nodes.find((node) => node.id === activeNodeId.value) || nodes[0],
);

function beforeNodeChange() {
  return allowChange.value;
}

function handleNodeClick(node) {
  lastClick.value = `${node.name}（${allowChange.value ? "允许切换" : "已拦截"}）`;
}

function handleNodeChange(node, previousNode) {
  lastChange.value = `${previousNode?.name || "无"} → ${node.name}`;
}
</script>

<template>
  <div class="flow-demo">
    <el-card shadow="never" class="flow-demo__panel">
      <template #header>
        <div class="flow-demo__header">
          <div>
            <div class="flow-demo__title">电子流程图 ElectronicFlow</div>
            <div class="flow-demo__subtitle">D3.js 分层布局 · 支持多分支与合并</div>
          </div>
          <div class="flow-demo__controls">
            <el-switch
              v-model="showHandler"
              active-text="悬浮显示处理人"
            />
            <el-switch
              v-model="allowChange"
              active-text="允许切换"
            />
          </div>
        </div>
      </template>

      <el-alert
        title="默认分支在节点外部分岔和汇合；开启“从节点出发/合并”后，可选择直连或直角线。点击非灰色节点可切换下方页面。"
        type="info"
        :closable="false"
        show-icon
        class="flow-demo__description"
      />

      <div class="flow-demo__branch-config">
        <el-switch
          v-model="branchFromNode"
          active-text="从节点出发/合并"
        />
        <el-radio-group
          v-model="branchLineType"
          :disabled="!branchFromNode"
          size="small"
          aria-label="分支线型"
        >
          <el-radio-button value="direct">直连</el-radio-button>
          <el-radio-button value="orthogonal">直角线</el-radio-button>
        </el-radio-group>
        <span class="flow-demo__branch-mode">
          {{ branchFromNode
            ? (branchLineType === "direct" ? "当前：从节点圆周直连" : "当前：从节点以直角线连接")
            : "当前：在节点外公共点分岔/汇合"
          }}
        </span>
      </div>

      <div class="flow-demo__legend" aria-label="流程状态图例">
        <span v-for="item in statusLegend" :key="item.label" class="flow-demo__legend-item">
          <i class="flow-demo__legend-dot" :style="{ backgroundColor: item.color }" />
          <span :style="{ color: item.color }">{{ item.label }}</span>
        </span>
      </div>

      <div class="flow-demo__chart">
        <ElectronicFlow
          v-model:active-node-id="activeNodeId"
          :nodes="nodes"
          :edges="edges"
          :show-handler="showHandler"
          :branch-from-node="branchFromNode"
          :branch-line-type="branchLineType"
          :before-change="beforeNodeChange"
          @click="handleNodeClick"
          @change="handleNodeChange"
        />
      </div>

      <section :key="activeNode.id" class="flow-demo__node-page">
        <div class="flow-demo__node-page-label">当前节点页面</div>
        <h3>{{ activeNode.name }}</h3>
        <p>此处可根据节点 id 渲染对应的业务页面或动态组件。</p>
      </section>

      <div class="flow-demo__events">
        <span>最近点击：{{ lastClick }}</span>
        <span>最近 change：{{ lastChange }}</span>
      </div>

      <div class="flow-demo__footer">
        调整浏览器宽度或折叠侧边栏可查看自适应效果；空间不足时可横向滚动，节点文字不会缩小。
      </div>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.flow-demo {
  width: 100%;
  min-width: 0;

  &__panel {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  &__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  &__title {
    color: #303133;
    font-size: 16px;
    font-weight: 600;
  }

  &__subtitle {
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
  }

  &__description {
    margin-bottom: 16px;
  }

  &__branch-config {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 16px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background: #fff;
  }

  &__branch-mode {
    color: #909399;
    font-size: 12px;
  }

  &__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    padding: 0 4px 12px;
    font-size: 13px;
  }

  &__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &__legend-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  &__chart {
    padding: 8px 0;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #fcfdff;
  }

  &__node-page {
    margin-top: 16px;
    padding: 16px 20px;
    border-left: 3px solid #409eff;
    border-radius: 4px;
    background: #fff;

    h3 {
      margin: 6px 0;
      color: #303133;
      font-size: 17px;
    }

    p {
      margin: 0;
      color: #909399;
      font-size: 13px;
    }
  }

  &__node-page-label {
    color: #409eff;
    font-size: 12px;
    font-weight: 600;
  }

  &__events {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin-top: 12px;
    color: #606266;
    font-size: 12px;
  }

  &__footer {
    margin-top: 12px;
    color: #909399;
    font-size: 12px;
    line-height: 1.6;
  }
}

@media (max-width: 640px) {
  .flow-demo__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
