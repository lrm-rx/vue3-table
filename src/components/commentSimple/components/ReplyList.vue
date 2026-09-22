<script setup>
/**
 * ReplyList 楼中楼回复列表（简化版）
 *  - 默认只预览前 previewCount 条
 *  - 超出后展示「查看全部 n 条回复」，就地展开全部；展开后可收起
 *  - 展开态由父组件持有（expanded prop + toggle emit）：
 *    远程模式下父组件刷新 comments 数据时，展开态不会因组件复用/重建而丢失，
 *    已展开的回复列表保持展开。
 *  - editor 插槽：内联回复框就近展开
 */
import { computed } from "vue";
import ReplyItem from "./ReplyItem.vue";

const props = defineProps({
  replies: { type: Array, default: () => [] },
  currentUser: { type: Object, default: () => ({}) },
  previewCount: { type: Number, default: 2 },
  bare: { type: Boolean, default: false },
  replying: { type: Boolean, default: false },
  editorReplyId: { type: String, default: null },
  // 展开态由父组件持有（comment id 维度持久化），保证数据刷新后不折叠
  expanded: { type: Boolean, default: false },
});

const emit = defineEmits(["like", "reply", "delete", "toggle"]);

const total = computed(() => props.replies.length);

const visibleReplies = computed(() =>
  props.expanded ? props.replies : props.replies.slice(0, props.previewCount),
);

const showToggle = computed(() => total.value > props.previewCount);

const toggle = () => {
  emit("toggle");
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
    <!-- 回复楼主：编辑器置顶 -->
    <div
      v-if="replying && editorReplyId === null"
      class="bili-reply-list__editor bili-reply-list__editor--top"
    >
      <slot name="editor" />
    </div>

    <template v-for="reply in visibleReplies" :key="reply.id">
      <ReplyItem
        :reply="reply"
        :current-user="currentUser"
        @like="onLike"
        @reply="onReply"
        @delete="onDelete"
      />
      <!-- 回复某条回复：编辑器插在该条正下方 -->
      <div v-if="replying && editorReplyId === reply.id" class="bili-reply-list__editor">
        <slot name="editor" />
      </div>
    </template>
    <el-button
      v-if="showToggle"
      text
      size="small"
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
    </el-button>
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
    transform: rotate(0deg);

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  &:not(.is-bare) &__editor {
    :deep(.el-textarea__inner) {
      background-color: #fff;
    }
  }

  &.is-bare &__editor {
    margin-top: 0;
  }
}
</style>
