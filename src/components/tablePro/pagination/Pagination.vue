<script setup>
/**
 * TablePro 分页组件
 * 基于 element-plus ElPagination 二次封装，统一分页 UI 与交互：
 *  - 由父组件通过 v-model 传入 pagerConfig（currentPage / pageSize / total / pageSizes）
 *  - size-change / current-change 时通过 emit('change') 抛出最新分页信息
 *  - 父组件可据此决定走远程（useTable）还是静态（更新 pagerConfig）逻辑
 *  - beforePageChange 前置拦截：返回 false 或 Promise reject（含 resolve 为 false）
 *    时阻止本次切换并回滚 UI（类似 el-upload 的 before-upload / el-switch 的 before-change）
 */
import { computed, ref } from "vue";

const props = defineProps({
  // 是否显示分页（外层控制）
  visible: { type: Boolean, default: true },
  // 分页配置：{ currentPage, pageSize, total, pageSizes }
  pagerConfig: {
    type: Object,
    default: () => ({ currentPage: 1, pageSize: 10, total: 0 }),
  },
  // 可选分页大小列表（覆盖 pagerConfig.pageSizes）
  pageSizes: {
    type: Array,
    default: () => [10, 20, 50, 100],
  },
  // 分页布局（element-plus layout）
  layout: {
    type: String,
    default: "total, sizes, prev, pager, next, jumper",
  },
  // 是否使用背景色
  background: { type: Boolean, default: true },
  // 分页切换前置拦截函数（类似 el-upload 的 before-upload / el-switch 的 before-change）
  // 入参：{ type: 'size' | 'page', currentPage, pageSize, oldPager, newPager }
  //   · type 'size'：切换每页条数（newPager.currentPage 会重置为 1）
  //   · type 'page'：切换当前页码
  // 返回 false、Promise reject、或 Promise resolve 为 false → 阻止本次切换并回滚 UI
  beforePageChange: { type: Function, default: null },
});

const emit = defineEmits([
  // 双向更新 pagerConfig（v-model:pagerConfig）
  "update:pagerConfig",
  // size-change：每页条数变化
  "size-change",
  // current-change：当前页变化
  "current-change",
  // 任意变化统一出口：抛出最新 pagerConfig
  "change",
]);

// 实际生效的 pageSizes：优先使用 pagerConfig.pageSizes，否则使用 props.pageSizes
const finalPageSizes = computed(
  () => props.pagerConfig?.pageSizes || props.pageSizes,
);

// 异步守卫进行中标记：守卫等待期间忽略新的分页交互，避免连续切换导致状态错乱
const guardPending = ref(false);
// 守卫拦截后强制 el-pagination 重挂载的 key（回滚机制见 rollback 注释）
const paginationKey = ref(0);

// 每页条数变化
const handleSizeChange = (size) => {
  if (size === props.pagerConfig.pageSize) return;
  applyChange("size", { pageSize: size, currentPage: 1 });
};

// 当前页变化
const handleCurrentChange = (page) => {
  if (page === props.pagerConfig.currentPage) return;
  applyChange("page", { currentPage: page });
};

// 统一切换入口：先过 beforePageChange 守卫，通过后才真正提交
const applyChange = (type, partial) => {
  const oldPager = { ...props.pagerConfig };
  const newPager = { ...props.pagerConfig, ...partial };
  const ctx = {
    type,
    currentPage: newPager.currentPage,
    pageSize: newPager.pageSize,
    oldPager,
    newPager,
  };
  // 未配置守卫：保持原有同步 emit 时序，零额外开销
  if (!props.beforePageChange) {
    commit(newPager, type);
    return;
  }
  if (guardPending.value) return;
  guardPending.value = true;
  Promise.resolve()
    .then(() => props.beforePageChange(ctx))
    .then((ret) => {
      // false（同步或 Promise resolve 为 false）→ 拦截；其余放行
      if (ret === false) {
        rollback();
        return;
      }
      commit(newPager, type);
    })
    .catch(() => rollback()) // Promise reject → 拦截
    .finally(() => {
      guardPending.value = false;
    });
};

// 守卫通过后提交切换（事件顺序与原实现保持一致）
const commit = (newPager, type) => {
  emit("update:pagerConfig", newPager);
  if (type === "size") emit("size-change", newPager.pageSize);
  else emit("current-change", newPager.currentPage);
  emit("change", newPager);
};

// 守卫拦截后的回滚：el-pagination 的页码按钮 / 跳转输入框均受控于
// currentPage props（不改 props 自动回显旧值），但 sizes 下拉内部的
// innerPageSize 是乐观更新（用户选择后立即变更显示，仅当 props.pageSize
// 变化时才同步回 props 值），拦截时 props 不变会导致下拉停留在新值，
// 故递增 key 强制 el-pagination 重挂载，按 props 重置全部内部状态
const rollback = () => {
  paginationKey.value += 1;
};
</script>

<template>
  <div v-if="visible" class="table-pro-pagination">
    <el-pagination
      :key="paginationKey"
      :current-page="pagerConfig.currentPage"
      :page-size="pagerConfig.pageSize"
      :total="pagerConfig.total"
      :page-sizes="finalPageSizes"
      :layout="layout"
      :background="background"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />
  </div>
</template>

<style lang="scss" scoped>
// 工具栏图标按钮间距（与 tablePro/index.vue 保持一致）
$table-toolbar-gap: 12px;

.table-pro-pagination {
  // 弹性布局：在 table-pro 容器中作为独立一行，不被表格压缩
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  // 左右内边距与工具栏一致（= 按钮间距），保证分页与工具栏左右对齐
  padding: 8px $table-toolbar-gap;
  border-top: 1px solid var(--el-border-color-light, #ebeef5);
}
</style>
