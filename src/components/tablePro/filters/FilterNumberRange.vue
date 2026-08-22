<script setup>
/**
 * 数字区间过滤
 * - 最小值 / 最大值合并到 data.values 数组（[min, max]，与 FilterCheckbox 的 data.values 属性 key 保持一致）
 * - 仅允许输入合理的有限数字，否则拒绝写入
 * - 失焦时若 min > max，自动交换两者
 * - 可通过 renderOpts.suffix 配置后缀（如 %、℃、°），不配置则不显示
 * - 任一端无值时存 null（最终请求参数的占位值由 filterRender.props.emptyValue 配置，默认 null）
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
  get: () => {
    const v = props.option.data?.values
    return Array.isArray(v) ? (v[0] ?? null) : null
  },
  set: (v) => {
    const n = normalize(v)
    if (n === undefined) return // 非合理数字，不写入
    if (!props.option.data) return
    const arr = Array.isArray(props.option.data.values)
      ? [...props.option.data.values]
      : [null, null]
    arr[0] = n
    props.option.data.values = arr
  },
})

const max = computed({
  get: () => {
    const v = props.option.data?.values
    return Array.isArray(v) ? (v[1] ?? null) : null
  },
  set: (v) => {
    const n = normalize(v)
    if (n === undefined) return // 非合理数字，不写入
    if (!props.option.data) return
    const arr = Array.isArray(props.option.data.values)
      ? [...props.option.data.values]
      : [null, null]
    arr[1] = n
    props.option.data.values = arr
  },
})

const handleBlur = () => {
  if (!props.option.data) return
  const vals = props.option.data.values
  if (!Array.isArray(vals)) return
  const mn = vals[0]
  const mx = vals[1]
  if (mn != null && mn !== '' && mx != null && mx !== '' && mn > mx) {
    props.option.data.values = [mx, mn]
  }
}

// 透传给 el-input-number 的 props：剥离内部使用的 emptyValue 配置项
const attrs = computed(() => {
  const { emptyValue: _ev, ...rest } = props.renderOpts?.props || {}
  return rest
})

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
