<script setup>
/**
 * 日期区间过滤
 * - 选中值映射到 data.values（数组 [start, end]，与 FilterCheckbox 的 data.values 属性 key 保持一致）
 * - 默认 value-format 为 YYYY-MM-DD（字符串，便于直接做字符串比较），可通过列 props 覆盖
 * - 任一端无值时存 null（最终请求参数的占位值由 filterRender.props.emptyValue 配置，默认 null）
 */
import { computed } from 'vue'

const props = defineProps({
  option: { type: Object, required: true },
  renderOpts: { type: Object, default: () => ({}) },
})

const range = computed({
  get: () => {
    const v = props.option.data?.values
    if (!Array.isArray(v)) return []
    const a = v[0]
    const b = v[1]
    return a || b ? [a ?? '', b ?? ''] : []
  },
  set: (v) => {
    if (v == null) {
      props.option.data.values = [null, null]
    } else {
      props.option.data.values = [
        v[0] != null && v[0] !== '' ? v[0] : null,
        v[1] != null && v[1] !== '' ? v[1] : null,
      ]
    }
  },
})

// 透传给 el-date-picker 的 props：剥离内部使用的 emptyValue 配置项
const attrs = computed(() => {
  const { emptyValue: _ev, ...rest } = props.renderOpts?.props || {}
  return rest
})
</script>

<template>
  <el-date-picker
    v-model="range"
    type="daterange"
    value-format="YYYY-MM-DD"
    range-separator="至"
    start-placeholder="开始日期"
    end-placeholder="结束日期"
    style="width: 100%"
    v-bind="attrs"
  />
</template>
