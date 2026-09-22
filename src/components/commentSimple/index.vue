<script setup>
/**
 * CommentSection 评论区主容器（简化版 · 仅远程模式）
 * 相对完整版的简化：
 *  1. 仅支持远程模式：评论列表由业务侧传入，触底 emit load-more 由父组件分页取数 append；
 *     移除虚拟滚动、本地切片、autoLoadMore、pageSize 等本地模式逻辑。
 *  2. loading 不使用 v-loading 全屏遮罩，仅在列表底部展示「加载中...」/「没有更多评论了」状态文本。
 *  3. 楼中楼展开态提升到本组件按 comment.id 持久化（expandedIds）：
 *     父组件增删改后刷新 comments 数据（整体替换）时，已展开的回复列表不会被折叠。
 *
 * 组件为纯受控数据组件，内部不内置任何 mock 数据，评论列表由业务侧传入。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import CommentEditor from "./components/CommentEditor.vue";
import CommentHeader from "./components/CommentHeader.vue";
import CommentItem from "./components/CommentItem.vue";
import {
  assignFloors,
  createId,
  getNextFloor,
  sortRootComments,
} from "./utils/format.js";

const props = defineProps({
  // 评论列表（v-model:comments），由业务侧传入
  comments: { type: Array, default: () => [] },
  // 当前登录用户（头像/昵称展示、发布署名、删除权限判断）
  currentUser: { type: Object, default: () => ({ id: "", name: "", avatar: "" }) },
  // 排序：hot 最热 / latest 最新 / floor 楼层升序（v-model:sort）
  sort: { type: String, default: "hot" },
  // 楼中楼预览条数
  previewReplies: { type: Number, default: 2 },
  // 评论最大字数
  maxlength: { type: Number, default: 1000 },
  // 列表加载态：底部展示「加载中...」，并抑制重复 load-more
  loading: { type: Boolean, default: false },
  // 远程模式：是否还有更多数据（父组件根据接口 hasMore 控制）
  remoteHasMore: { type: Boolean, default: true },
  // 触底提前量（px）：哨兵进入视口 rootMargin 时触发 load-more
  bottomDistance: { type: Number, default: 200 },
});

const emit = defineEmits([
  "update:comments",
  "update:sort",
  "send",
  "reply",
  "like",
  "delete",
  "load-more",
]);

// —— 吸顶态检测（isStuck → 吸顶阴影）——
const stickySentinelRef = ref(null);
const isStuck = ref(false);
useIntersectionObserver(
  stickySentinelRef,
  (entries) => {
    const entry = entries[entries.length - 1];
    isStuck.value = !entry.isIntersecting && entry.boundingClientRect.top < 0;
  },
  { threshold: 0 },
);

// —— 列表数据：纯受控，业务侧传入后统一分配楼层 ——
const innerComments = ref([]);

// —— 楼中楼展开态：按 comment.id 持久化持有 ——
// 必须在 comments watcher 之前定义（watcher 有 immediate:true，会在 setup 阶段执行）
// 使用 ref 对象（.value 为响应式普通对象），读写直接走 .value
const expandedMap = ref({});

watch(
  () => props.comments,
  (val) => {
    innerComments.value = assignFloors(val ?? []);
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
  emit("update:sort", value);
};

const sortedComments = computed(() =>
  sortRootComments(innerComments.value, innerSort.value),
);

// 远程模式直接渲染全量已加载数据（父组件负责分页取数 append）
const visibleComments = computed(() => sortedComments.value);

// 是否还有更多：由父组件 remoteHasMore 控制
const hasMore = computed(() => props.remoteHasMore);

// —— 楼中楼展开态辅助函数（expandedMap 已在上方定义）——
const isExpanded = (id) => !!expandedMap.value[id];

const toggleExpand = (id) => {
  if (expandedMap.value[id]) {
    delete expandedMap.value[id];
  } else {
    expandedMap.value[id] = true;
  }
};

// 触底加载：远程模式 emit load-more（父组件取数）
const loadMore = () => {
  if (!props.loading && props.remoteHasMore) emit("load-more");
};

// —— 哨兵触底检测（IntersectionObserver）——
// 远程模式始终启用：哨兵进入视口（含 rootMargin 提前量）即触发 load-more
const sentinelRef = ref(null);
let io = null;
// 记录哨兵当前是否与视口相交：用于 loading 结束后补发 load-more
// （IO 回调仅在交集状态变化时触发；若初始加载期间已相交，加载完成后需手动补触发）
let sentinelIntersecting = false;

const setupSentinel = () => {
  // 哨兵未渲染时不做任何操作（尤其不能断开已有 IO，否则后续滚动不再触发）
  if (!sentinelRef.value) return;
  if (io) io.disconnect();
  // 找到最近的滚动容器作为 IO 的 root（比默认 viewport 更可靠，
  // 避免内容在容器内滚动时 IO 不触发的问题）
  let root = sentinelRef.value.parentElement;
  while (root) {
    const { overflowY } = getComputedStyle(root);
    if (overflowY === "auto" || overflowY === "scroll") break;
    root = root.parentElement;
  }
  io = new IntersectionObserver(
    (entries) => {
      sentinelIntersecting = entries.some((e) => e.isIntersecting);
      if (sentinelIntersecting && hasMore.value) loadMore();
    },
    { root: root || null, rootMargin: `${props.bottomDistance}px 0px` },
  );
  io.observe(sentinelRef.value);
};

// loading 结束时，若哨兵仍在视口内且还有更多数据，补发 load-more
// （解决初始加载期间哨兵已相交但 loadMore 被 loading 拦截、之后不再触发的问题）
// 用 requestAnimationFrame 延迟一帧，让 IntersectionObserver 先更新交集状态
watch(
  () => props.loading,
  (isLoading) => {
    if (isLoading) return;
    requestAnimationFrame(() => {
      if (sentinelIntersecting && hasMore.value) loadMore();
    });
  },
);

// remoteHasMore 变化时重建哨兵：false 时断开观察；
// true 时等待 v-if 渲染哨兵后再 observe（用 requestAnimationFrame 等 DOM 更新）
watch(
  () => props.remoteHasMore,
  (hasMoreVal) => {
    if (!hasMoreVal) {
      if (io) io.disconnect();
      return;
    }
    requestAnimationFrame(setupSentinel);
  },
);

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

// —— 删除评论 / 回复 ——
const handleDelete = ({ comment, reply }) => {
  if (reply) {
    const target = innerComments.value.find((c) => c.id === comment.id);
    if (!target) return;
    target.replies = (target.replies ?? []).filter((r) => r.id !== reply.id);
    innerComments.value = [...innerComments.value];
  } else {
    innerComments.value = innerComments.value.filter((c) => c.id !== comment.id);
  }
  syncComments();
  emit("delete", { comment, reply });
};

// —— 生命周期：哨兵初始化与清理 ——
onMounted(() => {
  requestAnimationFrame(setupSentinel);
});

onBeforeUnmount(() => {
  if (io) {
    io.disconnect();
    io = null;
  }
});
</script>

<template>
  <div class="bili-comment">
    <!-- 吸顶态检测哨兵 -->
    <div
      ref="stickySentinelRef"
      class="bili-comment__sticky-sentinel"
      aria-hidden="true"
    />

    <!-- 头部 + 输入区包裹层：吸顶 -->
    <div
      class="bili-comment__top bili-comment__top--sticky"
      :class="{ 'is-stuck': isStuck }"
    >
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
    </div>

    <!-- 空列表 -->
    <el-empty
      v-if="!sortedComments.length"
      description="还没有评论，快来抢沙发吧"
      :image-size="80"
    />

    <!-- 远程模式列表：全量渲染已加载数据，触底由哨兵触发 load-more -->
    <div v-else class="bili-comment__list">
      <CommentItem
        v-for="comment in visibleComments"
        :key="comment.id"
        :comment="comment"
        :current-user="currentUser"
        :preview-replies="previewReplies"
        :maxlength="maxlength"
        :expanded="isExpanded(comment.id)"
        @like="handleLike"
        @reply="handleReply"
        @delete="handleDelete"
        @toggle-expand="toggleExpand(comment.id)"
      />

      <!-- 哨兵元素（IntersectionObserver 观察目标，不占可见高度） -->
      <div
        v-if="hasMore"
        ref="sentinelRef"
        class="bili-comment__sentinel"
      />

      <!-- 底部状态文本：加载中 / 没有更多（不使用 v-loading 全屏遮罩） -->
      <div class="bili-comment__status">
        <span v-if="loading">加载中...</span>
        <span v-else-if="!hasMore">没有更多评论了</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-comment {
  width: 100%;
  color: #18191c;

  // 吸顶态检测哨兵：1px 高 + 负 margin 抵消，不占布局但可被 IntersectionObserver 观察
  &__sticky-sentinel {
    height: 1px;
    margin-bottom: -1px;
    pointer-events: none;
  }

  // 头部 + 输入区包裹层：sticky 吸顶
  &__top {
    &--sticky {
      position: sticky;
      top: 0;
      z-index: 10;
      // 吸顶条横向外扩：宿主容器带左右 padding 时铺满容器宽度
      margin-left: calc(-1 * var(--bili-sticky-gutter, 0px));
      margin-right: calc(-1 * var(--bili-sticky-gutter, 0px));
      padding-left: var(--bili-sticky-gutter, 0px);
      padding-right: var(--bili-sticky-gutter, 0px);
      background-color: #fff;
      transition: box-shadow 0.25s ease;

      &.is-stuck {
        box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
      }
    }
  }

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

  // 哨兵元素：不占可见高度，仅作 IntersectionObserver 观察目标
  &__sentinel {
    height: 1px;
    width: 100%;
    pointer-events: none;
  }

  // 底部状态文本（加载中 / 没有更多）：居中、灰色小字
  &__status {
    text-align: center;
    padding: 12px 0 4px;
    color: #9499a0;
    font-size: 13px;
  }
}
</style>
