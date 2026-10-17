<script setup>
/**
 * CatalogToggle 工具栏扩展组件 —— 显示/隐藏自定义目录面板
 * 放在 MdEditor 的 #defToolbars 插槽中，由 resolvedToolbars 按目录面板位置注入：
 * 目录在左 → 按钮在工具栏最前；目录在右 → 按钮在工具栏最后（视觉同侧）
 */
import { computed } from 'vue'

const props = defineProps({
  // 目录面板当前是否可见（控制按钮激活态样式与 tooltip）
  active: {
    type: Boolean,
    default: false,
  },
  // 目录面板位置：left / right（图标中的侧边栏随之镜像，与面板同侧）
  position: {
    type: String,
    default: 'right',
    validator: (v) => ['left', 'right'].includes(v),
  },
  // 编辑器禁用态（md-editor-v3 会下发），用于同步置灰样式与阻止点击
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle'])

const title = computed(() => (props.active ? '隐藏目录' : '显示目录'))

const handleClick = () => {
  if (props.disabled) return
  emit('toggle')
}
</script>

<template>
  <button
    type="button"
    class="md-editor-toolbar-item md-editor-catalog-toggle-btn"
    :class="{ 'md-editor-catalog-toggle-btn--active': active, 'md-editor-disabled': disabled }"
    :disabled="disabled"
    :title="title"
    @click="handleClick"
  >
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
      :class="{ 'md-editor-icon--flip': position === 'left' }"
    >
      <!-- 侧边面板图标：外框 + 竖向分隔条（默认面板在右，左置时整体水平镜像） -->
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <!-- 面板侧的两条短横线，示意目录条目 -->
      <line x1="17" y1="8" x2="19" y2="8" />
      <line x1="17" y1="12" x2="19" y2="12" />
    </svg>
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

  // 与 md-editor 工具栏按钮 hover 背景一致（变量按 light/dark 主题自动切换）
  &:not(:disabled):hover {
    background-color: var(--md-bk-color-outstand, #f2f2f2);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;

    &:hover {
      background-color: transparent;
    }
  }
}

// 目录可见时的激活态：持续高亮背景，与 md-editor 工具栏激活态（.md-editor-toolbar-active）一致
.md-editor-catalog-toggle-btn--active {
  background-color: var(--md-bk-color-outstand, #f2f2f2);
}

.md-editor-icon {
  pointer-events: none;

  // 目录在左侧时图标水平镜像（侧边栏翻到左边）
  &--flip {
    transform: scaleX(-1);
  }
}
</style>
