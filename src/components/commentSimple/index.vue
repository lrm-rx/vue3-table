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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
  // 触底提前量（px）：距底部该距离时即触发 load-more，
  // 用于覆盖请求在途期间用户滚动的距离，避免看到内容断层
  bottomDistance: { type: Number, default: 400 },
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

// —— 触底加载检测（scroll 事件 + 几何判断）——
// 不使用 IntersectionObserver：root 为多层嵌套滚动容器时存在交集不回调的边界情况。
// 改为监听滚动容器的 scroll 事件，直接比较
// scrollTop + clientHeight + bottomDistance >= scrollHeight 判断是否触底，朴素可靠。
const rootRef = ref(null);
let scrollContainer = null;
// 最近一次加载结束的时间戳：用于区分「发起本次加载的旧手势」与「加载结束后的新手势」
let lastLoadEndTime = 0;
// 触底锁：发起一次 load-more 后立即解除武装，
// 只有滚动位置先离开底部阈值区（中途出现非触底状态）才重新武装。
// 用于阻断 Chromium 滚动锚定 / 程序化钉底产生的自发 scroll 事件导致的级联加载；
// 用户真实快速滚动会经过中间位置，武装会自然恢复，不影响连续滚动体验。
let bottomArmed = true;

// 从组件根元素向上找最近的可滚动容器；找不到则回退到 window（页面级滚动）
const resolveScrollContainer = () => {
  let el = rootRef.value?.parentElement;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return window;
};

const checkReachBottom = () => {
  // 加载中 / 无更多数据时直接短路
  if (props.loading || !props.remoteHasMore) return;
  // 容器被重建时重新解析
  if (
    scrollContainer &&
    scrollContainer !== window &&
    !scrollContainer.isConnected
  ) {
    scrollContainer = resolveScrollContainer();
  }
  const metrics =
    scrollContainer === window
      ? {
          scrollTop: window.scrollY || document.documentElement.scrollTop,
          clientHeight: window.innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
        }
      : {
          scrollTop: scrollContainer.scrollTop,
          clientHeight: scrollContainer.clientHeight,
          scrollHeight: scrollContainer.scrollHeight,
        };
  const atBottom =
    metrics.scrollTop + metrics.clientHeight + props.bottomDistance >=
    metrics.scrollHeight;

  // 只要离开底部区域就重新武装（用户真实滚动的必经路径）
  if (!atBottom) {
    bottomArmed = true;
    return;
  }
  // 已触底但锁未解除（加载后被滚动锚定/钉底产生的自发事件）：忽略
  if (!bottomArmed) return;
  bottomArmed = false;
  emit("load-more");
};

// —— 用户主动意图武装 ——
// 解除武装期间发生在「本次加载结束之后」的新交互手势重新武装：
//  wheel(向下滚动) / 键盘下翻 / 触摸滑动。
// 滚动锚定只产生 scroll 事件，不产生这些输入事件，因此级联依旧被阻断；
// 而当浏览器把位置钉在新底部时，真实用户也不会被卡住。
const armByIntent = () => {
  if (bottomArmed) return;
  // 加载中不武装：排除发起本次加载的旧手势残留，且此时本就不该翻页
  if (props.loading) return;
  // 必须是加载结束后发生的新手势
  if (Date.now() < lastLoadEndTime + 50) return;
  bottomArmed = true;
  requestAnimationFrame(checkReachBottom);
};

const onWheelIntent = (e) => {
  if (e.deltaY > 0) armByIntent();
};

const onKeyIntent = (e) => {
  if (["ArrowDown", "PageDown", " "].includes(e.key)) armByIntent();
};

const onTouchIntent = () => armByIntent();

// 判断列表内容是否撑不满容器（没有可滚动的溢出）
const isContentShorterThanViewport = () => {
  if (scrollContainer === window) {
    return document.documentElement.scrollHeight <= window.innerHeight + 1;
  }
  return scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1;
};

// loading 结束后连续加载的唯一合法场景：
// 新增内容仍撑不满一屏（用户无法通过滚动再次触发），自动补加载直到出现滚动条。
// 若列表可滚动而用户停在底部，绝不自动翻页——必须由用户再次滚动触发，
// 否则会形成「加载完仍触底 → 再加载」的级联请求（一路打到最后一页）。
watch(
  () => props.loading,
  (isLoading) => {
    if (isLoading) return;
    lastLoadEndTime = Date.now();
    nextTick(() => {
      // 内容仍撑不满一屏：用户无法通过滚动离开底部区来重新武装，
      // 此处显式武装后复检，连续补加载直到出现滚动条
      if (isContentShorterThanViewport()) {
        bottomArmed = true;
        checkReachBottom();
      }
    });
  },
);

// remoteHasMore 从 false 变回 true（如重新生成一批数据）后，重置武装并复检
watch(
  () => props.remoteHasMore,
  (val) => {
    if (val) {
      bottomArmed = true;
      nextTick(checkReachBottom);
    }
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

// —— 生命周期：绑定滚动/意图监听与清理 ——
onMounted(() => {
  scrollContainer = resolveScrollContainer();
  scrollContainer.addEventListener("scroll", checkReachBottom, {
    passive: true,
  });
  // 用户主动意图武装
  scrollContainer.addEventListener("wheel", onWheelIntent, { passive: true });
  scrollContainer.addEventListener("touchmove", onTouchIntent, {
    passive: true,
  });
  // 键盘事件挂 window（容器未必持有焦点）
  window.addEventListener("keydown", onKeyIntent);
  // 首屏内容不足一屏时自动补加载
  nextTick(checkReachBottom);
});

onBeforeUnmount(() => {
  if (scrollContainer) {
    scrollContainer.removeEventListener("scroll", checkReachBottom);
    scrollContainer.removeEventListener("wheel", onWheelIntent);
    scrollContainer.removeEventListener("touchmove", onTouchIntent);
    scrollContainer = null;
  }
  window.removeEventListener("keydown", onKeyIntent);
});
</script>

<template>
  <div ref="rootRef" class="bili-comment">
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

  // 底部状态文本（加载中 / 没有更多）：居中、灰色小字
  &__status {
    text-align: center;
    padding: 12px 0 4px;
    color: #9499a0;
    font-size: 13px;
  }
}
</style>
