<script setup>
/**
 * 数字区间过滤
 * - 最小值 / 最大值分别映射到 data.min / data.max
 * - 仅允许输入合理的有限数字，否则拒绝写入
 * - 失焦时若 min > max，自动交换两者
 * - 可通过 renderOpts.suffix 配置后缀（如 %、℃、°），不配置则不显示
 */
import { computed } from 'vue'

const props = defineProps({
  option: { type: Object, required: true },
  renderOpts: { type: Object, default: () => ({}) },
})

// 归一化：返回有限数字或 null（清空）；非合理数字返回 undefined 表示拒绝
const normalize = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return n
}

const min = computed({
  get: () => (props.option.data ? props.option.data.min : null),
  set: (v) => {
    const n = normalize(v)
    if (n === undefined) return // 非合理数字，不写入
    props.option.data.min = n
  },
})

const max = computed({
  get: () => (props.option.data ? props.option.data.max : null),
  set: (v) => {
    const n = normalize(v)
    if (n === undefined) return // 非合理数字，不写入
    props.option.data.max = n
  },
})

const handleBlur = () => {
  if (!props.option.data) return
  const mn = props.option.data.min
  const mx = props.option.data.max
  if (mn !== null && mn !== undefined && mx !== null && mx !== undefined && mn > mx) {
    props.option.data.min = mx
    props.option.data.max = mn
  }
}

const attrs = computed(() => props.renderOpts?.props || {})

// 后缀配置：通过 renderOpts.suffix 传入字符串（如 '%'、'℃'、'°'），未配置则为空
const suffix = computed(() => {
  const s = props.renderOpts?.suffix
  return s === null || s === undefined ? '' : String(s)
})
</script>

<template>
  <div class="filter-number-range">
    <el-input-number
      v-model="min"
      :controls="false"
      placeholder="最小值"
      @blur="handleBlur"
      v-bind="attrs"
    >
      <template v-if="suffix" #suffix>
        <span class="filter-number-range__suffix">{{ suffix }}</span>
      </template>
    </el-input-number>
    <span class="filter-number-range__sep"> - </span>
    <el-input-number
      v-model="max"
      :controls="false"
      placeholder="最大值"
      @blur="handleBlur"
      v-bind="attrs"
    >
      <template v-if="suffix" #suffix>
        <span class="filter-number-range__suffix">{{ suffix }}</span>
      </template>
    </el-input-number>
  </div>
</template>

<style scoped lang="scss">
.filter-number-range {
  display: flex;
  align-items: center;
  gap: 8px;
  &__sep {
    color: var(--el-text-color-secondary, #909399);
    flex-shrink: 0;
  }

  &__suffix {
    color: var(--el-text-color-regular, #606266);
    user-select: none;
    line-height: 1;
  }

  :deep(.el-input-number) {
    max-width: 130px !important;
  }
}
</style>
