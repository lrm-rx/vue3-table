<script setup>
/**
 * CommentItem 一级评论（第 n 楼）
 * 结构：头像 + 头部（昵称/UP标识 ...... 第 n 楼，两端对齐）+ 正文
 *       + 操作条（时间｜点赞/回复/删除文本按钮）+ 楼中楼（含内联回复框）
 * 本组件不持有服务端数据，只把 like / reply / delete 意图上抛给 CommentSection；
 * 点赞 / 回复为文本按钮并展示计数（如「点赞(10)」「回复(12)」）。
 * 删除权限：自己的评论 / 回复可删；currentUser.role === 'admin' 时可删除任意内容。
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
  // 当前登录用户（用于判断是否可删除；role === 'admin' 为管理员）
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

// —— 删除权限：本人 或 管理员 ——
const isAdmin = computed(() => props.currentUser?.role === "admin");
const isOwn = computed(() => props.comment.author?.id === props.currentUser?.id);
const canDelete = computed(() => isOwn.value || isAdmin.value);

const replyCount = computed(() => props.comment.replies?.length ?? 0);

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

// —— 删除（确认后上抛；reply 为 null 表示删一级评论）——
const confirmDelete = async (message) => {
  try {
    await ElMessageBox.confirm(message, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    return true;
  } catch {
    // 用户取消，不做处理
    return false;
  }
};

const onDelete = async () => {
  if (!(await confirmDelete("确定删除这条评论吗？"))) return;
  emit("delete", { comment: props.comment, reply: null });
};

const onReplyDelete = async (reply) => {
  if (!(await confirmDelete("确定删除这条回复吗？"))) return;
  emit("delete", { comment: props.comment, reply });
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
          <!-- 点赞 / 回复 / 删除：纯文本按钮，点赞与回复展示计数 -->
          <BaseButton
            class="bili-comment-item__action bili-comment-item__like"
            :active="comment.liked"
            @click="onLike"
          >
            点赞({{ formatCount(comment.likeCount) }})
          </BaseButton>
          <BaseButton class="bili-comment-item__action" @click="startReply()">
            回复({{ formatCount(replyCount) }})
          </BaseButton>
          <BaseButton
            v-if="canDelete"
            class="bili-comment-item__action bili-comment-item__delete"
            @click="onDelete"
          >
            删除
          </BaseButton>
        </div>
      </div>

      <!-- 楼中楼灰卡：有回复或回复框展开时渲染；bare=无回复时不显示灰底 -->
      <ReplyList
        v-if="hasReplies || replying"
        :replies="comment.replies ?? []"
        :current-user="currentUser"
        :preview-count="previewReplies"
        :bare="!hasReplies"
        @like="onReplyLike"
        @reply="startReply"
        @delete="onReplyDelete"
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

  // 点赞 / 回复 / 删除：纯文本按钮
  &__action {
    padding: 0;
    height: auto;
    min-height: 0;
    font-size: 12px;
  }

  // 删除按钮 hover 使用危险色
  &__delete {
    --el-button-text-color: #61666d;
    --el-button-hover-text-color: #f34c4c;
  }
}
</style>
