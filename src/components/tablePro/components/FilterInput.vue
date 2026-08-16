<script setup>
/**
 * 输入框过滤
 * - 不区分英文大小写（由使用方在匹配时 toLowerCase，此处仅存储原始值）
 * - 回车或点击面板「确定」触发搜索（回车时向上抛 confirm）
 * - 面板「重置」由 FilterPanel 清空 data.value，输入框内容随之清空
 */
import { computed } from 'vue'

const props = defineProps({
  option: { type: Object, required: true },
  renderOpts: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['confirm'])

const value = computed({
  get: () => props.option.data?.value ?? '',
  set: (v) => {
    if (!props.option.data) props.option.data = { value: '' }
    props.option.data.value = v
  },
})
</script>

<template>
  <el-input
    v-model="value"
    placeholder="请输入关键字"
    clearable
    @keyup.enter="emit('confirm')"
  />
</template>
