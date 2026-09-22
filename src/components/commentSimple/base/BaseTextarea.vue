<script setup>
/**
 * BaseTextarea 评论输入框
 * 基于 element-plus ElInput（type=textarea）二次封装：
 *  - 自适应高度（autosize）
 *  - 字数统计（show-word-limit）
 *  - 统一圆角与聚焦高亮
 */
import { computed, nextTick, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "发一条友善的评论…" },
  maxlength: { type: Number, default: 1000 },
  minRows: { type: Number, default: 3 },
  maxRows: { type: Number, default: 10 },
  showCount: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue", "focus", "keydown"]);

const inputRef = ref(null);

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

const getNativeEl = () => {
  const inst = inputRef.value;
  return (
    inst?.textarea ??
    inst?.input ??
    inst?.ref ??
    inst?.$el?.querySelector?.("textarea") ??
    null
  );
};

const focus = () => {
  inputRef.value?.focus?.();
};

const insertText = async (snippet) => {
  const el = getNativeEl();
  if (!el) {
    emit("update:modelValue", `${props.modelValue}${snippet}`);
    return;
  }
  el.focus();
  const start = el.selectionStart ?? props.modelValue.length;
  const end = el.selectionEnd ?? props.modelValue.length;
  const next = props.modelValue.slice(0, start) + snippet + props.modelValue.slice(end);
  emit("update:modelValue", next);
  await nextTick();
  const pos = start + snippet.length;
  el.setSelectionRange?.(pos, pos);
};

defineExpose({ focus, insertText });
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
    background-color: #f6f7f8;
    color: #18191c;
    font-size: 13px;
    line-height: 1.6;
    box-shadow: 0 0 0 1px #e3e5e7 inset;
    resize: none;
    transition:
      box-shadow 0.2s ease,
      background-color 0.2s ease;

    &::placeholder {
      color: #9499a0;
    }

    &:hover {
      background-color: #fff;
      box-shadow: 0 0 0 1px #c9ccd0 inset;
    }

    &:focus {
      background-color: #fff;
      outline: none;
      box-shadow: 0 0 0 1px #fb7299 inset;
    }
  }

  :deep(.el-input__count) {
    color: #9499a0;
    font-size: 12px;
    background: transparent;
  }
}
</style>
