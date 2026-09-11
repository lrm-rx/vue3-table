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
 * 本地提取模式（localFilterSort=true）：
 *   - 未配置静态 options（或为空数组）时，每次面板打开通过
 *     ctx.getLocalCheckboxOptions(field) 从「前端分页前的全量数据」提取去重选项；
 *   - 提取时仅叠加其他列已确认的过滤条件，不含当前列自身 ——
 *     该列确认过滤后再次打开面板，仍显示过滤前的完整选项集合。
 *
 * 选项顺序：始终保持选项的原始顺序（不再将已选值置顶），避免勾选/取消时出现跳动
 *
 * 超高基数（数万选项）虚拟滚动：
 *   - 列表采用定高虚拟滚动（行高 22px，窗口计算见 virtualList.js），
 *     DOM 中只保留「可视窗口 + overscan」内的 checkbox（通常 20~40 个），
 *     不随选项总数增长；占位容器撑开滚动条，已渲染节点用 transform 定位；
 *   - 「全选」行吸顶（sticky），滚动时始终可见；全选语义仍作用于过滤后的全部项
 *     （allChecked/indeterminate 基于完整 filteredOptions 计算，与渲染窗口无关）；
 *   - 勾选状态存于 option.data.values，节点回收/复用不影响已选值。
 *
 * 布局：搜索框固定在顶部（flex-shrink:0），选项列表在剩余空间内滚动；
 *       checkbox 标签超长时省略号显示，hover 时通过 title 提示完整文本。
 */
