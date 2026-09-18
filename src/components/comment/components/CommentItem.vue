<script setup>
/**
 * CommentItem 一级评论（第 n 楼）
 * 结构：头像 + 头部（昵称/UP标识 ...... 第 n 楼，两端对齐）+ 正文
 *       + 操作条（时间｜赞踩药丸/回复/删除）+ 楼中楼（含内联回复框）
 * 本组件不持有服务端数据，只把 like / reply / delete 意图上抛给 CommentSection；
 * 点踩（无计数展示）为纯本地态。
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
  // 是否在头部右端显示「第 n 楼」文案
  showFloor: { type: Boolean, default: true },
});

const emit = defineEmits(["like", "reply", "delete"]);

// —— 内联回复态 ——
const replying = ref(false);
const replyTarget = ref(null);

// —— 点踩：纯本地态（B 站新版点踩不展示数量）——
const disliked = ref(false);
const toggleDislike = () => {
  disliked.value = !disliked.value;
};

const isOwn = computed(() => props.comment.author?.id === props.currentUser?.id);

const hasReplies = computed(
  () => Array.isArray(props.comment.replies) && props.comment.replies.length > 0,
);

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
        <div class="bili-comment-item__head-info">
          <span class="bili-comment-item__name">{{ comment.author?.name }}</span>
          <span v-if="comment.isUp" class="bili-comment-item__up">UP主</span>
        </div>
        <span v-if="showFloor" class="bili-comment-item__floor">
          {{ floorLabel(comment.floor) }}
        </span>
      </div>

      <p class="bili-comment-item__content">{{ comment.content }}</p>

      <div class="bili-comment-item__actions">
        <span class="bili-comment-item__time">{{ formatRelativeTime(comment.createTime) }}</span>
        <div class="bili-comment-item__buttons">
          <!-- 点赞 / 点踩组合药丸（新版右置） -->
          <div class="bili-comment-item__rate">
            <BaseButton
              class="bili-comment-item__rate-btn bili-comment-item__rate-like"
              :active="comment.liked"
              @click="onLike"
            >
              <svg
                class="bili-comment-item__thumb"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M2 20h3V9H2v11zM22 10c0-1.1-.9-2-2-2h-6.3l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.58 7.59C6.22 7.95 6 8.45 6 9v9c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"
                />
              </svg>
              <span v-if="comment.likeCount > 0" class="bili-comment-item__rate-count">
                {{ formatCount(comment.likeCount) }}
              </span>
            </BaseButton>
            <span class="bili-comment-item__rate-divider" />
            <BaseButton
              class="bili-comment-item__rate-btn bili-comment-item__rate-dislike"
              :active="disliked"
              title="点踩"
              @click="toggleDislike"
            >
              <svg
                class="bili-comment-item__thumb"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  transform="rotate(180 12 12)"
                  d="M2 20h3V9H2v11zM22 10c0-1.1-.9-2-2-2h-6.3l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.58 7.59C6.22 7.95 6 8.45 6 9v9c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"
                />
              </svg>
            </BaseButton>
          </div>

          <BaseButton class="bili-comment-item__reply" @click="startReply()">
            <svg
              class="bili-comment-item__reply-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M21 11.5a8.5 8.5 0 0 1-12.2 7.66L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"
              />
            </svg>
            回复
          </BaseButton>
          <BaseButton v-if="isOwn" class="bili-comment-item__delete" @click="onDelete">
            删除
          </BaseButton>
        </div>
      </div>

      <!-- 楼中楼灰卡：有回复或回复框展开时渲染；bare=无回复时不显示灰底 -->
      <ReplyList
        v-if="hasReplies || replying"
        :replies="comment.replies ?? []"
        :preview-count="previewReplies"
        :bare="!hasReplies"
        @like="onReplyLike"
        @reply="startReply"
      >
        <template #editor>
          <CommentEditor
            v-if="replying"
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
        </template>
      </ReplyList>
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

  // 头部：左（昵称 + UP 标识成组）/ 右（第 n 楼）两端对齐
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__head-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
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
    flex: none;
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
    gap: 12px;
  }

  // —— 赞 / 踩 药丸 ——
  &__rate {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 2px;
    border-radius: 999px;
    background-color: #f6f7f8;

    // 组内 EP 文本按钮去默认外边距 / 内边距，贴合药丸
    :deep(.el-button) {
      margin: 0;
      height: 24px;
      min-height: 24px;
      padding: 0 10px;
      border-radius: 999px;
      font-size: 12px;
      --el-button-text-color: #61666d;
      --el-button-hover-text-color: #fb7299;
      --el-button-hover-bg-color: transparent;
      --el-button-active-bg-color: transparent;

      &:hover,
      &:focus {
        background-color: #feebf0;
        color: #fb7299;
      }
    }
  }

  &__rate-btn {
    gap: 4px;
  }

  &__rate-count {
    line-height: 1;
  }

  &__rate-divider {
    flex: none;
    width: 1px;
    height: 12px;
    margin: 0 1px;
    background-color: #e3e5e7;
  }

  // 已点赞：粉色胶囊（选择器需覆盖 EP .el-button.is-text 的 hover/focus 规则）
  :deep(.el-button.bili-comment-item__rate-like.is-active),
  :deep(.el-button.bili-comment-item__rate-like.is-active:hover),
  :deep(.el-button.bili-comment-item__rate-like.is-active:focus) {
    background-color: #fb7299;
    border-color: #fb7299;
    color: #fff;
  }

  // 已点踩：深色图标（无计数）
  :deep(.el-button.bili-comment-item__rate-dislike.is-active),
  :deep(.el-button.bili-comment-item__rate-dislike.is-active:hover),
  :deep(.el-button.bili-comment-item__rate-dislike.is-active:focus) {
    background-color: transparent;
    color: #18191c;
  }

  &__reply {
    gap: 3px;
    font-size: 12px;
  }

  &__reply-icon {
    flex: none;
  }

  // 删除按钮使用危险色
  &__delete {
    font-size: 12px;
    --el-button-text-color: #61666d;
    --el-button-hover-text-color: #f34c4c;
  }
}
</style>
