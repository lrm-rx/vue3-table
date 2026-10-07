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
import CommentEditor from "./CommentEditor.vue";
import ReplyList from "./ReplyList.vue";
import { formatCount, floorLabel, formatRelativeTime, hasFloor, isTempId } from "../utils/format.js";

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
  // 全局激活的编辑器（单例，由父组件持有）：{ commentId, replyId } | null；replyId=null 表示回复楼主
  activeEditor: { type: Object, default: null },
});

const emit = defineEmits(["like", "reply", "delete", "open-editor", "close-editor"]);

// —— 内联回复态：由父组件单例 activeEditor 派生，保证全局同一时刻只有一个回复框 ——
const replying = computed(() => props.activeEditor?.commentId === props.comment.id);
// 编辑器锚点 replyId（null = 回复楼主，编辑器置顶；否则 = 回复楼中楼，就近插入该条下方）
const editorReplyId = computed(() => (replying.value ? props.activeEditor.replyId : null));
// ReplyList 实例：发送回复后触发展开，保证新插入的回复立即可见
const replyListRef = ref(null);

// —— 删除权限：本人 或 管理员 ——
const isAdmin = computed(() => props.currentUser?.role === "admin");
const isOwn = computed(() => props.comment.author?.id === props.currentUser?.id);
const canDelete = computed(() => isOwn.value || isAdmin.value);
// 未确认（临时 id）的评论：创建请求在途，禁用点赞/删除，避免对服务端不存在的记录发请求
const pending = computed(() => isTempId(props.comment?.id));

const replyCount = computed(() => props.comment.replies?.length ?? 0);

const hasReplies = computed(
  () => Array.isArray(props.comment.replies) && props.comment.replies.length > 0,
);

const replyPlaceholder = computed(() => {
  if (!replying.value) return `回复 @${props.comment.author?.name ?? ""}`;
  const rid = props.activeEditor.replyId;
  if (rid == null) return `回复 @${props.comment.author?.name ?? ""}`;
  const r = (props.comment.replies ?? []).find((x) => x.id === rid);
  return r ? `回复 @${r.author?.name ?? ""}` : `回复 @${props.comment.author?.name ?? ""}`;
});

// 打开编辑器（reply=null → 回复楼主；否则 → 回复该条楼中楼）。交给父组件设置单例 activeEditor，
// 设置的同时其它楼层已打开的回复框会自动失活（同一时刻全局只有一个）。
const openEditor = (reply = null) => {
  emit("open-editor", { commentId: props.comment.id, replyId: reply?.id ?? null });
};

const onEditorSend = (content) => {
  const rid = editorReplyId.value;
  let replyTo = null;
  if (rid != null) {
    const r = (props.comment.replies ?? []).find((x) => x.id === rid);
    if (r) replyTo = { id: r.author?.id, name: r.author?.name };
  }
  emit("reply", {
    commentId: props.comment.id,
    content,
    replyTo,
    // 被回复的回复 id：null = 回复楼主（插到 replies 楼顶），否则 = 回复楼中楼（插到该条下方）
    replyToId: rid,
  });
  // 发送后展开回复列表：确保按位置插入的新回复立即可见（避免折叠在预览条数之外）
  replyListRef.value?.expand?.();
  emit("close-editor");
};

const onEditorCancel = () => {
  emit("close-editor");
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
        <span v-if="showFloor && hasFloor(comment)" class="bili-comment-item__floor">
          {{ floorLabel(comment.floor) }}
        </span>
      </div>

      <p class="bili-comment-item__content">{{ comment.content }}</p>

      <div class="bili-comment-item__actions">
        <span class="bili-comment-item__time">{{ formatRelativeTime(comment.createTime) }}</span>
        <div class="bili-comment-item__buttons">
          <!-- 点赞 / 回复 / 删除：纯文本按钮（EP 默认风格），点赞与回复展示计数 -->
          <el-button
            text
            size="small"
            class="bili-comment-item__action bili-comment-item__like"
            :type="comment.liked ? 'primary' : ''"
            :disabled="pending"
            @click="onLike"
          >
            点赞({{ formatCount(comment.likeCount) }})
          </el-button>
          <el-button
            text
            size="small"
            class="bili-comment-item__action"
            @click="openEditor()"
          >
            回复({{ formatCount(replyCount) }})
          </el-button>
          <el-button
            v-if="canDelete"
            text
            size="small"
            class="bili-comment-item__action bili-comment-item__delete"
            :disabled="pending"
            @click="onDelete"
          >
            删除
          </el-button>
        </div>
      </div>

      <!-- 楼中楼灰卡：有回复或回复框展开时渲染；bare=无回复时不显示灰底 -->
      <ReplyList
        v-if="hasReplies || replying"
        ref="replyListRef"
        :replies="comment.replies ?? []"
        :current-user="currentUser"
        :preview-count="previewReplies"
        :bare="!hasReplies"
        :replying="replying"
        :editor-reply-id="editorReplyId"
        @like="onReplyLike"
        @reply="openEditor"
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

  // 点赞 / 回复 / 删除：纯文本按钮（紧凑布局，颜色用 EP 默认主题）
  &__action {
    padding: 0;
    height: auto;
    min-height: 0;
    font-size: 12px;
  }
}
</style>
