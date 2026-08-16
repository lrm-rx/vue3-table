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
 * 选项排序：
 *   - 仅在用户尚未主动操作（hasUserInteracted = false）时，把默认已选值置顶
 *   - 用户一旦勾选/取消勾选后（hasUserInteracted = true），保持选项原始顺序
 */
import { computed, ref, inject, watch, nextTick } from 'vue'

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

// 用户是否已主动勾选/取消勾选过（用于控制选项排序行为）
// false：仅默认已选值置顶；true：保持选项原始顺序
const hasUserInteracted = ref(false)
// 记录面板打开时的初始已选值，用于判断用户是否修改了选择
const initialSelected = ref(null)

const search = computed({
  get: () => props.option.data?.search ?? '',
  set: (v) => {
    if (!props.option.data) props.option.data = { values: [], search: '' }
    props.option.data.search = v
  },
})

const selected = computed({
  get: () => props.option.data?.values ?? [],
  set: (v) => {
    if (!props.option.data) props.option.data = { values: [], search: '' }
    const prev = props.option.data.values || []
    props.option.data.values = v
    // 用户主动修改了勾选 → 标记已交互（保持原顺序不再置顶）
    if (initialSelected.value != null) {
      const prevSet = new Set(prev.map(String))
      const nextSet = new Set(v.map(String))
      const changed =
        prevSet.size !== nextSet.size ||
        [...prevSet].some((x) => !nextSet.has(x))
      if (changed) hasUserInteracted.value = true
    }
  },
})

// 经搜索框过滤后的可见选项
// - hasUserInteracted = false（默认状态）：已选值置顶，确保默认值在面板顶部可见
// - hasUserInteracted = true（用户已交互）：保持选项原始顺序
const filteredOptions = computed(() => {
  const kw = (search.value || '').toLowerCase()
  const base = !kw
    ? options.value
    : options.value.filter((o) =>
        String(o.label ?? o.value).toLowerCase().includes(kw),
      )
  // 用户已交互 → 保持原顺序（只做关键词过滤，不再置顶）
  if (hasUserInteracted.value) return base
  // 默认状态 → 已选值置顶（保持原相对顺序），未选值在后
  const sel = new Set(selected.value)
  const checked = []
  const unchecked = []
  base.forEach((o) => {
    if (sel.has(o.value)) checked.push(o)
    else unchecked.push(o)
  })
  return [...checked, ...unchecked]
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
    // 每次重新打开面板 / 切换列时，先复位交互标记与快照
    // （仅初始化默认值后，等待一个微任务再捕获快照，避免初始化写入误判为用户操作）
    hasUserInteracted.value = false
    initialSelected.value = null
    await nextTick()
    await nextTick()
    initialSelected.value = [...(props.option.data?.values ?? [])]
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
  &__search {
    margin-bottom: 6px;
  }

  &__list {
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
    }
  }

  &__all {
    margin-bottom: 2px;
  }

  // 缩小「全选」checkbox 与下方 group 的视觉距离
  :deep(.el-checkbox) {
    margin-right: 0;
    height: 22px;
  }

  &__empty {
    color: var(--el-text-color-secondary, #909399);
    font-size: 12px;
    text-align: center;
    padding: 12px 0;
  }
}
</style>
