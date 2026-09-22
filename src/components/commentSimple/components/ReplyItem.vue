<script setup>
/**
 * ReplyItem 楼中楼单条回复（扁平，不嵌套）
 * 文案规则：
 *  - replyTo 为空：「A：内容」
 *  - replyTo 存在：「A 回复 B：内容」
 * 删除权限：本人或管理员（currentUser.role === 'admin'）可删。
 */
import { computed } from "vue";
import BaseAvatar from "../base/BaseAvatar.vue";
import { formatCount, formatRelativeTime } from "../utils/format.js";

const props = defineProps({
  reply: { type: Object, required: true },
  currentUser: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["like", "reply", "delete"]);

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
        <el-button
          text
          size="small"
          class="bili-reply-item__action bili-reply-item__like"
          :type="reply.liked ? 'primary' : ''"
          @click="onLike"
        >
          点赞({{ formatCount(reply.likeCount) }})
        </el-button>
        <el-button text size="small" class="bili-reply-item__action" @click="onReply">
          回复
        </el-button>
        <el-button
          v-if="canDelete"
          text
          size="small"
          class="bili-reply-item__action bili-reply-item__delete"
          @click="onDelete"
        >
          删除
        </el-button>
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
    font-size: 12px;
    padding: 0;
    height: auto;
    min-height: 0;
  }
}
</style>
