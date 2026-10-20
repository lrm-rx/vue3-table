<script setup>
/**
 * Catalog —— 自定义目录面板（替代 md-editor-v3 内置 MdCatalog）
 *
 * 相比内置目录的改进：
 * 1. 内嵌在编辑器左/右侧，与编辑器等高、独立滚动，无需手动绑定 editorId / scrollElement
 * 2. 层级缩进 + 折叠展开，长文档结构一目了然
 * 3. 滚动跟随（scroll-spy）：优先跟随预览区，预览关闭时回退到 CodeMirror 编辑区
 * 4. 点击目录项平滑滚动定位：预览区通过 [data-line] 精确匹配标题元素
 *    （不依赖标题 id，规避重复标题文本导致的 id 冲突）
 *
 * 数据来源：父组件通过 MdEditor / MdPreview（只读）的 onGetCatalog 事件拿到扁平标题列表后传入。
 * 只读模式（previewOnly）宿主为 MdPreview：自身无滚动容器，滚动跟随与点击定位
 * 自动解析实际滚动容器（window 或布局层级的内部 overflow 容器）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildCatalogTree, pickActiveHeadingIndex } from '../utils'

const props = defineProps({
  /** 扁平标题列表（md-editor-v3 onGetCatalog 返回的 HeadList[]） */
  headings: {
    type: Array,
    default: () => [],
  },
  /** 最大展示层级（level <= maxDepth 才显示），不传/<=0 表示不限制 */
  maxDepth: {
    type: Number,
    default: undefined,
  },
  /** 底层 MdEditor 组件实例（用于取 $el 定位预览区、getEditorView() 取 CM 实例） */
  editorRef: {
    type: Object,
    default: null,
  },
  /** 编辑器主题：light / dark（目录面板配色跟随） */
  theme: {
    type: String,
    default: 'light',
  },
  /** 只读模式（宿主为 MdPreview）：无独立滚动容器，滚动跟随与点击定位基于实际滚动容器（window 或内部容器） */
  previewOnly: {
    type: Boolean,
    default: false,
  },
  /** 高亮判定线 / 点击定位时相对滚动容器顶部的偏移量（px） */
  offsetTop: {
    type: Number,
    default: 8,
  },
})

/** 树形目录结构 */
const tree = computed(() => buildCatalogTree(props.headings, props.maxDepth))

/** 折叠状态：存放被折叠节点的 key（默认全部展开） */
const collapsed = ref(new Set())

/** 当前激活标题在「原始扁平列表」中的下标（-1 表示无） */
const activeIndex = ref(-1)

/** 面板滚动容器 */
const panelRef = ref()

/** 标题是否通过 maxDepth 过滤（与 buildCatalogTree 规则一致） */
const passDepth = (h) =>
  !(typeof props.maxDepth === 'number' && props.maxDepth > 0) || h.level <= props.maxDepth

/**
 * 将树拍平为渲染用列表（避免递归组件）：
 * 每项附带 depth（缩进层级）与 hasChildren（是否显示折叠箭头），被折叠节点的子树不输出。
 */