import { computed, ref, inject, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import {
  ITEM_HEIGHT,
  OVERSCAN,
  HEADER_HEIGHT,
  getVisibleRange,
} from './virtualList.js'

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
// 本地全量数据提取的选项（无静态 options 且 localFilterSort=true 时使用）
const localOptions = ref([])
const loading = ref(false)

// 是否使用远程接口拉取选项
const useRemote = computed(
  () =>
    typeof ctx?.fetchFilterOptions === 'function' &&
    ctx?.hasRemoteFilterAPI?.() === true,
)

// 是否从本地全量数据提取选项：非远程模式 + 未配置静态 options（或为空数组）
const useLocalExtract = computed(
  () =>
    !useRemote.value &&
    staticOptions.value.length === 0 &&
    typeof ctx?.getLocalCheckboxOptions === 'function',
)

// 实际使用的选项：远程 > 静态 options（非空）> 本地全量数据提取
const options = computed(() => {
  if (useRemote.value) return remoteOptions.value
  if (staticOptions.value.length > 0) return staticOptions.value
  return localOptions.value
})

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

// ========== 定高虚拟滚动 ==========
// 列表滚动容器（同时是吸顶全选行的定位上下文）
const listRef = ref(null)
const scrollTop = ref(0)
// ResizeObserver 测量容器高度（面板高度随表格 body / 密度切换变化）
const { height: listHeight } = useElementSize(listRef)

// 可视窗口（扣除吸顶全选行；scrollTop 同样扣除头部偏移，使首行索引计算准确）
const visibleRange = computed(() =>
  getVisibleRange({
    total: filteredOptions.value.length,
    scrollTop: Math.max(0, scrollTop.value - HEADER_HEIGHT),
    viewportHeight: Math.max(0, listHeight.value - HEADER_HEIGHT),
    itemHeight: ITEM_HEIGHT,
    overscan: OVERSCAN,
  }),
)
// 当前真正渲染的选项（窗口切片）
const visibleOptions = computed(() =>
  filteredOptions.value.slice(visibleRange.value.start, visibleRange.value.end),
)
// 占位容器高度 = 全部选项总高（撑开滚动条；无论渲染多少 DOM 节点）
const totalContentHeight = computed(
  () => filteredOptions.value.length * ITEM_HEIGHT,
)

const onListScroll = (e) => {
  scrollTop.value = e.target.scrollTop
}

// 选项集合变化（重新拉取 / 搜索关键字 / 级联收敛）时回到顶部，
// 避免滚动位置停留在已不存在的区间；同时复位滚动容器避免 scrollTop 越界
watch(filteredOptions, () => {
  scrollTop.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
})

// 刷新选项（封装为可复用函数）：远程模式走接口，本地提取模式从全量数据计算
const doFetchOptions = async () => {
  if (useRemote.value) {
    if (typeof ctx.fetchFilterOptions !== 'function') return
    loading.value = true
    try {
      const res = await ctx.fetchFilterOptions(props.field)
      remoteOptions.value = res || []
    } catch {
      remoteOptions.value = []
    } finally {
      loading.value = false
    }
    return
  }
  if (useLocalExtract.value) {
    // 同步提取：面板每次打开都会重新执行，确保级联条件（其他列过滤）为最新
    localOptions.value = ctx.getLocalCheckboxOptions(props.field) || []
  }
}

// 每次面板打开时（filterRefetchCounter[field] 变化）都重新拉取/提取选项
// 同时监听 field 与选项模式变化，避免 vxe 组件复用导致数据串列
watch(
  [
    () => props.field,
    () => (ctx?.filterRefetchCounter && props.field ? ctx.filterRefetchCounter[props.field] : 0),
    () => useRemote.value,
    () => useLocalExtract.value,
  ],
  async ([field]) => {
    if (!field) return
    // 刷新选项（远程级联条件 / 本地其他列过滤可能已变化，必须重新取）
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
      <div
        v-if="!noMatch"
        ref="listRef"
        class="filter-checkbox__list"
        @scroll.passive="onListScroll"
      >
        <!-- 吸顶全选：作用于过滤后的全部项（与虚拟窗口无关） -->
        <div class="filter-checkbox__list-header">
          <el-checkbox v-model="allChecked" :indeterminate="indeterminate">
            全选
          </el-checkbox>
        </div>
        <!-- 占位容器按全部选项总高撑开滚动条 -->
        <div
          class="filter-checkbox__virtual"
          :style="{ height: `${totalContentHeight}px` }"
        >
          <!-- 仅渲染窗口内节点，绝对定位 + transform 到各自行位置 -->
          <el-checkbox-group v-model="selected" class="filter-checkbox__group">
            <el-checkbox
              v-for="(o, i) in visibleOptions"
              :key="o.value"
              :value="o.value"
              :title="String(o.label ?? o.value)"
              class="filter-checkbox__item"
              :style="{
                transform: `translateY(${(visibleRange.start + i) * ITEM_HEIGHT}px)`,
              }"
            >
              {{ o.label }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
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
    // 单个滚动容器：吸顶全选行 + 虚拟占位区
    overflow-y: auto;
    position: relative;
  }

  // 吸顶「全选」行：滚动时常驻列表顶部，需不透明显色盖住下方划过的选项
  &__list-header {
    position: sticky;
    top: 0;
    z-index: 1;
    // 高度 = HEADER_HEIGHT（checkbox 22px + 下间距 2px），需与 virtualList.js 保持一致
    padding-bottom: 2px;
    background: var(--el-bg-color, #fff);

    :deep(.el-checkbox) {
      margin-right: 0;
      height: 22px;
    }
  }

  // 占位容器：高度 = 全部选项总高，只负责撑开滚动条
  &__virtual {
    position: relative;
    width: 100%;
  }

  // 绝对填充占位区，作为虚拟节点（absolute）的定位上下文
  &__group {
    position: absolute;
    inset: 0;
    display: block;
  }

  // 虚拟窗口内的单个选项：绝对定位（top 固定，translateY 决定行位置）
  :deep(.filter-checkbox__item) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    margin-right: 0;
    // 行高固定 22px = ITEM_HEIGHT（定高虚拟滚动的前提，勿改为 auto）
    height: 22px;
    display: flex;
    align-items: center;

    // 标签超长省略，hover 时通过 title 提示完整文本
    .el-checkbox__label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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
