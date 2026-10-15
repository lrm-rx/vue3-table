<script setup>
/**
 * AutoSave —— 自动保存倒计时页脚扩展
 *
 * 放置在 CharCount 的默认插槽中，显示在字数统计右侧。
 *
 * 功能：
 * 1. enabled 为 true 时启动倒计时，到点触发父组件保存事件；enabled 变 false 时立即中断（含保存进行中）。
 * 2. 保存中等待接口反馈，成功显示「自动保存成功」（success 色），失败显示「自动保存失败」（error 色）。
 * 3. 无论成功/失败，均在结果展示 2s 后才进入下一轮倒计时，避免接口耗时不确定导致重叠。
 * 4. 倒计时基于结束时间戳计算，消除 setInterval 漂移；组件卸载时清理全部定时器，避免内存泄露。
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** 是否开启自动保存（总开关） */
  enabled: {
    type: Boolean,
    default: false,
  },
  /** 自动保存间隔数值（配合 intervalUnit 解释） */
  interval: {
    type: Number,
    default: 30,
  },
  /** 自动保存间隔单位：seconds 秒 / minutes 分 */
  intervalUnit: {
    type: String,
    default: 'seconds',
    validator: (v) => ['seconds', 'minutes'].includes(v),
  },
})

/** 换算后的实际间隔秒数 */
const intervalSeconds = computed(() =>
  props.intervalUnit === 'minutes' ? props.interval * 60 : props.interval,
)

const emit = defineEmits(['save'])

/** 状态机：counting 倒计时中 | saving 保存中等待反馈 | success 成功 | error 失败 */
const status = ref('counting')
/** 剩余秒数（浮点，展示时向上取整） */
const remaining = ref(props.interval)

// —— 定时器与生命周期标记 ——
let tickTimer = null // 倒计时轮询定时器
let resultTimer = null // 保存结果展示后的重启定时器
let endTime = 0 // 本轮倒计时结束的时间戳（ms），用于消除漂移
let destroyed = false // 组件卸载标记，阻止异步回调操作已卸载实例

/** 清理全部定时器 */
const clearAllTimers = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (resultTimer) {
    clearTimeout(resultTimer)
    resultTimer = null
  }
}

/**
 * 格式化剩余时间为「mm:ss」（如 2:20、1:00、0:05）
 * 不足 10 秒时秒数补零，保证显示统一
 * @param {number} seconds 剩余秒数
 * @returns {string}
 */
const formatTime = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** 展示文案 */
const displayText = computed(() => {
  switch (status.value) {
    case 'saving':
      return '保存中...'
    case 'success':
      return '自动保存成功'
    case 'error':
      return '自动保存失败'
    default:
      return `${formatTime(remaining.value)}后自动保存`
  }
})

/** 展示样式类：成功用 success 主色，失败用 error 主色 */
const displayClass = computed(() => {
  switch (status.value) {
    case 'success':
      return 'auto-save--success'
    case 'error':
      return 'auto-save--error'
    default:
      return ''
  }
})

/** 是否可见：仅由 enabled 决定（enabled 变 false 时立即中断并隐藏） */
const visible = computed(() => props.enabled)

/** 启动一轮新的倒计时 */
const startCountdown = () => {
  if (destroyed) return
  clearAllTimers()
  status.value = 'counting'
  remaining.value = intervalSeconds.value
  endTime = Date.now() + intervalSeconds.value * 1000
  // 200ms 轮询一次，基于 endTime 计算剩余时间，避免 setInterval 累积漂移
  tickTimer = setInterval(() => {
    const left = (endTime - Date.now()) / 1000
    remaining.value = left
    if (left <= 0) {
      triggerSave()
    }
  }, 200)
}

/** 触发保存：清空倒计时定时器，进入 saving 态，通过回调等待父组件反馈 */
const triggerSave = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  status.value = 'saving'
  // emit('save', done) —— 父组件在保存接口结束后调用 done(true/false)
  emit('save', (ok) => {
    // 组件已卸载或保存期间被关闭（enabled 变 false）：直接丢弃结果，不进入下一轮
    if (destroyed || !props.enabled) return
    status.value = ok ? 'success' : 'error'
    // 结果展示 2s 后再进入下一轮倒计时
    resultTimer = setTimeout(() => {
      if (destroyed || !props.enabled) return
      startCountdown()
    }, 2000)
  })
}

/** 监听开关与间隔变化：开启时启动，关闭时立即中断（含保存进行中），间隔变化时重启 */
watch(
  () => [props.enabled, intervalSeconds.value],
  ([enabled]) => {
    if (enabled) {
      const inFlight =
        status.value === 'saving' || status.value === 'success' || status.value === 'error'
      // 保存中/结果展示态不因间隔变化打断，其余情况启动/重启倒计时
      if (!inFlight) startCountdown()
    } else {
      // 关闭时直接中断自动保存：重置状态并清理全部定时器
      status.value = 'counting'
      clearAllTimers()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  destroyed = true
  clearAllTimers()
})
</script>

<template>
  <span v-if="visible" class="auto-save" :class="displayClass">
    {{ displayText }}
  </span>
</template>

<style scoped lang="scss">
.auto-save {
  display: inline-flex;
  align-items: center;
  margin-left: 12px;
  font-size: 13px;
  color: #61666d;
  user-select: none;
  white-space: nowrap;

  &--success {
    color: var(--el-color-success, #67c23a);
  }

  &--error {
    color: var(--el-color-error, #f56c6c);
  }
}
</style>