const visibleItems = computed(() => {
  const out = []
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      out.push({ key: n.key, index: n.index, text: n.text, level: n.level, line: n.line, depth, hasChildren: n.children.length > 0 })
      if (n.children.length > 0 && !collapsed.value.has(n.key)) walk(n.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return out
})

/** 切换折叠/展开（重建 Set 以触发响应式） */
const toggleCollapse = (key) => {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}

// ---------- 滚动目标解析 ----------

/** MdEditor 根 DOM 元素 */
const getEditorEl = () => props.editorRef?.$el || null

/** 预览容器（标题定位根）：编辑模式为内部滚动容器 preview-wrapper，只读模式为 preview 内容根 */
const resolvePreviewEl = () =>
  getEditorEl()?.querySelector('.md-editor-preview-wrapper, .md-editor-preview') || null

/** CodeMirror EditorView（预览不可用时作为滚动同步目标） */
const resolveEditorView = () => {
  try {
    return props.editorRef?.getEditorView?.() || null
  } catch {
    return null
  }
}

/** 计算元素相对滚动容器内容顶部的距离（沿 offsetParent 链累加） */
const offsetTopWithin = (el, container) => {
  let top = el.offsetTop
  let parent = el.offsetParent
  while (parent && parent !== container && container.contains(parent)) {
    top += parent.offsetTop
    parent = parent.offsetParent
  }
  return top
}

/** 滚动容器缓存：避免每个滚动帧逐级 getComputedStyle 探测（会强制样式 / 布局计算） */
let scrollContainerCache = null

/** 清空滚动容器缓存：内容增删、视口尺寸变化等可能改变「哪个祖先才是滚动容器」时调用 */
const invalidateScrollContainer = () => {
  scrollContainerCache = null
}

/**
 * 只读模式：解析预览内容实际所在的滚动容器。
 * MdPreview 自身无滚动（overflow: visible），滚动发生在祖先上 —— 可能是 window
 * （scrollingElement），也可能是布局层级的内部容器（如 100vh 布局中 overflow:auto
 * 的 <el-main>）。假设「页面滚在 window 上」会导致点击定位与 spy 全部失效
 * （scrollingElement.scrollTop 恒为 0）。
 * 从预览根向上找第一个 overflow-y 为 auto/scroll 且内容溢出的祖先，找不到回退 scrollingElement。
 * 结果按实例缓存（滚动帧只读缓存），force=true 时强制重新探测（点击定位需绝对准确）。
 */
const resolveScrollContainer = (force = false) => {
  // 缓存命中：元素仍在文档中即复用（预览容器随 preview 开关 / 主题切换重建，脱离文档则失效）
  if (!force && scrollContainerCache?.isConnected) return scrollContainerCache
  const docEl = document.scrollingElement || document.documentElement
  const previewEl = resolvePreviewEl()
  // 预览尚未就绪：此时探测只会得到兜底结果，不写缓存，避免把兜底结果固化到后续滚动帧
  if (!previewEl) return docEl
  let el = previewEl
  let found = docEl
  while (el && el !== docEl && el !== document.body) {
    const overflowY = getComputedStyle(el).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      found = el
      break
    }
    el = el.parentElement
  }
  scrollContainerCache = found
  return found
}

/** 是否为文档级滚动容器（window / scrollingElement） */
const isDocumentScroller = (el) => {
  const docEl = document.scrollingElement || document.documentElement
  return el === docEl || el === document.documentElement || el === document.body
}

/**
 * 元素相对滚动容器内容顶部的距离。
 * - 内部 overflow 容器：容器自身 rect 相对视口固定，用「rect 差 + scrollTop」；
 * - window / document（scrollingElement）：根元素 rect 随滚动位移（rect.top ≈ -scrollTop），
 *   再取 rect 差会重复计入一次 scrollTop（目标位置被放大为 rect.top + 2 * scrollTop），
 *   必须改用「rect.top + scrollTop」。
 */
const offsetTopWithinContainer = (el, container) =>
  isDocumentScroller(container)
    ? el.getBoundingClientRect().top + (container.scrollTop || 0)
    : el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop

/** 平滑滚动（jsdom 等环境无 scrollTo 实现时退化为直接赋值 scrollTop） */
const smoothScrollTo = (el, top) => {
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  } else {
    el.scrollTop = Math.max(0, top)
  }
}

// ---------- 滚动跟随（scroll-spy） ----------

// rAF 兼容：jsdom 等无布局环境可能缺少 requestAnimationFrame，退化为 setTimeout
const raf =
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16)
const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout

let rafId = 0

/**
 * 收集「可见标题 → 滚动内容绝对 top」的映射对（升序），供高亮决策使用。
 * 预览模式：按 [data-line] 找标题元素，沿 offsetParent 链算 top；
 * 编辑模式：用 CM view.lineBlockAt 计算标题行的文档坐标。
 * @returns {{ pairs: Array<{index:number, top:number}>, scrollTop: number } | null}
 */
