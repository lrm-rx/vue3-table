<script setup>
/**
 * 数字区间过滤
 * - 最小值 / 最大值分别映射到 data.min / data.max
 */
import { computed } from 'vue'

const props = defineProps({
  option: { type: Object, required: true },
  renderOpts: { type: Object, default: () => ({}) },
})

const min = computed({
  get: () => (props.option.data ? props.option.data.min : null),
  set: (v) => {
    if (!props.option.data) props.option.data = { min: null, max: null }
    props.option.data.min = v
  },
})

const max = computed({
  get: () => (props.option.data ? props.option.data.max : null),
  set: (v) => {
    if (!props.option.data) props.option.data = { min: null, max: null }
    props.option.data.max = v
  },
})

const attrs = computed(() => props.renderOpts?.props || {})
</script>

<template>
  <div class="filter-number-range">
    <el-input-number
      v-model="min"
      :controls="false"
      placeholder="最小值"
      v-bind="attrs"
    />
    <span class="filter-number-range__sep">至</span>
    <el-input-number
      v-model="max"
      :controls="false"
      placeholder="最大值"
      size="small"
      v-bind="attrs"
    />
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

  :deep(.el-input-number) {
    width: 100%;
  }
}
</style>
