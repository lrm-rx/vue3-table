<script setup>
/**
 * 过滤面板（渲染器面板内容）
 * - 动态渲染与 filterRender.name 对应的子过滤组件（FilterInput / FilterCheckbox / FilterDateRange / FilterNumberRange）
 * - 自定义 footer：el-button「重置」「确定」
 * - 通过 inject('tableProFilterContext') 与 tablePro 通信：
 *     确定 -> 收集「所有列过滤 + 排序」的组合参数，由 tablePro 以 filter-confirm 事件抛出
 *     重置 -> 清空当前列过滤条件（输入框等内容随之清空），并同步抛出最新的组合参数
 */
import { computed, inject, watchEffect } from 'vue'
import { FILTER_DEFAULTS, isFilterActive } from './filter-config.js'
import FilterInput from './FilterInput.vue'
import FilterCheckbox from './FilterCheckbox.vue'
import FilterDateRange from './FilterDateRange.vue'
import FilterNumberRange from './FilterNumberRange.vue'

const props = defineProps({
  // vxe 传入的渲染参数，含 { column, option, $table, $panel, ... }
  params: { type: Object, required: true },
  // 列上的 filterRender 配置，含 { name, props, attrs }
  renderOpts: { type: Object, default: () => ({}) },
})

const ctx = inject('tableProFilterContext', null)

const name = computed(() => props.renderOpts?.name || '')

const componentMap = {
  FilterInput,
  FilterCheckbox,
  FilterDateRange,
  FilterNumberRange,
}
const currentComp = computed(() => componentMap[name.value] || null)

// 当前列的过滤 option（其 data 为过滤状态对象，与子组件双向绑定）
const option = computed(() => props.params?.option)

// 当前列的 field（传给 FilterCheckbox 用于远程拉取选项）
const columnField = computed(() => props.params?.column?.field || '')

// 若列未显式声明 data，则按类型初始化（保证 v-model 可用）
watchEffect(() => {
  const opt = option.value
  const fac = FILTER_DEFAULTS[name.value]
  if (opt && opt.data == null && fac) opt.data = fac()
})

// 确定：收集组合参数 -> 抛出 filter-confirm -> 关闭面板
const onConfirm = () => {
  const opt = option.value
  // 标记当前列过滤是否激活（用于表头图标高亮）
  if (opt) opt.checked = isFilterActive(name.value, opt.data)
  // 传递 params 以便 tablePro 清除该列的草稿快照（确认后不再恢复）
  ctx?.emitConfirm?.(props.params)
  ctx?.closePanel?.(props.params)
}

// 重置：清空当前列过滤条件 -> 抛 filter-reset 事件（面板保持打开）
// 注意：opt.checked 由 clearCurrent（resetColumnFilter）内部设置，
//       有 initParam 默认值时 checked=true（恢复默认），无默认值时 checked=false（清空）
const onReset = () => {
  ctx?.clearCurrent?.(props.params)
  ctx?.emitReset?.(props.params)
}
</script>

<template>
  <div class="filter-panel">
    <div class="filter-panel__body">
      <component
        :is="currentComp"
        :option="option"
        :render-opts="renderOpts"
        :field="columnField"
        @confirm="onConfirm"
      />
    </div>
    <div class="filter-panel__footer">
      <el-button size="small" @click="onReset">重置</el-button>
      <el-button size="small" type="primary" @click="onConfirm">确定</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.filter-panel {
  min-width: 220px;
  max-width: min(92vw, 420px);
  box-sizing: border-box;
  padding: 4px 0;
  overflow-x: hidden;

  &__body {
    padding: 0 4px;
    width: 100%;
    box-sizing: border-box;

    // 所有直接子组件必须在面板宽度内，避免 el-date-range 等控件测量时把弹窗撑爆
    :deep(.el-date-editor),
    :deep(.el-input),
    :deep(.el-input-number),
    :deep(.el-select) {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box;
    }

    // el-date-picker daterange 有值时会出现清空按钮（.el-range__close-icon），
    // 需要确保内部 input wrapper 自适应，不被清空按钮撑宽
    :deep(.el-range-editor) {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;

      .el-range-input-wrapper {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
      }

      .el-range-input {
        min-width: 0;
        width: 100%;
      }
    }
  }

  &__footer {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 4px 4px;
    margin-top: 4px;
    border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
    box-sizing: border-box;
  }
}
</style>
