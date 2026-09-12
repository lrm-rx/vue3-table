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
 *   - 「全选」行吸顶（sticky），滚动时始终可见；全选语义作用于当前选项集合
 *     （allChecked/indeterminate 基于完整 filteredOptions 计算，与渲染窗口无关）；
 *   - 勾选状态存于 option.data.values，节点回收/复用不影响已选值。
 *
 * 远程分页 + 联想搜索（filterRender.props.paged = true，且仅远程模式生效）：
 *   - 面板打开请求第 1 页（requestFilterAPI 收到 { field, filters, keyword, pageNum, pageSize }），
 *     滚到列表底部自动请求下一页并追加（去重），直到取满后端 total；
 *   - 搜索框输入走【后端联想】：防抖（searchDebounce，默认 300ms）后重置到第 1 页请求，
 *     不在前端对已加载页做本地过滤（避免「只能搜到当前页」）；
 *     非分页模式下搜索仍为前端实时过滤（静态/本地提取/旧式全量远程）；
 *   - 竞态防护：关键字快速变化/重开面板时递增请求序号，过期响应直接丢弃；
 *   - 已勾选值（含未加载页中的值）始终保留在 option.data.values，翻页/重搜不丢失；
 *   - 后端尚未分页（仍返回数组）时自动按单页处理，hasMore=false，可渐进接入；
 *   - 分页模式下「全选」作用于当前已加载的全部选项（跨已加载页，含虚拟窗口外节点）。
 *
 * 布局：搜索框固定在顶部（flex-shrink:0），选项列表在剩余空间内滚动；
 *       checkbox 标签超长时省略号显示，hover 时通过 title 提示完整文本。
 */
import { computed, ref, inject, watch } from 'vue'
import { useElementSize, useDebounceFn } from '@vueuse/core'
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

// 远程分页配置（仅远程模式生效），来自列配置 filterRender.props：
//   paged=true 开启；pageSize 默认 20；searchDebounce 默认 300ms；bottomDistance 触底阈值默认 60px
const remoteProps = computed(() => props.renderOpts?.props || {})
const pagedMode = computed(() => useRemote.value && remoteProps.value.paged === true)
const remotePageSize = computed(() => {
  const n = Number(remoteProps.value.pageSize)
  return n > 0 ? Math.floor(n) : 20
})
const remoteSearchDebounce = computed(() => {
  const n = Number(remoteProps.value.searchDebounce)
  return Number.isFinite(n) && n >= 0 ? n : 300
})
const remoteBottomDistance = computed(() => {
  const n = Number(remoteProps.value.bottomDistance)
  return n > 0 ? n : 60
})

// 实际使用的选项：远程 > 静态 options（非空）> 本地全量数据提取
const options = computed(() => {
  if (useRemote.value) return remoteOptions.value
  if (staticOptions.value.length > 0) return staticOptions.value
  return localOptions.value
})

