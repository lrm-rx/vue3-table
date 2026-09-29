<script setup>
/**
 * FloatBall —— 灵动悬浮球（可拖拽 · hover 扇形展开 · 就近边缘吸附）
 *
 * 能力：
 * 1. 可拖拽：按住中心球拖动，边界限制在视口内，支持鼠标与触摸
 * 2. 可自定义按钮：通过 items 传入 n 个按钮（名称/图标/颜色/点击回调），
 *    展开后为 n 个扇形切片（环形扇区）均分 360°，拼成一个完整圆盘，中心镂空放中心球
 * 3. 鼠标悬浮展开：hover 中心球/扇形区域展开，移出延迟收起
 * 4. 就近吸附：拖拽结束后按到四边的距离，吸附到最近的浏览器窗口边缘
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  computeSlicePath,
  computeSliceMidpoint,
  clampPosition,
  resolveSnap,
  resolveInitialPosition,
} from './utils'

const props = defineProps({
  /**
   * 子按钮配置数组，决定切片数量与内容（n 个即 n 扇形）。
   * 每项：{ name, icon, color, disabled, onClick }
   */
  items: {
    type: Array,
    default: () => [],
  },
  /** 中心球直径（px） */
  size: {
    type: Number,
    default: 56,
  },
  /** 圆盘外半径（px）：展开后扇形切片拼成的圆盘半径 */
  radius: {
    type: Number,
    default: 92,
  },
  /** 圆盘内半径（px）：中心镂空半径；不传则自动取「中心球半径 + 8」 */
  innerRadius: {
    type: Number,
    default: 0,
  },
  /** 起始角（度），默认 -90 即正上方开始顺时针均分 */
  startAngle: {
    type: Number,
    default: -90,
  },
  /** 是否启用边缘吸附 */
  snap: {
    type: Boolean,
    default: true,
  },
  /** 吸附阈值（px）：最近边距离 <= 该值才吸附；0 表示总是吸附到最近边 */
  snapThreshold: {
    type: Number,
    default: 0,
  },
  /** 吸附后是否半隐藏（半个球在视口外） */
  hideHalf: {
    type: Boolean,
    default: false,
  },
  /** 是否可拖拽 */
  draggable: {
    type: Boolean,
    default: true,
  },
  /** 是否悬浮展开（false 时需点击中心球切换） */
  expandOnHover: {
    type: Boolean,
    default: true,
  },
  /** 收起延迟（ms），便于鼠标从中心球移到扇形切片 */
  collapseDelay: {
    type: Number,
    default: 260,
  },
  /** 展开时圆盘距视口边框的留白（px）：移入可视区完整显示后，再向外留此间隙 */
  expandPadding: {
    type: Number,
    default: 10,
  },
  /** 初始位置：预设方位（top-left/top-right/bottom-left/bottom-right/left/right）或 {x, y} */
  defaultPosition: {
    type: [String, Object],
    default: 'right',
  },
  /** 中心球标题（无 main 插槽时显示） */
  title: {
    type: String,
    default: '',
  },
  /** 层级 */
  zIndex: {
    type: Number,
    default: 999,
  },
})

const emit = defineEmits(['item-click', 'main-click', 'change', 'snap'])

