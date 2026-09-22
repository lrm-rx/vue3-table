<script setup>
/**
 * CommentHeader 评论区头部
 * 左侧「评论 + 总数」，右侧排序切换（最热 / 最新）。
 */
const props = defineProps({
  total: { type: Number, default: 0 },
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
    <div class="bili-comment-header__title">
      <span class="bili-comment-header__label">评论</span>
      <span class="bili-comment-header__total">{{ total }}</span>
    </div>
    <div class="bili-comment-header__tabs">
      <el-button
        v-for="tab in tabs"
        :key="tab.value"
        text
        size="small"
        class="bili-comment-header__tab"
        :class="{ 'is-active': modelValue === tab.value }"
        :type="modelValue === tab.value ? 'primary' : ''"
        @click="changeSort(tab.value)"
      >
        {{ tab.label }}
        <span v-if="modelValue === tab.value" class="bili-comment-header__indicator" />
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;

  &__title {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  &__label {
    font-size: 18px;
    font-weight: 600;
    color: #18191c;
    line-height: 1.2;
  }

  &__total {
    font-size: 13px;
    color: #9499a0;
  }

  &__tabs {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  &__tab {
    position: relative;
    font-size: 14px;
    padding: 2px 0;

    &.is-active {
      font-weight: 600;
    }
  }

  &__indicator {
    position: absolute;
    left: 50%;
    bottom: -8px;
    transform: translateX(-50%);
    width: 18px;
    height: 3px;
    border-radius: 2px;
    background-color: var(--el-color-primary);
  }
}
</style>
