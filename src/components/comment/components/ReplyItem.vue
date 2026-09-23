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
import { formatCount, formatRelativeTime, isTempId } from "../utils/format.js";

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
// 未确认（临时 id）的回复：创建请求在途，禁用点赞/删除
const pending = computed(() => isTempId(props.reply?.id));

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
          :disabled="pending"
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
          :disabled="pending"
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

  // 点赞 / 回复 / 删除：纯文本按钮（紧凑布局，颜色用 EP 默认主题）
  &__action {
    font-size: 12px;
    padding: 0;
    height: auto;
    min-height: 0;
  }
}
</style>