// ============ 位置与状态 ============
// 初始位置在 setup 同步计算：避免首帧先渲染在 (0,0)、再经 transition 滑到目标位，
// 导致刷新页面时球「从左上角快速飞到右下角」。
// 若开启吸附（snap），初始位再同步吸附到「最近的一条边」，避免停在预设角落（如右下角）。
const initialPosition = (() => {
  try {
    const pos = resolveInitialPosition(
      props.defaultPosition,
      props.size,
      props.size,
      window.innerWidth,
      window.innerHeight,
    )
    if (props.snap) {
      const snapped = resolveSnap(
        pos.x,
        pos.y,
        props.size,
        props.size,
        window.innerWidth,
        window.innerHeight,
        { threshold: props.snapThreshold, hideHalf: props.hideHalf },
      )
      if (snapped) return { x: snapped.x, y: snapped.y }
    }
    return pos
  } catch {
    return { x: 0, y: 0 }
  }
})()
const position = reactive(initialPosition)
const expanded = ref(false)
const dragging = ref(false)
const moving = ref(false) // 拖拽时关闭 transition，吸附/归位时开启
const hoverIndex = ref(-1) // 当前 hover 的切片序号，用于联动高亮图标文字
// 展开前的位置快照：收起时还原到此，实现「鼠标离开后重新吸附/归位回去」
const positionBeforeExpand = reactive({ x: initialPosition.x, y: initialPosition.y })

// 内半径：显式传入优先，否则取中心球半径 + 间隙，并保证小于外半径
const innerR = computed(() => {
  const base = props.innerRadius > 0 ? props.innerRadius : props.size / 2 + 8
  return Math.min(base, props.radius - 1)
})

const rootStyle = computed(() => ({
  left: position.x + 'px',
  top: position.y + 'px',
  width: props.size + 'px',
  height: props.size + 'px',
  zIndex: props.zIndex,
  transition: moving.value ? 'none' : 'left 0.28s ease, top 0.28s ease',
}))

// 圆盘容器尺寸（边长 = 2 * 外半径）
const wheelStyle = computed(() => ({
  width: props.radius * 2 + 'px',
  height: props.radius * 2 + 'px',
}))

const viewport = () => ({
  vw: window.innerWidth,
  vh: window.innerHeight,
})

const setPosition = (x, y) => {
  const { vw, vh } = viewport()
  const p = clampPosition(x, y, props.size, props.size, vw, vh)
  position.x = p.x
  position.y = p.y
}

// ============ 扇形切片几何 ============
const slicePath = (index) =>
  computeSlicePath(
    index,
    props.items.length,
    props.radius,
    innerR.value,
    props.startAngle,
    props.radius,
    props.radius,
  )

// 切片图标/文字定位（圆盘坐标系，左上角原点）
const labelStyle = (index) => {
  const mid = computeSliceMidpoint(
    index,
    props.items.length,
    props.radius,
    innerR.value,
    props.startAngle,
    props.radius,
    props.radius,
  )
  return {
    left: mid.x + 'px',
    top: mid.y + 'px',
  }
}

// ============ 悬浮展开 / 收起 ============
let collapseTimer = null
const clearCollapseTimer = () => {
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
}
const open = () => {
  if (dragging.value) return
  clearCollapseTimer()
  // 记录展开前位置，收起时还原回去
  positionBeforeExpand.x = position.x
  positionBeforeExpand.y = position.y
  expanded.value = true
  ensureExpandedVisible()
}

// 展开后把球往内平移，使圆盘（半径 radius）完整可见，且距视口边框再留 expandPadding 间隙。
const ensureExpandedVisible = () => {
  const { vw, vh } = viewport()
  const cx = position.x + props.size / 2
  const cy = position.y + props.size / 2
  const r = props.radius
  const pad = props.expandPadding
  let dx = 0
  let dy = 0
  if (cx - r < pad) dx = pad - (cx - r)
  else if (cx + r > vw - pad) dx = vw - pad - (cx + r)
  if (cy - r < pad) dy = pad - (cy - r)
  else if (cy + r > vh - pad) dy = vh - pad - (cy + r)
  if (dx !== 0 || dy !== 0) {
    position.x += dx
    position.y += dy
    emit('change', { x: position.x, y: position.y })
  }
}
const scheduleCollapse = () => {
  clearCollapseTimer()
  collapseTimer = setTimeout(() => {
    // 兜底：若已进入拖拽，放弃归位，避免把球拉回原位
    if (dragging.value) return
    expanded.value = false
    hoverIndex.value = -1
    // 鼠标离开收起后，归位到展开前的位置（重新吸附回去）
    position.x = positionBeforeExpand.x
    position.y = positionBeforeExpand.y
    emit('change', { x: position.x, y: position.y })
  }, props.collapseDelay)
}

