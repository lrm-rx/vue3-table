<script setup>
/**
 * CommentSection 评论区主容器（仿 bilibili）
 * 唯一持有评论列表的组件，负责：
 *  - 评论/回复的发送（楼层取号）、点赞乐观翻转、删除
 *  - 最热 / 最新排序、首屏条数 + 「点击加载更多评论」
 *  - 与父组件同步：v-model:comments / v-model:sort + send/reply/like/delete 事件
 * 不传 comments 时使用内置 mock 数据，开箱即用。
 */
import { computed, ref, watch } from "vue";
import CommentEditor from "./components/CommentEditor.vue";
import CommentHeader from "./components/CommentHeader.vue";
import CommentItem from "./components/CommentItem.vue";
import VirtualList from "./components/VirtualList.vue";
import buildMockComments, { mockCurrentUser } from "./mock.js";
import {
  assignFloors,
  createId,
  getNextFloor,
  sortRootComments,
} from "./utils/format.js";

const props = defineProps({
  // 评论列表；null 时使用内置 mock 数据（v-model:comments）
  comments: { type: Array, default: null },
  // 当前登录用户
  currentUser: { type: Object, default: () => ({ ...mockCurrentUser }) },
  // 排序：hot 最热 / latest 最新（楼层倒序）/ floor 楼层升序（v-model:sort）
  sort: { type: String, default: "hot" },
  // 首屏渲染条数
  pageSize: { type: Number, default: 20 },
  // 楼中楼预览条数
  previewReplies: { type: Number, default: 2 },
  // 评论最大字数
  maxlength: { type: Number, default: 1000 },
  // 列表加载态（预留远程加载）
  loading: { type: Boolean, default: false },
  // 是否开启评论列表虚拟滚动（显式开启，默认关闭；开启后需提供确定的列表高度）
  virtualScroll: { type: Boolean, default: false },
  // 虚拟滚动视口高度（number=px 或 CSS 字符串）
  listHeight: { type: [Number, String], default: 600 },
});

const emit = defineEmits([
  "update:comments",
  "update:sort",
  "send",
  "reply",
  "like",
  "delete",
]);

// —— 虚拟列表实例（virtualScroll=true 时使用）——
const virtualListRef = ref(null);

// —— 列表数据：受控优先，否则使用内置 mock ——
const innerComments = ref([]);
watch(
  () => props.comments,
  (val) => {
    const source = val == null ? buildMockComments() : val;
    innerComments.value = assignFloors(source);
  },
  { immediate: true },
);

// —— 排序：受控优先 ——
const innerSort = ref("hot");
watch(
  () => props.sort,
  (val) => {
    if (val === "hot" || val === "latest" || val === "floor") innerSort.value = val;
  },
  { immediate: true },
);

const changeSort = (value) => {
  if (value === innerSort.value) return;
  innerSort.value = value;
  displayCount.value = props.pageSize;
  // 排序变化后虚拟列表回到顶部（非虚拟模式由切片重置，天然回顶）
  virtualListRef.value?.scrollToTop();
  emit("update:sort", value);
};

// —— 展示条数（加载更多，仅非虚拟模式）——
const displayCount = ref(props.pageSize);
watch(
  () => props.pageSize,
  (val) => {
    displayCount.value = val;
  },
);

const sortedComments = computed(() =>
  sortRootComments(innerComments.value, innerSort.value),
);

const visibleComments = computed(() =>
  sortedComments.value.slice(0, displayCount.value),
);

const hasMore = computed(() => innerComments.value.length > displayCount.value);

const loadMore = () => {
  displayCount.value += props.pageSize;
};

// 任意变更后向父组件同步列表
const syncComments = () => {
  emit("update:comments", innerComments.value);
};

// —— 发表一级评论 ——
const sendComment = (content) => {
  const newComment = {
    id: createId("root"),
    author: {
      id: props.currentUser.id,
      name: props.currentUser.name,
      avatar: props.currentUser.avatar,
    },
    content,
    createTime: Date.now(),
    likeCount: 0,
    liked: false,
    floor: getNextFloor(innerComments.value),
    replies: [],
  };
  innerComments.value = [...innerComments.value, newComment];
  syncComments();
  emit("send", content);
  // 发布后切到「最新」，保证立刻看到自己的评论
  if (innerSort.value !== "latest") {
    changeSort("latest");
  } else {
    // 已处于最新排序：数组更新后虚拟列表手动回顶
    virtualListRef.value?.scrollToTop();
  }
};

