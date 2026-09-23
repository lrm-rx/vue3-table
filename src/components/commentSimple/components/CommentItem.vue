<script setup>
/**
 * CommentItem 一级评论（第 n 楼）
 * 结构：头像 + 头部（昵称/UP ...... 第 n 楼）+ 正文 + 操作条 + 楼中楼
 * 展开态（楼中楼是否展开全部）由父组件按 comment.id 持久化持有，
 * 保证远程刷新后已展开的回复不被折叠。
 */
import { computed, ref } from "vue";
import { ElMessageBox } from "element-plus";
import BaseAvatar from "../base/BaseAvatar.vue";
import CommentEditor from "./CommentEditor.vue";
import ReplyList from "./ReplyList.vue";
import { formatCount, floorLabel, formatRelativeTime, hasFloor } from "../utils/format.js";

const props = defineProps({
  comment: { type: Object, required: true },
  currentUser: { type: Object, default: () => ({}) },
  previewReplies: { type: Number, default: 2 },
  maxlength: { type: Number, default: 1000 },
  showFloor: { type: Boolean, default: true },
  // 楼中楼是否展开全部（由父组件按 comment.id 持有）
  expanded: { type: Boolean, default: false },
});

const emit = defineEmits(["like", "reply", "delete", "toggle-expand"]);

// —— 内联回复态 ——
const replying = ref(false);
const replyTarget = ref(null);
const replyAnchorId = ref(null);

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

const startReply = (reply = null) => {
  replyTarget.value = reply ? { id: reply.author?.id, name: reply.author?.name } : null;
  replyAnchorId.value = reply?.id ?? null;
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
  replyAnchorId.value = null;
};

const onEditorCancel = () => {
  replying.value = false;
  replyTarget.value = null;
  replyAnchorId.value = null;
};

const onLike = () => {
  emit("like", { comment: props.comment, reply: null });
};

const onReplyLike = (reply) => {
  emit("like", { comment: props.comment, reply });
};

const confirmDelete = async (message) => {
  try {
    await ElMessageBox.confirm(message, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    return true;
  } catch {
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

// 楼中楼展开/收起：上抛给父组件，由父组件按 comment.id 持久化
const onToggleExpand = () => {
  emit("toggle-expand");
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
        <span v-if="showFloor && hasFloor(comment)" class="bili-comment-item__floor">
          {{ floorLabel(comment.floor) }}
        </span>
      </div>

      <p class="bili-comment-item__content">{{ comment.content }}</p>

      <div class="bili-comment-item__actions">
        <span class="bili-comment-item__time">{{ formatRelativeTime(comment.createTime) }}</span>
        <div class="bili-comment-item__buttons">
          <el-button
            text
            size="small"
            class="bili-comment-item__action bili-comment-item__like"
            :type="comment.liked ? 'primary' : ''"
            @click="onLike"
          >
            点赞({{ formatCount(comment.likeCount) }})
          </el-button>
          <el-button
            text
            size="small"
            class="bili-comment-item__action"
            @click="startReply()"
          >
            回复({{ formatCount(replyCount) }})
          </el-button>
          <el-button
            v-if="canDelete"
            text
            size="small"
            class="bili-comment-item__action bili-comment-item__delete"
            @click="onDelete"
          >
            删除
          </el-button>
        </div>
      </div>

      <!-- 楼中楼：expanded 由父组件持有，保证刷新数据后不折叠 -->
      <ReplyList
        v-if="hasReplies || replying"
        :replies="comment.replies ?? []"
        :current-user="currentUser"
        :preview-count="previewReplies"
        :bare="!hasReplies"
        :replying="replying"
        :editor-reply-id="replyAnchorId"
        :expanded="expanded"
        @like="onReplyLike"
        @reply="startReply"
        @delete="onReplyDelete"
        @toggle="onToggleExpand"
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

  &__action {
    padding: 0;
    height: auto;
    min-height: 0;
    font-size: 12px;
  }
}
</style>