const onRootEnter = () => {
  // 拖拽中禁用 hover 展开，避免与拖拽位置冲突
  if (dragging.value || !props.expandOnHover) return
  open()
}
const onRootLeave = () => {
  // 拖拽中：球贴边时鼠标会移出元素，此时不能触发收起归位，否则会把球拉回原位
  if (dragging.value) return
  hoverIndex.value = -1
  if (props.expandOnHover) scheduleCollapse()
}

// 点击中心球：拖拽与点击区分（移动超过阈值视为拖拽，不触发点击）
const onMainClick = () => {
  if (dragMoved) return
  if (!props.expandOnHover) {
    expanded.value = !expanded.value
    if (expanded.value) {
      // 展开前记录位置，收起时归位回去
      positionBeforeExpand.x = position.x
      positionBeforeExpand.y = position.y
      ensureExpandedVisible()
    } else {
      position.x = positionBeforeExpand.x
      position.y = positionBeforeExpand.y
      emit('change', { x: position.x, y: position.y })
    }
    return
  }
  emit('main-click')
}

const onItemClick = (item, index) => {
  if (item.disabled) return
  emit('item-click', item, index)
  if (typeof item.onClick === 'function') {
    item.onClick(item, index)
  }
}

// ============ 拖拽 ============
let startX = 0
let startY = 0
let startPosX = 0
let startPosY = 0
let dragMoved = false
const MOVE_THRESHOLD = 4

const onDragStart = (e) => {
  if (!props.draggable) return
  const point = e.touches ? e.touches[0] : e
  startX = point.clientX
  startY = point.clientY
  startPosX = position.x
  startPosY = position.y
  dragMoved = false
  dragging.value = true
  moving.value = true
  expanded.value = false
  hoverIndex.value = -1
  clearCollapseTimer()
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.addEventListener('touchmove', onDragMove, { passive: false })
  document.addEventListener('touchend', onDragEnd)
  if (e.cancelable) e.preventDefault()
}

const onDragMove = (e) => {
  if (!dragging.value) return
  const point = e.touches ? e.touches[0] : e
  const dx = point.clientX - startX
  const dy = point.clientY - startY
  if (!dragMoved && Math.hypot(dx, dy) > MOVE_THRESHOLD) {
    dragMoved = true
  }
  setPosition(startPosX + dx, startPosY + dy)
  if (e.cancelable) e.preventDefault()
}

const onDragEnd = () => {
  if (!dragging.value) return
  dragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('touchmove', onDragMove)
  document.removeEventListener('touchend', onDragEnd)

  const wasDragging = dragMoved
  nextTick(() => {
    moving.value = false
  })

  if (wasDragging) {
    emit('change', { x: position.x, y: position.y })
    if (props.snap) {
      doSnap()
    }
  }
}

const doSnap = () => {
  const { vw, vh } = viewport()
  const result = resolveSnap(
    position.x,
    position.y,
    props.size,
    props.size,
    vw,
    vh,
    { threshold: props.snapThreshold, hideHalf: props.hideHalf },
  )
  if (!result) return
  position.x = result.x
  position.y = result.y
  emit('snap', result.edge)
  emit('change', { x: result.x, y: result.y })
}

const onResize = () => {
  setPosition(position.x, position.y)
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  clearCollapseTimer()
  window.removeEventListener('resize', onResize)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('touchmove', onDragMove)
  document.removeEventListener('touchend', onDragEnd)
})

defineExpose({
  expand: () => {
    expanded.value = true
    ensureExpandedVisible()
  },
  collapse: () => (expanded.value = false),
  snapToEdge: doSnap,
  getPosition: () => ({ x: position.x, y: position.y }),
})
</script>