const collectHeadingTops = () => {
  const list = props.headings
  if (!list.length) return null

  const previewEl = resolvePreviewEl()
  if (previewEl) {
    // 只读模式：无独立滚动容器，滚动发生在实际滚动容器（window 或内部容器）上，
    // 用 rect 差 + 容器 scrollTop 计算标题在容器内容中的绝对位置
    if (props.previewOnly) {
      const container = resolveScrollContainer()
      const pairs = []
      list.forEach((h, i) => {
        if (!passDepth(h)) return
        const el = previewEl.querySelector(`[data-line="${h.line}"]`)
        if (el) pairs.push({ index: i, top: offsetTopWithinContainer(el, container) })
      })
      return { pairs, scrollTop: container.scrollTop }
    }

    const pairs = []
    list.forEach((h, i) => {
      if (!passDepth(h)) return
      const el = previewEl.querySelector(`[data-line="${h.line}"]`)
      if (el) pairs.push({ index: i, top: offsetTopWithin(el, previewEl) })
    })
    return { pairs, scrollTop: previewEl.scrollTop }
  }

  const view = resolveEditorView()
  if (view) {
    const totalLines = view.state.doc.lines
    const pairs = []
    list.forEach((h, i) => {
      if (!passDepth(h) || h.line + 1 > totalLines) return
      pairs.push({ index: i, top: view.lineBlockAt(view.state.doc.line(h.line + 1).from).top })
    })
    return { pairs, scrollTop: view.scrollDOM.scrollTop }
  }

  return null
}

/** 保证激活项在目录面板可视区域内（只调面板自身 scrollTop，避免影响编辑器滚动） */
const ensureActiveVisible = () => {
  nextTick(() => {
    const panel = panelRef.value
    const item = panel?.querySelector('.base-md-catalog__item--active')
    if (!panel || !item) return
    const top = item.offsetTop
    const bottom = top + item.offsetHeight
    if (top < panel.scrollTop) {
      panel.scrollTop = top
    } else if (bottom > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = bottom - panel.clientHeight
    }
  })
}

/** 根据当前滚动位置重新计算激活标题 */
const updateActive = () => {
  const result = collectHeadingTops()
  if (!result || result.pairs.length === 0) {
    activeIndex.value = props.headings.length ? activeIndex.value : -1
    return
  }
  const pick = pickActiveHeadingIndex(result.pairs.map((p) => p.top), result.scrollTop, props.offsetTop)
  activeIndex.value = pick === -1 ? -1 : result.pairs[pick].index
  ensureActiveVisible()
}

/** rAF 节流的滚动监听 */
const onScrollCapture = (e) => {
  // 目录面板自身的滚动与 scroll-spy 无关（spy 只依赖预览/编辑区的滚动位置），直接跳过。
  // 否则 updateActive 末尾的 ensureActiveVisible 会把目录滚动拉回激活项，
  // 导致目录滚不到底部、末尾标题显示不全
  if (e?.target?.closest?.('.base-md-catalog')) return
  if (clickLock) {
    const dist = Math.abs(clickLock.container.scrollTop - clickLock.top)
    // 距目标「由近转远」超过容差 → 只可能是用户主动滚离（自动滚动只会单调接近目标，
    // 且不产生过冲）。覆盖拖拽滚动条、鼠标中键、滚动条点击等未触发上述事件的交互。
    if (dist > clickLock.minDistance + LOCK_AWAY_TOLERANCE) {
      clickLock = null
      clearTimeout(settleTimer)
    } else {
      // 滚动未静止：记录最近距离并刷新 lastEvent，锁定延续（含自动滚动收尾抖动、
      // 编辑器同步滚动的延迟回弹），由 checkSettle 在静止后决定是否交还 spy
      clickLock.minDistance = Math.min(clickLock.minDistance, dist)
      clickLock.lastEvent = performance.now()
      return
    }
  }
  if (rafId) return
  rafId = raf(() => {
    rafId = 0
    updateActive()
  })
}

// ---------- 点击定位 ----------

