<script setup>
/**
 * ReplyList 楼中楼回复列表（仿 bilibili 新版灰卡）
 *  - 默认只预览前 previewCount（默认 2）条
 *  - 超出后展示「查看全部 n 条回复」，就地展开全部；展开后可收起
 *  - editor 插槽：内联回复框**就近展开**——回复楼主时渲染在卡片顶部（全部回复之上），
 *    回复某条回复时插在该条正下方（由 replying / editorReplyId 控制）
 *  - bare 模式（无回复仅展示回复框）：无灰底/内边距
 *  - 事件（like / reply / delete）统一上抛给 CommentItem
 */
import { computed, ref } from "vue";
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
  // 回复框展开中（true 时渲染 editor 插槽内容）
  replying: { type: Boolean, default: false },
  // 正在回复的回复 id；null = 回复楼主（编辑器置顶），否则编辑器插在该条回复正下方
  editorReplyId: { type: String, default: null },
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
    <!-- 回复楼主：编辑器置顶（全部回复之上，紧邻操作条，无需滚动） -->
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
      <!-- 回复某条回复：编辑器插在该条正下方（replyTo 上下文就近） -->
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

  // 灰卡内回复框：白色底与卡片拉开层次（与 B 站一致）；置顶时上边距由 gap 提供
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
