<script setup>
/**
 * ReplyItem 楼中楼单条回复（扁平，不嵌套，仿 bilibili 新版）
 * 文案规则：
 *  - replyTo 为空：「A：内容」
 *  - replyTo 存在：「A 回复 B：内容」
 * 新版楼中楼直接展示互动行：时间 · 点赞(计数) · 回复 · 删除（纯文本按钮，无图标）。
 * 删除权限：本人或管理员（currentUser.role === 'admin'）可删，仅上抛意图，确认弹窗在 CommentItem。
 */
import { computed } from "vue";
import BaseAvatar from "../base/BaseAvatar.vue";
import BaseButton from "../base/BaseButton.vue";
import { formatCount, formatRelativeTime } from "../utils/format.js";

const props = defineProps({
  // 回复对象：{ id, author, content, createTime, likeCount, liked, replyTo }
  reply: { type: Object, required: true },
  // 当前登录用户（判断是否可删除；role === 'admin' 为管理员）
  currentUser: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["like", "reply", "delete"]);

// 删除权限：本人 或 管理员
const canDelete = computed(
  () =>
    props.reply.author?.id === props.currentUser?.id ||
    props.currentUser?.role === "admin",
);

const onLike = () => {
  emit("like", props.reply);
};

const onReply = () => {
  emit("reply", props.reply);
};

const onDelete = () => {
  emit("delete", props.reply);
};
</script>

<template>
  <div class="bili-reply-item">
    <BaseAvatar
      :src="reply.author?.avatar"
      :name="reply.author?.name"
      :size="24"
      class="bili-reply-item__avatar"
      clickable
    />
    <div class="bili-reply-item__body">
      <p class="bili-reply-item__text">
        <span class="bili-reply-item__name">{{ reply.author?.name }}</span>
        <template v-if="reply.replyTo">
          <span class="bili-reply-item__reply-to"> 回复 </span>
          <span class="bili-reply-item__name">{{ reply.replyTo.name }}</span>
        </template>
        <span class="bili-reply-item__colon">：</span>{{ reply.content }}
      </p>
      <div class="bili-reply-item__meta">
        <span class="bili-reply-item__time">{{ formatRelativeTime(reply.createTime) }}</span>
        <BaseButton
          class="bili-reply-item__action bili-reply-item__like"
          :active="reply.liked"
          @click="onLike"
        >
          点赞({{ formatCount(reply.likeCount) }})
        </BaseButton>
        <BaseButton class="bili-reply-item__action" @click="onReply">回复</BaseButton>
        <BaseButton
          v-if="canDelete"
          class="bili-reply-item__action bili-reply-item__delete"
          @click="onDelete"
        >
          删除
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-reply-item {
  display: flex;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  // 新版楼中楼：行 hover 提亮
  &:hover {
    background-color: #fff;
  }

  &__avatar {
    margin-top: 2px;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__text {
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
    color: #18191c;
    word-break: break-word;
  }

  &__name {
    color: #61666d;
    font-weight: 500;
  }

  &__reply-to,
  &__colon {
    color: #9499a0;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 1px;
  }

  &__time {
    font-size: 12px;
    color: #9499a0;
  }

  &__action {
    gap: 3px;
    font-size: 12px;
    padding: 0;
    height: auto;
    min-height: 0;
  }

  // 删除按钮 hover 使用危险色
  &__delete {
    --el-button-text-color: #61666d;
    --el-button-hover-text-color: #f34c4c;
  }
}
</style>