/**
 * 点击锁定：{ container, top, minDistance, lastEvent, startedAt } | null。
 * 点击目录项后抑制 scroll-spy，直到满足以下任一条件：
 * 1. 滚动到达目标位置且滚动事件已静止（LOCK_QUIET_MS）——平滑滚动收尾抖动、
 *    编辑器同步滚动的延迟回弹期间位置仍在变化，此时按「未到达目标时的旧位置」
 *    判定会让切换前的旧高亮闪现，必须等真正静止后再交还 spy（正常路径）；
 * 2. 用户手动操作编辑器区域滚动（wheel/touchmove/mousedown/keydown，点击高亮让位）；
 * 3. 距目标「由近转远」超过 LOCK_AWAY_TOLERANCE——覆盖拖拽滚动条等未触及以上事件的
 *    手动滚动（自动滚动只会单调接近目标，不会产生过冲）；
 * 4. LOCK_TIMEOUT_MS 兜底超时，避免异常情况下锁定悬挂。
 * 文档末尾标题滚不到判定线（不满足「到达」）时保持锁定，点击高亮不被抢回。
 */
let clickLock = null
const LOCK_QUIET_MS = 150
const LOCK_CHECK_INTERVAL = 120
const LOCK_TIMEOUT_MS = 4000
/** 锁定期间距目标由近转远的判定容差（px）：仅自动滚动的收尾抖动远小于该值 */
const LOCK_AWAY_TOLERANCE = 40
let settleTimer = 0

const armSettleCheck = () => {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(checkSettle, LOCK_CHECK_INTERVAL)
}

const checkSettle = () => {
  if (!clickLock) return
  const now = performance.now()
  if (now - clickLock.startedAt > LOCK_TIMEOUT_MS) {
    // 兜底超时：仅解锁，不在滚动中途运行 spy（避免按途中位置判定造成闪烁）
    clickLock = null
    return
  }
  const arrived = Math.abs(clickLock.container.scrollTop - clickLock.top) <= 2
  if (arrived && now - clickLock.lastEvent >= LOCK_QUIET_MS) {
    // 已到达目标且滚动静止：解锁并按最终位置刷新高亮
    clickLock = null
    updateActive()
    return
  }
  armSettleCheck()
}

/** 创建点击锁定并启动静止检测 */
const createClickLock = (container, top) => {
  const now = performance.now()
  const minDistance = Math.abs(container.scrollTop - top)
  clickLock = { container, top, minDistance, lastEvent: now, startedAt: now }
  armSettleCheck()
}

/** 用户手动滚动信号：解除点击锁定（仅当事件发生在编辑器区域内） */
const releaseClickLock = (e) => {
  if (!clickLock) return
  const root = getEditorEl()
  if (root && e.target && root.contains(e.target)) {
    clickLock = null
    clearTimeout(settleTimer)
  }
}

const USER_SCROLL_EVENTS = ['wheel', 'touchmove', 'mousedown', 'keydown']

/**
 * 解析标题滚动锚点：优先精确匹配 data-line；
 * 列表/引用内的嵌套标题没有 data-line 属性（markdown-it 仅给顶层块级 token 标注），
 * 回退到行号不大于目标行的最近锚点。找不到锚点返回 null（此时不滚动也不改高亮，
 * 否则只改高亮不滚动，下一次滚动事件会立刻把高亮抢回旧位置造成闪烁）。
 */
const resolveAnchorEl = (previewEl, line) => {
  const exact = previewEl.querySelector(`[data-line="${line}"]`)
  if (exact) return exact
  let anchor = null
  previewEl.querySelectorAll('[data-line]').forEach((el) => {
    if (Number(el.getAttribute('data-line')) <= line) anchor = el
  })
  return anchor
}

