<script setup>
/**
 * TablePro 分页组件
 * 基于 element-plus ElPagination 二次封装，统一分页 UI 与交互：
 *  - 由父组件通过 v-model 传入 pagerConfig（currentPage / pageSize / total / pageSizes）
 *  - size-change / current-change 时通过 emit('change') 抛出最新分页信息
 *  - 父组件可据此决定走远程（useTable）还是静态（更新 pagerConfig）逻辑
 */
import { computed } from "vue";

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

// 每页条数变化
const handleSizeChange = (size) => {
  const newPager = {
    ...props.pagerConfig,
    pageSize: size,
    currentPage: 1,
  };
  emit("update:pagerConfig", newPager);
  emit("size-change", size);
  emit("change", newPager);
};

// 当前页变化
const handleCurrentChange = (page) => {
  const newPager = {
    ...props.pagerConfig,
    currentPage: page,
  };
  emit("update:pagerConfig", newPager);
  emit("current-change", page);
  emit("change", newPager);
};
</script>

<template>
  <div v-if="visible" class="table-pro-pagination">
    <el-pagination
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
