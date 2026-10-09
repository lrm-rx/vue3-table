<script setup>
/**
 * CharCount —— 自定义页脚：字数统计（已过滤 base64 图片编码）
 *
 * 替换 md-editor-v3 内置的 markdownTotal 页脚。
 * 内置 markdownTotal 直接用 modelValue.length 统计，会把 base64 图片编码
 * 产生的数千~数万字符计入正文，导致字数虚高。
 * 本组件接收父组件计算好的「过滤后字数」进行展示，样式与内置页脚保持一致。
 */
defineProps({
  /** 过滤 base64 后的正文字数（由父组件 countMarkdownChars 计算） */
  count: {
    type: Number,
    default: 0,
  },
})
</script>

<template>
  <div class="md-editor-footer-item">
    <label class="md-editor-footer-label">字数：</label>
    <span>{{ count }}</span>
  </div>
</template>