/** 点击目录项：滚动到对应标题（预览优先，编辑区兜底），确认能定位后才置为激活 */
const scrollToHeading = (item) => {
  // 只读模式：滚动实际滚动容器（window 或内部 overflow 容器）到标题位置
  if (props.previewOnly) {
    const previewEl = resolvePreviewEl()
    const el = previewEl && resolveAnchorEl(previewEl, item.line)
    if (el) {
      // 点击定位必须绝对准确：强制重新探测容器，顺带刷新后续滚动帧的缓存
      const container = resolveScrollContainer(true)
      const top = Math.max(0, offsetTopWithinContainer(el, container) - props.offsetTop)
      activeIndex.value = item.index
      createClickLock(container, top)
      smoothScrollTo(container, top)
    }
    return
  }

  const previewEl = resolvePreviewEl()
  if (previewEl) {
    const el = resolveAnchorEl(previewEl, item.line)
    if (el) {
      const top = Math.max(0, offsetTopWithin(el, previewEl) - props.offsetTop)
      activeIndex.value = item.index
      createClickLock(previewEl, top)
      smoothScrollTo(previewEl, top)
      return
    }
  }

  const view = resolveEditorView()
  if (view && item.line + 1 <= view.state.doc.lines) {
    const top = Math.max(
      0,
      view.lineBlockAt(view.state.doc.line(item.line + 1).from).top - props.offsetTop,
    )
    activeIndex.value = item.index
    createClickLock(view.scrollDOM, top)
    smoothScrollTo(view.scrollDOM, top)
  }
}

// ---------- 生命周期 ----------

onMounted(() => {
  // 捕获阶段监听 document 滚动：预览容器在切换 preview 时会被销毁重建，
  // 直接绑定容器会丢失监听；捕获监听对子元素重建免疫，且能同时覆盖预览区与 CM 滚动区。
  document.addEventListener('scroll', onScrollCapture, true)
  // 用户手动滚动信号（同为捕获监听，覆盖容器重建场景）
  USER_SCROLL_EVENTS.forEach((t) => document.addEventListener(t, releaseClickLock, true))
  // 视口尺寸变化可能改变「哪个祖先才是滚动容器」（如内容由溢出变为不溢出），缓存失效
  window.addEventListener('resize', invalidateScrollContainer)
  nextTick(updateActive)
})

onBeforeUnmount(() => {
  document.removeEventListener('scroll', onScrollCapture, true)
  USER_SCROLL_EVENTS.forEach((t) => document.removeEventListener(t, releaseClickLock, true))
  window.removeEventListener('resize', invalidateScrollContainer)
  if (rafId) {
    caf(rafId)
    rafId = 0
  }
  clearTimeout(settleTimer)
  clickLock = null
  scrollContainerCache = null
})

// 标题列表变化（编辑触发重新编译）后，等预览 DOM 更新再重算高亮
watch(
  () => props.headings,
  () => {
    // 内容变化可能改变滚动容器的溢出状态（内容变长/变短），缓存失效后重新探测
    invalidateScrollContainer()
    nextTick(updateActive)
  },
)
</script>

