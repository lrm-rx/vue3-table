<script setup>
/**
 * ReplyItem 楼中楼单条回复（扁平，不嵌套）
 * 文案规则：
 *  - replyTo 为空：「A：内容」
 *  - replyTo 存在：「A 回复 B：内容」
 * 仅负责渲染并上抛 like / reply 意图，不修改数据。
 */
import BaseAvatar from "../base/BaseAvatar.vue";
import BaseButton from "../base/BaseButton.vue";
import { formatCount, formatRelativeTime } from "../utils/format.js";

const props = defineProps({
  // 回复对象：{ id, author, content, createTime, likeCount, liked, replyTo }
  reply: { type: Object, required: true },
});

const emit = defineEmits(["like", "reply"]);

const onLike = () => {
  emit("like", props.reply);
};

const onReply = () => {
  emit("reply", props.reply);
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
        <BaseButton class="bili-reply-item__like" :active="reply.liked" @click="onLike">
          <svg class="bili-reply-item__thumb" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <path d="M2 20h3V9H2v11zM22 10c0-1.1-.9-2-2-2h-6.3l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.58 7.59C6.22 7.95 6 8.45 6 9v9c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z" />
          </svg>
          <span v-if="reply.likeCount > 0">{{ formatCount(reply.likeCount) }}</span>
        </BaseButton>
        <BaseButton @click="onReply">回复</BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-reply-item {
  display: flex;
  gap: 8px;

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
    gap: 10px;
    margin-top: 2px;
  }

  &__time {
    font-size: 12px;
    color: #9499a0;
  }

  &__like {
    gap: 3px;
  }
}
</style>
