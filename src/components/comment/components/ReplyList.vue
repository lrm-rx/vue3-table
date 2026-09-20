<script setup>
/**
 * ReplyList 楼中楼回复列表（仿 bilibili 新版灰卡）
 *  - 默认只预览前 previewCount（默认 2）条
 *  - 超出后展示「查看全部 n 条回复」，就地展开全部；展开后可收起
 *  - editor 插槽：内联回复框渲染在卡片底部（与 B 站一致）
 *  - bare 模式（无回复仅展示回复框）：无灰底/内边距
 *  - 事件（like / reply / delete）统一上抛给 CommentItem
 */
import { computed, ref } from "vue";
import BaseButton from "../base/BaseButton.vue";
import ReplyItem from "./ReplyItem.vue";

const props = defineProps({
  // 扁平回复数组
  replies: { type: Array, default: () => [] },
  // 当前登录用户（透传给 ReplyItem 判断删除权限；role === 'admin' 为管理员）
  currentUser: { type: Object, default: () => ({}) },
  // 预览条数
  previewCount: { type: Number, default: 2 },
  // 朴素模式：无回复数据、仅承载回复框时不显示灰卡背景
  bare: { type: Boolean, default: false },
});

const emit = defineEmits(["like", "reply", "delete"]);

const expanded = ref(false);

const total = computed(() => props.replies.length);

const visibleReplies = computed(() =>
  expanded.value ? props.replies : props.replies.slice(0, props.previewCount),
);

const showToggle = computed(() => total.value > props.previewCount);

const toggle = () => {
  expanded.value = !expanded.value;
};

const onLike = (reply) => {
  emit("like", reply);
};

const onReply = (reply) => {
  emit("reply", reply);
};

const onDelete = (reply) => {
  emit("delete", reply);
};
</script>

<template>
  <div class="bili-reply-list" :class="{ 'is-bare': bare }">
    <ReplyItem
      v-for="reply in visibleReplies"
      :key="reply.id"
      :reply="reply"
      :current-user="currentUser"
      @like="onLike"
      @reply="onReply"
      @delete="onDelete"
    />
    <BaseButton
      v-if="showToggle"
      class="bili-reply-list__toggle"
      @click="toggle"
    >
      <template v-if="!expanded">查看全部 {{ total }} 条回复</template>
      <template v-else>收起回复</template>
      <svg
        class="bili-reply-list__chevron"
        :class="{ 'is-expanded': expanded }"
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </BaseButton>

    <!-- 内联回复框（由 CommentItem 注入） -->
    <div v-if="$slots.editor" class="bili-reply-list__editor">
      <slot name="editor" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-reply-list {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background-color: #f6f7f8;

  display: flex;
  flex-direction: column;
  gap: 6px;

  // 朴素模式：仅回复框，无灰卡
  &.is-bare {
    margin-top: 12px;
    padding: 0;
    background-color: transparent;
  }

  &__toggle {
    align-self: flex-start;
    gap: 2px;
    font-size: 13px;
    padding: 2px 0;
  }

  &__chevron {
    transition: transform 0.2s ease;
    // 折叠态：右箭头（›）；展开态旋转 90° 向下
    transform: rotate(0deg);

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  // 灰卡内回复框：白色底与卡片拉开层次（与 B 站一致）
  &:not(.is-bare) &__editor {
    margin-top: 6px;

    :deep(.el-textarea__inner) {
      background-color: #fff;
    }
  }

  &.is-bare &__editor {
    margin-top: 0;
  }
}
</style>