// 已勾选值兜底（非分页模式）：选项源（后端 / 本地提取 / 级联收敛）未包含某个
// 已勾选值时，以 { label: String(value), value } 补回 —— 保证已确认的选项始终
// 可见、可取消，不会出现「勾了却看不到、无法取消」的死锁。
// 分页模式不合并：列表成员完全由服务端（关键字 + 分页）决定，跨页已选值按设计
// 不强制展示（勾选状态仍保留在 values 中，翻页加载到对应项时自动回显）。
const resolvedOptions = computed(() => {
  const base = options.value
  if (pagedMode.value) return base
  const sel = selected.value
  if (!sel.length) return base
  const present = new Set(base.map((o) => String(o.value ?? o.label)))
  const missing = sel.filter((v) => !present.has(String(v)))
  return missing.length
    ? [...base, ...missing.map((v) => ({ label: String(v), value: v }))]
    : base
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

// 可见选项：
//   - 分页远程模式：后端按关键字联想返回，前端不再本地过滤（否则只能搜到已加载页）
//   - 其余模式（静态/本地提取/旧式全量远程）：前端按关键字实时过滤，保持原始顺序
const filteredOptions = computed(() => {
  if (pagedMode.value) return resolvedOptions.value
  const kw = (search.value || '').toLowerCase()
  if (!kw) return resolvedOptions.value
  return resolvedOptions.value.filter((o) =>
    String(o.label ?? o.value).toLowerCase().includes(kw),
  )
})

// 是否存在已配置的选项
const hasOptions = computed(() => resolvedOptions.value.length > 0)
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
  const el = e.target
  scrollTop.value = el.scrollTop
  if (!pagedMode.value) return
  // 触底加载：距底部不足阈值时请求下一页（loading/hasMore 由 loadRemoteNextPage 内部守卫）
  if (
    el.scrollTop + el.clientHeight >=
    el.scrollHeight - remoteBottomDistance.value
  ) {
    loadRemoteNextPage()
  }
}

// 选项集合变化（重新拉取 / 搜索关键字 / 级联收敛）时回到顶部，
// 避免滚动位置停留在已不存在的区间；同时复位滚动容器避免 scrollTop 越界。
// 分页模式的「触底追加」也会替换数组但不应回顶，故交由 fetchRemoteFirstPage 显式复位。
watch(filteredOptions, () => {
  if (pagedMode.value) return
  scrollTop.value = 0
  if (listRef.value) listRef.value.scrollTop = 0
})

// ========== 远程分页 + 联想搜索 ==========
// 当前已加载页 / 后端总数 / 是否还有下一页 / 翻页加载中
const remotePage = ref(0)
const remoteTotal = ref(0)
const loadingMore = ref(false)
const hasMore = ref(false)
// 请求序号：关键字快速变化或面板重开时，过期响应必须丢弃（竞态防护）
let remoteFetchSeq = 0

// 按 value 去重合并（防御后端跨页重复项），保持原始顺序
const mergeUniqueOptions = (list) => {
  const seen = new Set()
  const out = []
  for (const o of list) {
    if (o == null) continue
    const key = o.value ?? o.label
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}

// 统一解析分页响应：兼容 { options, total, paged } 与旧式数组（按单页处理）
const parsePagedResponse = (res) => {
  if (Array.isArray(res)) {
    return { pageOptions: res, total: res.length, paged: false }
  }
  const pageOptions = res?.options || []
  const rawTotal = res?.total
  const total =
    rawTotal != null && Number.isFinite(Number(rawTotal))
      ? Number(rawTotal)
      : pageOptions.length
  return { pageOptions, total, paged: res?.paged === true }
}

// 首页请求（面板打开 / 联想关键字变化 / 级联条件变化）：重置分页后拉第 1 页
const fetchRemoteFirstPage = async () => {
  if (typeof ctx?.fetchFilterOptions !== 'function') return
  const seq = ++remoteFetchSeq
  loading.value = true
  loadingMore.value = false
  try {
    const res = await ctx.fetchFilterOptions(props.field, {
      keyword: search.value || '',
      pageNum: 1,
      pageSize: remotePageSize.value,
    })
    if (seq !== remoteFetchSeq) return // 已被更新的请求取代
    if (!res) {
      remoteOptions.value = []
      remotePage.value = 0
      remoteTotal.value = 0
      hasMore.value = false
      return
    }
    const { pageOptions, total, paged } = parsePagedResponse(res)
    remoteOptions.value = mergeUniqueOptions(pageOptions)
    remotePage.value = 1
    remoteTotal.value = total
    // 后端仍返回数组（未分页）/ 空页 / 已取满 → 无下一页
    hasMore.value =
      paged && pageOptions.length > 0 && remoteOptions.value.length < total
    // 首页/重搜后显式回到顶部（触底追加不经过本函数，不会被打断滚动位置）
    scrollTop.value = 0
    if (listRef.value) listRef.value.scrollTop = 0
  } catch {
    if (seq === remoteFetchSeq) remoteOptions.value = []
  } finally {
    if (seq === remoteFetchSeq) loading.value = false
  }
}

// 触底加载下一页：成功后追加；失败则保留 hasMore，下次触底可重试
const loadRemoteNextPage = async () => {
  if (!pagedMode.value || loading.value || loadingMore.value || !hasMore.value) return
  const nextPage = remotePage.value + 1
  const seq = ++remoteFetchSeq
  loadingMore.value = true
  try {
    const res = await ctx.fetchFilterOptions(props.field, {
      keyword: search.value || '',
      pageNum: nextPage,
      pageSize: remotePageSize.value,
    })
    if (seq !== remoteFetchSeq) return
    const { pageOptions, total, paged } = parsePagedResponse(res || [])
    if (pageOptions.length > 0) {
      remoteOptions.value = mergeUniqueOptions([...remoteOptions.value, ...pageOptions])
    }
    remotePage.value = nextPage
    remoteTotal.value = total
    hasMore.value =
      paged && pageOptions.length > 0 && remoteOptions.value.length < total
  } catch {
    // 不推进页码、不清 hasMore：下次触底重新请求同一页
  } finally {
    if (seq === remoteFetchSeq) loadingMore.value = false
  }
}

// 联想搜索：防抖后重置到第 1页（仅分页模式；非分页模式由 filteredOptions 本地过滤）
const debouncedRemoteSearch = useDebounceFn(
  () => {
    if (pagedMode.value) fetchRemoteFirstPage()
  },
  () => remoteSearchDebounce.value,
)
watch(search, () => {
  if (pagedMode.value) debouncedRemoteSearch()
})

// 刷新选项（封装为可复用函数）：远程模式走接口，本地提取模式从全量数据计算
const doFetchOptions = async () => {
  if (useRemote.value) {
    if (typeof ctx.fetchFilterOptions !== 'function') return
    if (pagedMode.value) {
      await fetchRemoteFirstPage()
      return
    }
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
        <!-- 远程分页状态行（非分页模式不渲染）：不用假选项充当，避免干扰勾选/键盘行为 -->
        <div v-if="pagedMode" class="filter-checkbox__list-status">
          <span v-if="loadingMore" class="is-loading">加载中…</span>
          <span v-else-if="!hasMore && filteredOptions.length" class="is-end">
            没有更多了
          </span>
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

  // 远程分页底部状态行（加载中 / 没有更多了），位于滚动流末尾
  &__list-status {
    flex-shrink: 0;
    padding: 6px 0 4px;
    text-align: center;
    font-size: 12px;
    line-height: 18px;
    color: var(--el-text-color-secondary, #909399);

    .is-loading {
      color: var(--el-color-primary, #409eff);
    }
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
