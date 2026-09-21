<script setup>
/**
 * Time 工具栏扩展组件 —— 向编辑器插入当前日期时间
 * 放在 MdEditor 的 #defToolbars 插槽中时，insert 方法由编辑器自动注入
 */
import dayjs from 'dayjs'

const props = defineProps({
  // 编辑器注入的插入函数
  insert: {
    type: Function,
    default: null,
  },
  // 时间格式
  format: {
    type: String,
    default: 'YYYY/MM/DD HH:mm:ss dddd',
  },
  // tooltip 文案
  title: {
    type: String,
    default: '插入时间',
  },
})

const handleClick = () => {
  if (typeof props.insert !== 'function') return
  const timeStr = dayjs().format(props.format)
  // Insert 类型: (generate) => void, generate: (selectedText) => { targetValue, select? }
  props.insert(() => ({ targetValue: timeStr, select: false }))
}
</script>

<template>
  <button
    type="button"
    class="md-editor-toolbar-item md-editor-time-btn"
    :title="title"
    @click="handleClick"
  >
    <slot name="trigger">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="md-editor-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </slot>
  </button>
</template>

<style scoped lang="scss">
.md-editor-toolbar-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 2px;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--md-editor-hover-color, #e8e8e8);
  }
}

.md-editor-icon {
  pointer-events: none;
}
</style>