// —— 发表回复（扁平挂在一级评论的 replies 中）——
const handleReply = ({ commentId, content, replyTo }) => {
  const target = innerComments.value.find((c) => c.id === commentId);
  if (!target) return;
  if (!Array.isArray(target.replies)) target.replies = [];
  target.replies.push({
    id: createId("reply"),
    author: {
      id: props.currentUser.id,
      name: props.currentUser.name,
      avatar: props.currentUser.avatar,
    },
    content,
    createTime: Date.now(),
    likeCount: 0,
    liked: false,
    replyTo: replyTo ? { ...replyTo } : null,
  });
  innerComments.value = [...innerComments.value];
  syncComments();
  emit("reply", { commentId, content, replyTo });
};

// —— 点赞 / 取消（乐观翻转）——
const handleLike = ({ comment, reply }) => {
  const target = reply || comment;
  target.liked = !target.liked;
  target.likeCount += target.liked ? 1 : -1;
  syncComments();
  emit("like", { comment, reply, liked: target.liked });
};

// —— 删除评论 / 回复（确认弹窗在 CommentItem 内；reply 为 null 表示删一级评论）——
const handleDelete = ({ comment, reply }) => {
  if (reply) {
    // 删除楼中楼回复：从所属一级评论的 replies 中移除
    const target = innerComments.value.find((c) => c.id === comment.id);
    if (!target) return;
    target.replies = (target.replies ?? []).filter((r) => r.id !== reply.id);
    innerComments.value = [...innerComments.value];
  } else {
    // 删除一级评论：整条移除（楼层号不重新编号）
    innerComments.value = innerComments.value.filter((c) => c.id !== comment.id);
  }
  syncComments();
  emit("delete", { comment, reply });
};
</script>

<template>
  <div class="bili-comment">
    <CommentHeader
      :total="innerComments.length"
      :model-value="innerSort"
      @update:model-value="changeSort"
    />

    <div class="bili-comment__editor">
      <CommentEditor
        collapsible
        :avatar="currentUser.avatar"
        :name="currentUser.name"
        submit-text="发布"
        :maxlength="maxlength"
        @send="sendComment"
      />
    </div>

    <!-- 空列表（两种模式共用） -->
    <el-empty
      v-if="!sortedComments.length"
      description="还没有评论，快来抢沙发吧"
      :image-size="80"
    />

    <!-- 虚拟滚动模式：全量数据交给 VirtualList，只挂载窗口内 DOM -->
    <VirtualList
      v-else-if="virtualScroll"
      ref="virtualListRef"
      v-loading="loading"
      class="bili-comment__virtual"
      :items="sortedComments"
      :height="listHeight"
      item-key="id"
    >
      <template #default="{ item }">
        <CommentItem
          :comment="item"
          :current-user="currentUser"
          :preview-replies="previewReplies"
          :maxlength="maxlength"
          @like="handleLike"
          @reply="handleReply"
          @delete="handleDelete"
        />
      </template>
    </VirtualList>

    <!-- 默认模式：首屏切片 + 点击加载更多 -->
    <div v-else v-loading="loading" class="bili-comment__list">
      <CommentItem
        v-for="comment in visibleComments"
        :key="comment.id"
        :comment="comment"
        :current-user="currentUser"
        :preview-replies="previewReplies"
        :maxlength="maxlength"
        @like="handleLike"
        @reply="handleReply"
        @delete="handleDelete"
      />

      <div v-if="hasMore" class="bili-comment__more">
        <el-button size="small" @click="loadMore">点击加载更多评论</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-comment {
  width: 100%;
  color: #18191c;

  &__editor {
    padding-bottom: 16px;
    border-bottom: 1px solid #f1f2f3;
  }

  &__list {
    min-height: 80px;

    // 相邻评论之间的分隔线
    :deep(.bili-comment-item + .bili-comment-item) {
      border-top: 1px solid #f1f2f3;
    }
  }

  &__more {
    display: flex;
    justify-content: center;
    padding: 8px 0 4px;
  }
}
</style>
