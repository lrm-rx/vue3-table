<script setup>
/**
 * 输入框 + 多选 checkbox 过滤
 * - 输入框用于过滤下方 checkbox 选项（实时过滤）
 * - 全选 / 取消全选：仅作用于当前（过滤后）可见项
 * - 若未配置 options（无数据），则不显示多选组件，并提示「无匹配数据」
 *   过滤后无可见项时同样提示「无匹配数据」
 *
 * 远程选项模式：
 *   - 若 tablePro 注入了 fetchFilterOptions（即传入了 requestFilterAPI），
 *     则每次面板打开时（filterRefetchCounter 变化）自动重新调用接口拉取选项；
 *     （使用 watch + counter 而非仅 onMounted，避免 vxe 组件复用导致数据串列或级联条件变化后取到旧数据）
 *   - 接口返回的数据已由 tablePro 按 filterLabelKey / filterValueKey
 *     映射为统一的 { label, value } 结构；
 *   - 未传入 requestFilterAPI 时，回退到列配置 filterRender.props.options。
 *
 * 选项顺序：始终保持选项的原始顺序（不再将已选值置顶），避免勾选/取消时出现跳动
 *
 * 布局：搜索框固定在顶部（flex-shrink:0），选项列表在剩余空间内滚动；
 *       checkbox 标签超长时省略号显示，hover 时通过 title 提示完整文本。
 */
import { computed, ref, inject, watch } from 'vue'

const props = defineProps({
  option: { type: Object, required: true },
  renderOpts: { type: Object, default: () => ({}) },
  // 当前列的 field（由 FilterPanel 从 params.column.field 透传）
  field: { type: String, default: '' },
})

const ctx = inject('tableProFilterContext', null)

// 静态选项（来自列配置 filterRender.props.options）
const staticOptions = computed(() => props.renderOpts?.props?.options || [])

// 远程拉取的选项
const remoteOptions = ref([])
const loading = ref(false)

// 是否使用远程接口拉取选项
const useRemote = computed(
  () =>
    typeof ctx?.fetchFilterOptions === 'function' &&
    ctx?.hasRemoteFilterAPI?.() === true,
)

// 实际使用的选项：远程模式使用 remoteOptions，否则使用 staticOptions
const options = computed(() =>
  useRemote.value ? remoteOptions.value : staticOptions.value,
)

const search = computed({
  get: () => props.option.data?.search ?? '',
  set: (v) => {
    props.option.data.search = v
  },
})

const selected = computed({
  get: () => props.option.data?.values ?? [],
  set: (v) => {
    props.option.data.values = v
  },
})

// 经搜索框过滤后的可见选项（始终保持选项原始顺序，不再将已选值置顶）
const filteredOptions = computed(() => {
  const kw = (search.value || '').toLowerCase()
  if (!kw) return options.value
  return options.value.filter((o) =>
    String(o.label ?? o.value).toLowerCase().includes(kw),
  )
})

// 是否存在已配置的选项
const hasOptions = computed(() => options.value.length > 0)
const noMatch = computed(
  () => filteredOptions.value.length === 0,
)

// 全选状态（仅针对当前可见项）
const allChecked = computed({
  get: () =>
    filteredOptions.value.length > 0 &&
    filteredOptions.value.every((o) => selected.value.includes(o.value)),
  set: (v) => {
    const cur = new Set(selected.value)
    if (v) {
      filteredOptions.value.forEach((o) => cur.add(o.value))
    } else {
      filteredOptions.value.forEach((o) => cur.delete(o.value))
    }
    selected.value = [...cur]
  },
})

const indeterminate = computed(() => {
  const sel = selected.value
  const some = filteredOptions.value.some((o) => sel.includes(o.value))
  return some && !allChecked.value
})

// 远程拉取选项（封装为可复用函数）
const doFetchOptions = async () => {
  if (!useRemote.value || typeof ctx.fetchFilterOptions !== 'function') return
  loading.value = true
  try {
    const res = await ctx.fetchFilterOptions(props.field)
    remoteOptions.value = res || []
  } catch {
    remoteOptions.value = []
  } finally {
    loading.value = false
  }
}

// 每次面板打开时（filterRefetchCounter[field] 变化）都重新拉取选项
// 同时监听 field 变化，避免 vxe 组件复用导致数据串列
watch(
  [
    () => props.field,
    () => (ctx?.filterRefetchCounter && props.field ? ctx.filterRefetchCounter[props.field] : 0),
  ],
  async ([field]) => {
    if (!field) return
    // 拉取选项（级联条件可能已变化，必须重新取）
    await doFetchOptions()
  },
  { immediate: true },
)
</script>

<template>
  <div class="filter-checkbox">
    <el-input
      v-model="search"
      placeholder="搜索选项"
      clearable
      class="filter-checkbox__search"
    />

    <div v-if="loading" class="filter-checkbox__empty">加载中...</div>
    <template v-else-if="hasOptions">
      <div v-if="!noMatch" class="filter-checkbox__list">
        <el-checkbox
          v-model="allChecked"
          :indeterminate="indeterminate"
          class="filter-checkbox__all"
        >
          全选
        </el-checkbox>
        <el-checkbox-group v-model="selected" class="filter-checkbox__group">
          <el-checkbox
            v-for="o in filteredOptions"
            :key="o.value"
            :value="o.value"
            :title="String(o.label ?? o.value)"
          >
            {{ o.label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <div v-else class="filter-checkbox__empty">无匹配数据</div>
    </template>
    <div v-else class="filter-checkbox__empty">无匹配数据</div>
  </div>
</template>

<style scoped lang="scss">
.filter-checkbox {
  // 撑满 FilterPanel body 的剩余高度，搜索框固定 + 列表滚动
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  &__search {
    flex-shrink: 0;
    margin-bottom: 6px;
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  &__group {
    display: flex;
    flex-direction: column;
    margin-top: 2px;

    // 缩小 el-checkbox-group 内部每个 checkbox 之间的垂直间距
    :deep(.el-checkbox) {
      margin-right: 0;
      margin-bottom: 0;
      height: 22px;
      // 标签超长省略，hover 时通过 title 提示完整文本
      .el-checkbox__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  &__all {
    flex-shrink: 0;
    margin-bottom: 2px;
  }

  // 缩小「全选」checkbox 与下方 group 的视觉距离
  :deep(.el-checkbox) {
    margin-right: 0;
    height: 22px;
  }

  &__empty {
    flex-shrink: 0;
    color: var(--el-text-color-secondary, #909399);
    font-size: 12px;
    text-align: center;
    padding: 12px 0;
  }
}
</style>