<template>
  <div
    class="float-ball"
    :class="{ 'is-expanded': expanded, 'is-dragging': dragging }"
    :style="rootStyle"
    @mouseenter="onRootEnter"
    @mouseleave="onRootLeave"
  >
    <!-- 扇形圆盘：n 个环形扇区切片拼成完整圆，中心镂空 -->
    <div
      class="float-ball__wheel"
      :class="{ 'is-open': expanded }"
      :style="wheelStyle"
    >
      <svg
        :width="radius * 2"
        :height="radius * 2"
        :viewBox="`0 0 ${radius * 2} ${radius * 2}`"
      >
        <path
          v-for="(item, index) in items"
          :key="item.key ?? index"
          class="float-ball__slice"
          :class="{ 'is-disabled': item.disabled, 'is-active': hoverIndex === index }"
          :d="slicePath(index)"
          :style="{ '--slice-color': '#ffffff' }"
          fill-rule="evenodd"
          @mouseenter="hoverIndex = index"
          @mouseleave="hoverIndex = -1"
          @click="onItemClick(item, index)"
        />
      </svg>

      <!-- 切片图标与文字（定位在各切片径向中点） -->
      <div
        v-for="(item, index) in items"
        :key="`label-${item.key ?? index}`"
        class="float-ball__label"
        :class="{
          'is-disabled': item.disabled,
          'is-active': hoverIndex === index,
        }"
        :style="labelStyle(index)"
      >
        <slot name="item" :item="item" :index="index">
          <span v-if="item.icon" class="float-ball__label-icon">
            <component :is="item.icon" />
          </span>
          <span class="float-ball__label-name">{{ item.name }}</span>
        </slot>
      </div>
    </div>

    <!-- 中心球（拖拽手柄），位于圆盘镂空中心 -->
    <div
      class="float-ball__main"
      :class="{ 'is-grabbing': dragging }"
      :style="{
        width: size + 'px',
        height: size + 'px',
        cursor: draggable ? (dragging ? 'grabbing' : 'grab') : 'default',
      }"
      @mousedown="onDragStart"
      @touchstart="onDragStart"
      @click="onMainClick"
    >
      <slot name="main">
        <span class="float-ball__main-text">{{ title || '+' }}</span>
      </slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
.float-ball {
  position: fixed;
  overflow: visible;
  user-select: none;
  will-change: left, top;
}

// 扇形圆盘
.float-ball__wheel {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  // 收起：缩小透明且不接收事件；展开：回弹显示
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.35);
  transform-origin: center center;
  pointer-events: none;
  transition: opacity 0.22s ease,
    transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1);

  &.is-open {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }
}

.float-ball__wheel svg {
  display: block;
  overflow: visible;
}

// 单个扇形切片
.float-ball__slice {
  fill: var(--slice-color);
  stroke: #eceef1;
  stroke-width: 1;
  cursor: pointer;
  transition: fill 0.18s ease;

  &:hover,
  &.is-active {
    fill: #f2f3f5;
  }

  &.is-disabled {
    fill: #fafafa !important;
    cursor: not-allowed;
  }
}

// 切片图标与文字
.float-ball__label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #4b5563;
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
  // 以径向中点为中心，不抢占切片的 hover/click
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: color 0.18s ease;

  &.is-active {
    color: #111827;
  }

  &.is-disabled {
    color: #c4c9d1;
  }
}

.float-ball__label-icon {
  display: flex;
  font-size: 16px;
  line-height: 1;
}

.float-ball__label-name {
  max-width: 56px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

// 中心球
.float-ball__main {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #1f2937;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  z-index: 3;
  transition: box-shadow 0.2s, transform 0.2s;

  &:hover {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    transform: scale(1.05);
  }

  &.is-grabbing {
    transform: scale(1.1);
  }
}

.float-ball__main-text {
  line-height: 1;
  pointer-events: none;
}
</style>