<template>
  <aside class="base-md-catalog" :data-theme="theme">
    <div class="base-md-catalog__header">目录</div>
    <div ref="panelRef" class="base-md-catalog__body">
      <template v-if="visibleItems.length">
        <div
          v-for="item in visibleItems"
          :key="item.key"
          class="base-md-catalog__item"
          :class="{ 'base-md-catalog__item--active': item.index === activeIndex }"
          :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
          :title="item.text"
          @click="scrollToHeading(item)"
        >
          <span
            class="base-md-catalog__arrow"
            :class="{
              'base-md-catalog__arrow--collapsed': item.hasChildren && collapsed.has(item.key),
              'base-md-catalog__arrow--hidden': !item.hasChildren,
            }"
            @click.stop="item.hasChildren && toggleCollapse(item.key)"
          >
            <svg viewBox="0 0 1024 1024" width="12" height="12" aria-hidden="true">
              <path
                d="M341.333 192c-12.8 0-25.6 4.267-34.133 12.8-17.067 17.067-17.067 42.667 0 59.733L618.667 512 307.2 823.467c-17.067 17.067-17.067 42.667 0 59.733 17.067 17.067 42.667 17.067 59.733 0l341.333-341.333c17.067-17.067 17.067-42.667 0-59.733L366.933 140.8c-8.533-8.533-21.333-12.8-25.6-12.8z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span class="base-md-catalog__text">{{ item.text }}</span>
        </div>
      </template>
      <div v-else class="base-md-catalog__empty">暂无目录</div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.base-md-catalog {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fff;
  color: #303133;
  // 滚动条变量与 md-editor 主题变量保持一致（面板正常模式是 .md-editor 的兄弟节点，
  // 继承不到其 CSS 变量，此处按主题本地定义，值取自 md-editor 的 light/dark 主题）
  --md-scrollbar-bg-color: #e2e2e2;
  --md-scrollbar-thumb-color: rgba(0, 0, 0, 0.3);
  --md-scrollbar-thumb-hover-color: rgba(0, 0, 0, 0.35);
  --md-scrollbar-thumb-active-color: rgba(0, 0, 0, 0.38);

  &__header {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid #e4e7ed;
    user-select: none;
  }

  &__body {
    position: relative; // 保证目录项 offsetTop 相对本容器，供激活项滚动定位
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;

    // 滚动条样式与编辑器自定义滚动条一致（6px 轨道、4px 圆角滑块、主题变量配色）
    // Firefox 等不支持 ::-webkit-scrollbar 的浏览器：用标准属性兜底。
    // 注意必须与 webkit 规则互斥（@supports 隔离）—— Chrome 121+ 支持 scrollbar-width 后
    // 会优先采用标准属性并忽略 ::-webkit-scrollbar 规则，导致宽度退化为原生 thin（约 10px）
    @supports not selector(::-webkit-scrollbar) {
      scrollbar-width: thin;
      scrollbar-color: var(--md-scrollbar-thumb-color) var(--md-scrollbar-bg-color);
    }

    // WebKit / Blink
    &::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: var(--md-scrollbar-bg-color);
    }

    &::-webkit-scrollbar-thumb {
      background: var(--md-scrollbar-thumb-color);
      border-radius: 4px;
      transition: background 0.2s;

      &:hover {
        background: var(--md-scrollbar-thumb-hover-color);
      }

      &:active {
        background: var(--md-scrollbar-thumb-active-color);
      }
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    font-size: 13px;
    line-height: 1.5;
    cursor: pointer;
    border-left: 2px solid transparent;
    color: #606266;
    transition: background-color 0.15s, color 0.15s;

    &:hover {
      background: #f5f7fa;
      color: var(--el-color-primary, #409eff);
    }

    &--active {
      color: var(--el-color-primary, #409eff);
      border-left-color: var(--el-color-primary, #409eff);
      background: var(--el-color-primary-light-9, #ecf5ff);
      font-weight: 500;
    }
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: #909399;
    transition: transform 0.15s;
    transform: rotate(90deg); // 默认展开态：箭头朝下

    &--collapsed {
      transform: rotate(0deg); // 折叠态：箭头朝右
    }

    &--hidden {
      visibility: hidden; // 无子节点：占位保持文字对齐
    }
  }

  &__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    padding: 24px 12px;
    text-align: center;
    font-size: 13px;
    color: #909399;
    user-select: none;
  }
}

// 深色主题：边框 / 背景 / 文字色切换，主色沿用 element-plus 变量
.base-md-catalog[data-theme='dark'] {
  border-color: #414243;
  background: #1d1e1f;
  color: #cfd3dc;
  // 深色滚动条变量（值取自 md-editor dark 主题）
  --md-scrollbar-bg-color: #0f0f0f;
  --md-scrollbar-thumb-color: #2d2d2d;
  --md-scrollbar-thumb-hover-color: #3a3a3a;
  --md-scrollbar-thumb-active-color: #3a3a3a;

  .base-md-catalog__header {
    border-bottom-color: #414243;
  }

  .base-md-catalog__item {
    color: #a3a6ad;

    &:hover {
      background: #2b2c2e;
    }

    &--active {
      background: rgba(64, 158, 255, 0.12);
    }
  }
}
</style>
