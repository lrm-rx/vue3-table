<script setup>
/**
 * 日期区间过滤
 * - 选中值映射到 data.start / data.end
 * - 默认 value-format 为 YYYY-MM-DD（字符串，便于直接做字符串比较），可通过列 props 覆盖
 */
import { computed } from 'vue'

const props = defineProps({
  option: { type: Object, required: true },
  renderOpts: { type: Object, default: () => ({}) },
})

const range = computed({
  get: () => {
    const d = props.option.data || {}
    return d.start || d.end ? [d.start || '', d.end || ''] : []
  },
  set: (v) => {
    const data = props.option.data
    data.start = v?.[0] || ''
    data.end = v?.[1] || ''
  },
})

const attrs = computed(() => props.renderOpts?.props || {})
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
