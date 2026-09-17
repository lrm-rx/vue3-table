<script setup>
/**
 * CommentHeader 评论区头部
 * 左侧评论总数，右侧排序切换（最热 / 最新）。
 * 排序值通过 v-model 双向同步。
 */
import BaseButton from "../base/BaseButton.vue";

const props = defineProps({
  // 评论总数
  total: { type: Number, default: 0 },
  // 当前排序：hot 最热 / latest 最新
  modelValue: { type: String, default: "hot" },
});

const emit = defineEmits(["update:modelValue"]);

const tabs = [
  { value: "hot", label: "最热" },
  { value: "latest", label: "最新" },
];

const changeSort = (value) => {
  if (value === props.modelValue) return;
  emit("update:modelValue", value);
};
</script>

<template>
  <div class="bili-comment-header">
    <span class="bili-comment-header__total">共 {{ total }} 条评论</span>
    <div class="bili-comment-header__tabs">
      <BaseButton
        v-for="tab in tabs"
        :key="tab.value"
        class="bili-comment-header__tab"
        :class="{ 'is-active': modelValue === tab.value }"
        :active="modelValue === tab.value"
        @click="changeSort(tab.value)"
      >
        {{ tab.label }}
        <span v-if="modelValue === tab.value" class="bili-comment-header__indicator" />
      </BaseButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;

  &__total {
    font-size: 16px;
    font-weight: 600;
    color: #18191c;
  }

  &__tabs {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  &__tab {
    position: relative;
    font-size: 14px;
    padding: 2px 0;

    &.is-active {
      font-weight: 600;
    }
  }

  // Tab 下划线指示器
  &__indicator {
    position: absolute;
    left: 50%;
    bottom: -6px;
    transform: translateX(-50%);
    width: 18px;
    height: 3px;
    border-radius: 2px;
    background-color: #fb7299;
  }
}
</style>
