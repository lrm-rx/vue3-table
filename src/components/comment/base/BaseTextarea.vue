<script setup>
/**
 * BaseTextarea 评论输入框
 * 基于 element-plus ElInput（type=textarea）二次封装：
 *  - 自适应高度（autosize）
 *  - 字数统计（show-word-limit）
 *  - 统一圆角边框与聚焦高亮
 */
import { computed, ref } from "vue";

const props = defineProps({
  // 输入值（v-model）
  modelValue: { type: String, default: "" },
  // 占位文本
  placeholder: { type: String, default: "发一条友善的评论…" },
  // 最大字数
  maxlength: { type: Number, default: 1000 },
  // 最小行数
  minRows: { type: Number, default: 3 },
  // 最大行数（超出后内部滚动）
  maxRows: { type: Number, default: 10 },
  // 是否展示字数统计
  showCount: { type: Boolean, default: true },
  // 禁用
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue", "focus", "keydown"]);

const inputRef = ref(null);

// 自适应高度配置（ElInput autosize）
const autosize = computed(() => ({
  minRows: props.minRows,
  maxRows: props.maxRows,
}));

const onInput = (value) => {
  emit("update:modelValue", value);
};

const onFocus = (event) => {
  emit("focus", event);
};

const onKeydown = (event) => {
  emit("keydown", event);
};

// 透传 focus 给父组件（回复框展开后自动聚焦）
const focus = () => {
  inputRef.value?.focus?.();
};

defineExpose({ focus });
</script>

<template>
  <el-input
    ref="inputRef"
    class="biz-textarea"
    :model-value="modelValue"
    type="textarea"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :autosize="autosize"
    :show-word-limit="showCount"
    :disabled="disabled"
    :input-style="{ padding: '10px 12px' }"
    @update:model-value="onInput"
    @focus="onFocus"
    @keydown="onKeydown"
  />
</template>

<style scoped lang="scss">
.biz-textarea {
  :deep(.el-textarea__inner) {
    border-radius: 8px;
    border-color: #e3e5e7;
    background-color: #f6f7f8;
    color: #18191c;
    font-size: 13px;
    line-height: 1.6;
    box-shadow: none;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      box-shadow 0.2s ease;

    &::placeholder {
      color: #9499a0;
    }

    &:hover {
      border-color: #c9ccd0;
      background-color: #fff;
    }

    &:focus {
      border-color: #fb7299;
      background-color: #fff;
      box-shadow: 0 0 0 2px rgba(251, 114, 153, 0.12);
    }
  }

  // 字数统计颜色
  :deep(.el-input__count) {
    color: #9499a0;
    font-size: 12px;
  }
}
</style>
