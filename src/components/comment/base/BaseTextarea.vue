<script setup>
/**
 * BaseTextarea 评论输入框
 * 基于 element-plus ElInput（type=textarea）二次封装：
 *  - 自适应高度（autosize）
 *  - 字数统计（show-word-limit）
 *  - 统一圆角与聚焦高亮
 * 注意：EP 2.x 的 textarea 边框是用 inset box-shadow 实现的（border:none），
 * 因此描边必须覆盖 box-shadow；inset 阴影绘制在 border-box 内侧，
 * 不会被父级 overflow 裁剪，虚拟列表内也不会出现「右边框被遮挡」。
 */
import { computed, nextTick, ref } from "vue";

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

// 取到底层原生 textarea（EP 实例属性在不同小版本间有差异，$el 查询兜底）
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

// 透传 focus 给父组件（回复框展开后自动聚焦）
const focus = () => {
  inputRef.value?.focus?.();
};

// 在光标处插入文本（表情 / @），插入后恢复光标并保持聚焦
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
    // EP textarea 的 1px 描边由 inset 环实现（border 为 none），覆盖默认环
    box-shadow: 0 0 0 1px #e3e5e7 inset;
    // autosize 已自动撑高，禁用原生拖拽柄（会盖住右下角描边）
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

  // 字数统计颜色（贴在输入框内右下角）
  :deep(.el-input__count) {
    color: #9499a0;
    font-size: 12px;
    background: transparent;
  }
}
</style>
