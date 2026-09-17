<script setup>
/**
 * CommentItem 一级评论（第 n 楼）
 * 结构：头像 + 昵称/UP标识/楼层 + 正文 + 操作条（时间/点赞/回复/删除）+ 楼中楼 + 内联回复框
 * 本组件不持有数据，只把 like / reply / delete 意图上抛给 CommentSection。
 */
import { computed, ref } from "vue";
import { ElMessageBox } from "element-plus";
import BaseAvatar from "../base/BaseAvatar.vue";
import BaseButton from "../base/BaseButton.vue";
import CommentEditor from "./CommentEditor.vue";
import ReplyList from "./ReplyList.vue";
import { formatCount, floorLabel, formatRelativeTime } from "../utils/format.js";

const props = defineProps({
  // 一级评论对象
  comment: { type: Object, required: true },
  // 当前登录用户（用于判断是否可删除）
  currentUser: { type: Object, default: () => ({}) },
  // 楼中楼预览条数
  previewReplies: { type: Number, default: 2 },
  // 评论最大字数（透传给回复框）
  maxlength: { type: Number, default: 1000 },
  // 是否在头部显示「第 n 楼」文案（虚拟模式下楼层由 VirtualList 序号列承载，传 false）
  showFloor: { type: Boolean, default: true },
});

const emit = defineEmits(["like", "reply", "delete"]);

// —— 内联回复态 ——
const replying = ref(false);
const replyTarget = ref(null);

const isOwn = computed(() => props.comment.author?.id === props.currentUser?.id);

const replyPlaceholder = computed(() =>
  replyTarget.value
    ? `回复 @${replyTarget.value.name}`
    : `回复 @${props.comment.author?.name ?? ""}`,
);

// reply 为 null → 直接回复楼主；否则回复某条回复的作者
const startReply = (reply = null) => {
  replyTarget.value = reply ? { id: reply.author?.id, name: reply.author?.name } : null;
  replying.value = true;
};

const onEditorSend = (content) => {
  emit("reply", {
    commentId: props.comment.id,
    content,
    replyTo: replyTarget.value,
  });
  replying.value = false;
  replyTarget.value = null;
};

const onEditorCancel = () => {
  replying.value = false;
  replyTarget.value = null;
};

// —— 点赞 ——
const onLike = () => {
  emit("like", { comment: props.comment, reply: null });
};

const onReplyLike = (reply) => {
  emit("like", { comment: props.comment, reply });
};

// —— 删除（确认后上抛）——
const onDelete = async () => {
  try {
    await ElMessageBox.confirm("确定删除这条评论吗？", "删除评论", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    emit("delete", { comment: props.comment });
  } catch {
    // 用户取消，不做处理
  }
};
</script>

<template>
  <div class="bili-comment-item">
    <BaseAvatar
      class="bili-comment-item__avatar"
      :src="comment.author?.avatar"
      :name="comment.author?.name"
      :size="40"
      clickable
    />
    <div class="bili-comment-item__main">
      <div class="bili-comment-item__head">
        <span class="bili-comment-item__name">{{ comment.author?.name }}</span>
        <span v-if="comment.isUp" class="bili-comment-item__up">UP主</span>
        <span v-if="showFloor" class="bili-comment-item__floor">
          {{ floorLabel(comment.floor) }}
        </span>
      </div>

      <p class="bili-comment-item__content">{{ comment.content }}</p>

      <div class="bili-comment-item__actions">
        <span class="bili-comment-item__time">{{ formatRelativeTime(comment.createTime) }}</span>
        <div class="bili-comment-item__buttons">
          <BaseButton
            class="bili-comment-item__like"
            :active="comment.liked"
            @click="onLike"
          >
            <svg class="bili-comment-item__thumb" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M2 20h3V9H2v11zM22 10c0-1.1-.9-2-2-2h-6.3l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.58 7.59C6.22 7.95 6 8.45 6 9v9c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z" />
            </svg>
            <span v-if="comment.likeCount > 0">{{ formatCount(comment.likeCount) }}</span>
          </BaseButton>
          <BaseButton @click="startReply()">
            <el-icon class="bili-comment-item__reply-icon"><ChatDotRound /></el-icon>回复
          </BaseButton>
          <BaseButton v-if="isOwn" class="bili-comment-item__delete" @click="onDelete">
            删除
          </BaseButton>
        </div>
      </div>

      <ReplyList
        v-if="comment.replies?.length"
        :replies="comment.replies"
        :preview-count="previewReplies"
        @like="onReplyLike"
        @reply="startReply"
      />

      <div v-if="replying" class="bili-comment-item__reply-box">
        <CommentEditor
          :avatar="currentUser.avatar"
          :name="currentUser.name"
          :avatar-size="32"
          :placeholder="replyPlaceholder"
          submit-text="回复"
          :min-rows="2"
          :maxlength="maxlength"
          show-cancel
          auto-focus
          @send="onEditorSend"
          @cancel="onEditorCancel"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-comment-item {
  display: flex;
  gap: 12px;
  padding: 16px 0;

  &__avatar {
    margin-top: 2px;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: #61666d;
  }

  // UP 主标识
  &__up {
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid #fb7299;
    color: #fb7299;
    font-size: 11px;
    line-height: 16px;
  }

  &__floor {
    font-size: 12px;
    color: #9499a0;
  }

  &__content {
    margin: 6px 0 8px;
    font-size: 15px;
    line-height: 1.6;
    color: #18191c;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__time {
    font-size: 12px;
    color: #9499a0;
  }

  &__buttons {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  &__like {
    gap: 4px;
  }

  &__reply-icon {
    font-size: 14px;
    margin-right: 2px;
  }

  // 删除按钮使用危险色
  &__delete {
    --el-button-text-color: #61666d;
    --el-button-hover-text-color: #f34c4c;
  }

  &__reply-box {
    margin-top: 12px;
  }
}
</style>
