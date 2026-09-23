<script setup>
/**
 * CommentSection 评论区主容器（仿 bilibili）
 * 唯一持有评论列表的组件，负责：
 *  - 评论/回复的发送（楼层取号）、点赞乐观翻转、删除
 *  - 最热 / 最新排序、首屏条数 + 「点击加载更多评论」
 *  - 与父组件同步：v-model:comments / v-model:sort + send/reply/like/delete 事件
 * 组件为纯受控数据组件，内部不内置任何 mock 数据，评论列表由业务侧传入。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import CommentEditor from "./components/CommentEditor.vue";
import CommentHeader from "./components/CommentHeader.vue";
import CommentItem from "./components/CommentItem.vue";
import VirtualList from "./components/VirtualList.vue";
import { createId, sortRootComments } from "./utils/format.js";

const props = defineProps({
  // 评论列表（v-model:comments），由业务侧传入
  comments: { type: Array, default: () => [] },
  // 当前登录用户（头像/昵称展示、发布署名、删除权限判断）
  currentUser: { type: Object, default: () => ({ id: "", name: "", avatar: "" }) },
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
  // 远程加载模式：触底时 emit load-more 由父组件取数并 append（默认关闭，保留本地切片）
  remote: { type: Boolean, default: false },
  // 远程模式：是否还有更多数据（父组件根据接口 hasMore 控制；false 时显示「没有更多评论了」）
  remoteHasMore: { type: Boolean, default: true },
  // 非虚拟模式触底自动加载：开启后本地模式滚近底部自动扩容切片（隐藏「点击加载更多」按钮），
  // 远程模式本就由哨兵触底取数，不受此开关影响
  autoLoadMore: { type: Boolean, default: false },
  // 非虚拟模式触底提前量（px）：哨兵进入视口 rootMargin 时触发 load-more
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

// —— 虚拟列表实例（virtualScroll=true 时使用）——
const virtualListRef = ref(null);

// —— 吸顶态检测（isStuck → 吸顶阴影）——
// 哨兵紧贴吸顶头部上方：越过滚动容器可视顶 = 头部已被 sticky 钉住；
// 位于视口下方（评论区尚未进入屏幕）不算吸顶。
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
// 楼层号由后端生成并随数据返回，组件直接透传，不做补排
watch(
  () => props.comments,
  (val) => {
    innerComments.value = val ?? [];
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

// —— 展示条数（加载更多，仅非虚拟且本地模式使用）——
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

// 远程模式直接渲染全量已加载数据（父组件负责分页取数 append）；
// 本地模式按 displayCount 切片
const visibleComments = computed(() =>
  props.remote
    ? sortedComments.value
    : sortedComments.value.slice(0, displayCount.value),
);

// 是否还有更多：远程模式看 remoteHasMore；本地模式看切片剩余
const hasMore = computed(() =>
  props.remote
    ? props.remoteHasMore
    : innerComments.value.length > displayCount.value,
);

// 触底 / 点击更多：远程模式 emit load-more（父组件取数）；本地模式扩容 displayCount
const loadMore = () => {
  if (props.remote) {
    if (!props.loading && props.remoteHasMore) emit("load-more");
    return;
  }
  displayCount.value += props.pageSize;
};

// —— 非虚拟模式哨兵触底检测（IntersectionObserver + 触底锁/武装状态机）——
// 页面级滚动时哨兵进入视口（含 rootMargin 提前量）即触发 load-more；
// 远程模式始终启用，本地模式仅在 autoLoadMore 开启时启用（否则用「点击加载更多」按钮）
//
// 触底锁：哨兵进入阈值区触发一次后立即解除武装，阻断「内容 append + Chromium
// 滚动锚定」产生的重复相交导致的级联请求。重新武装有两条路径：
//  1. 位置武装：哨兵先离开阈值区（IO 报告不再相交）
//  2. 意图武装：本次加载结束后发生新的 wheel(向下)/键盘下翻/触摸手势
// 滚动锚定只产生 scroll 事件、不产生输入手势，因此级联被阻断，真实持续滚动不受影响。
const sentinelRef = ref(null);
let io = null;
// 触底锁：触发一次 loadMore 后解除，重新武装后才允许下一次
let bottomArmed = true;
// 哨兵当前是否处于阈值区（由 IO 回调维护）
let sentinelIntersecting = false;
// 最近一次加载结束时间戳：区分「发起本次加载的旧手势」与「加载结束后的新手势」
let lastLoadEndTime = 0;

const setupSentinel = () => {
  if (io) io.disconnect();
  // 模式重建后重置武装（新 IO 的初始回调会按哨兵当前位置决定是否触发）
  bottomArmed = true;
  // 虚拟滚动由列表自身检测触底；本地模式未开启自动加载时保留按钮交互
  if (props.virtualScroll) return;
  if (!props.remote && !props.autoLoadMore) return;
  if (!sentinelRef.value) return;
  io = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      sentinelIntersecting = entry.isIntersecting;
      // 路径1（位置武装）：哨兵离开阈值区 → 重新武装
      if (!entry.isIntersecting) {
        bottomArmed = true;
        return;
      }
      // 哨兵在阈值区但锁未解除（append + 滚动锚定的重复相交）：忽略，防级联
      if (!bottomArmed || !hasMore.value) return;
      bottomArmed = false;
      loadMore();
    },
    { rootMargin: `${props.bottomDistance}px 0px` },
  );
  io.observe(sentinelRef.value);
};

watch(
  () => [props.remote, props.virtualScroll, props.autoLoadMore],
  () => {
    // 模式切换后 nextTick 重建哨兵（DOM 可能刚挂载/卸载）
    requestAnimationFrame(setupSentinel);
  },
);

// loading 结束时记录时间戳：意图武装只接受加载结束之后的新手势
watch(
  () => props.loading,
  (isLoading) => {
    if (!isLoading) lastLoadEndTime = Date.now();
  },
);

// remoteHasMore 变 false 时断开观察；重新变回 true 时重置武装并恢复观察
watch(
  () => props.remoteHasMore,
  (hasMoreVal) => {
    if (!io) return;
    if (hasMoreVal && sentinelRef.value) {
      bottomArmed = true;
      io.observe(sentinelRef.value);
    } else if (!hasMoreVal) {
      io.disconnect();
    }
  },
);

// —— 路径2（意图武装）——
// 武装后若哨兵仍在阈值区，立即补触发，避免滚动锚定把位置钉在新底部时用户被卡住
const armByIntent = () => {
  if (bottomArmed) return;
  // 意图武装仅用于远程异步路径：本地自动扩容是同步的，位置武装已足够，
  // 避免持续滚轮/惯性滚动在内容尚未滚过时一次扩容多页
  if (!props.remote) return;
  // 加载中不武装：排除发起本次加载的旧手势残留
  if (props.loading) return;
  if (Date.now() < lastLoadEndTime + 50) return;
  bottomArmed = true;
  requestAnimationFrame(() => {
    if (bottomArmed && sentinelIntersecting && hasMore.value) {
      bottomArmed = false;
      loadMore();
    }
  });
};

const onWheelIntent = (e) => {
  if (e.deltaY > 0) armByIntent();
};

const onKeyIntent = (e) => {
  if (["ArrowDown", "PageDown", " "].includes(e.key)) armByIntent();
};

const onTouchIntent = () => armByIntent();

// 任意变更后向父组件同步列表
const syncComments = () => {
  emit("update:comments", innerComments.value);
};

// —— 乐观更新：快照管理与回滚 ——
// 每个写操作先在 pendingOps 中保存「足以精确还原」的快照，再做本地变更并 emit；
// 事件 payload 携带 opId：业务侧请求成功 → settle(opId) 丢弃快照；
// 失败 → rollback(opId) 按快照精确回滚。快照与服务端刷新互不依赖。
let opSeq = 0;
const pendingOps = new Map();
const nextOpId = () => `op_${++opSeq}`;

const applyRollback = (snap) => {
  switch (snap.type) {
    case "like":
      snap.target.liked = snap.liked;
      snap.target.likeCount = snap.likeCount;
      break;
    case "send":
      innerComments.value = innerComments.value.filter((c) => c.id !== snap.id);
      break;
    case "reply": {
      const target = innerComments.value.find((c) => c.id === snap.commentId);
      if (target) {
        target.replies = (target.replies ?? []).filter((r) => r.id !== snap.id);
      }
      break;
    }
    case "delete": {
      const arr = [...innerComments.value];
      arr.splice(Math.min(snap.index, arr.length), 0, snap.item);
      innerComments.value = arr;
      break;
    }
    case "delete-reply": {
      const target = innerComments.value.find((c) => c.id === snap.commentId);
      if (target) {
        const arr = [...(target.replies ?? [])];
        arr.splice(Math.min(snap.index, arr.length), 0, snap.item);
        target.replies = arr;
      }
      break;
    }
  }
};

// 失败回滚：还原本地数据并同步父组件
const rollback = (opId) => {
  const snap = pendingOps.get(opId);
  if (!snap) return;
  applyRollback(snap);
  pendingOps.delete(opId);
  syncComments();
};

// 成功确认：丢弃快照；若传入 serverItem（创建类操作的服务端返回），
// 用服务端真实数据覆盖本地临时对象——关键是把临时 id / 缺失的 floor 等字段回填为真实值，
// 此后点赞、删除等操作才会命中服务端真实记录。
const settle = (opId, serverItem) => {
  const snap = pendingOps.get(opId);
  if (!snap) return;
  if (serverItem && (snap.type === "send" || snap.type === "reply")) {
    if (snap.type === "send") {
      const local = innerComments.value.find((c) => c.id === snap.id);
      if (local) Object.assign(local, serverItem);
    } else {
      const target = innerComments.value.find((c) => c.id === snap.commentId);
      const local = target?.replies?.find((r) => r.id === snap.id);
      if (local) Object.assign(local, serverItem);
    }
    syncComments();
  }
  pendingOps.delete(opId);
};

defineExpose({ rollback, settle });

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
    // 楼层号由后端生成，落库成功后通过 settle(serverItem) 回填；在此之前不展示「第 n 楼」
    replies: [],
  };
  const opId = nextOpId();
  pendingOps.set(opId, { type: "send", id: newComment.id });
  innerComments.value = [...innerComments.value, newComment];
  syncComments();
  emit("send", { content, opId });
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
  const newReply = {
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
  };
  const opId = nextOpId();
  pendingOps.set(opId, { type: "reply", commentId, id: newReply.id });
  target.replies.push(newReply);
  innerComments.value = [...innerComments.value];
  syncComments();
  emit("reply", { commentId, content, replyTo, opId });
};

// —— 点赞 / 取消（乐观翻转 + 失败可回滚）——
const handleLike = ({ comment, reply }) => {
  const target = reply || comment;
  const opId = nextOpId();
  // 快照：目标旧值（rollback 直接恢复字段）
  pendingOps.set(opId, {
    type: "like",
    target,
    liked: target.liked,
    likeCount: target.likeCount,
  });
  target.liked = !target.liked;
  target.likeCount += target.liked ? 1 : -1;
  syncComments();
  emit("like", { comment, reply, liked: target.liked, opId });
};

// —— 删除评论 / 回复（确认弹窗在 CommentItem 内；reply 为 null 表示删一级评论）——
const handleDelete = ({ comment, reply }) => {
  const opId = nextOpId();
  if (reply) {
    // 删除楼中楼回复：从所属一级评论的 replies 中移除
    const target = innerComments.value.find((c) => c.id === comment.id);
    if (!target) return;
    const replies = target.replies ?? [];
    const index = replies.findIndex((r) => r.id === reply.id);
    pendingOps.set(opId, {
      type: "delete-reply",
      commentId: comment.id,
      index,
      item: reply,
    });
    target.replies = replies.filter((r) => r.id !== reply.id);
    innerComments.value = [...innerComments.value];
  } else {
    // 删除一级评论：整条移除（楼层号不重新编号）
    const index = innerComments.value.findIndex((c) => c.id === comment.id);
    pendingOps.set(opId, { type: "delete", index, item: comment });
    innerComments.value = innerComments.value.filter((c) => c.id !== comment.id);
  }
  syncComments();
  emit("delete", { comment, reply, opId });
};

// —— 生命周期：哨兵初始化与清理 ——
onMounted(() => {
  // 非虚拟 + （远程 或 本地自动加载）：DOM 就绪后建立哨兵观察
  if (!props.virtualScroll && (props.remote || props.autoLoadMore)) {
    requestAnimationFrame(setupSentinel);
  }
  // 意图武装监听（挂 window：手势在评论区任意位置发生即可，键盘事件容器未必持有焦点）
  window.addEventListener("wheel", onWheelIntent, { passive: true });
  window.addEventListener("touchmove", onTouchIntent, { passive: true });
  window.addEventListener("keydown", onKeyIntent);
});

onBeforeUnmount(() => {
  if (io) {
    io.disconnect();
    io = null;
  }
  window.removeEventListener("wheel", onWheelIntent);
  window.removeEventListener("touchmove", onTouchIntent);
  window.removeEventListener("keydown", onKeyIntent);
});
</script>

<template>
  <div class="bili-comment">
    <!-- 吸顶态检测哨兵：越过滚动容器顶 → 头部进入 is-stuck（吸顶阴影） -->
    <div
      ref="stickySentinelRef"
      class="bili-comment__sticky-sentinel"
      aria-hidden="true"
    />

    <!-- 头部 + 输入区包裹层：非虚拟模式下吸顶（列表较长出现滚动条后，滚过头部即固定在滚动容器顶部） -->
    <div
      class="bili-comment__top"
      :class="{
        'bili-comment__top--sticky': !virtualScroll,
        'is-stuck': !virtualScroll && isStuck,
      }"
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
      :loading="loading"
      @load-more="loadMore"
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
      <!-- 虚拟模式底部状态：加载中 / 没有更多 -->
      <template v-if="remote" #footer>
        <div class="bili-comment__status">
          <span v-if="loading">加载中...</span>
          <span v-else-if="!hasMore">没有更多评论了</span>
        </div>
      </template>
    </VirtualList>

    <!-- 默认模式：首屏切片 + 点击加载更多 / 远程触底自动加载 -->
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

      <!-- 哨兵元素（IntersectionObserver 观察目标，不占可见高度）：
           远程模式始终启用；本地模式在 autoLoadMore 开启时启用 -->
      <div
        v-if="(remote || autoLoadMore) && hasMore"
        ref="sentinelRef"
        class="bili-comment__sentinel"
      />

      <!-- 底部状态条 -->
      <div class="bili-comment__more">
        <!-- 加载中（远程模式） -->
        <span v-if="remote && loading" class="bili-comment__status-text">
          加载中...
        </span>
        <!-- 没有更多（远程到底 / 本地自动加载耗尽，给用户明确的终态反馈） -->
        <span
          v-else-if="(remote || autoLoadMore) && !hasMore"
          class="bili-comment__status-text"
        >
          没有更多评论了
        </span>
        <!-- 点击加载更多（仅本地手动模式；autoLoadMore 开启后由哨兵自动加载） -->
        <el-button
          v-else-if="!remote && !autoLoadMore && hasMore"
          size="small"
          @click="loadMore"
        >
          点击加载更多评论
        </el-button>
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

  // 头部 + 输入区包裹层
  &__top {
    // 非虚拟模式吸顶：sticky 相对「最近的可滚动祖先」生效，
    // 要求自身到滚动容器的祖先链上不能出现 overflow: hidden / auto / scroll
    // （如 el-card），否则吸顶被该容器吞掉而不生效。
    // 虚拟滚动模式列表在自身视口内滚动、头部天然常驻，无需吸顶。
    &--sticky {
      position: sticky;
      top: 0;
      z-index: 10;
      // 吸顶条横向外扩：宿主容器（如 el-card__body）带左右 padding 时，
      // 仅内容宽的吸顶条会让列表从两侧 padding 区穿过而「穿帮」。
      // 宿主把 --bili-sticky-gutter 设为该 padding 值（默认 0 不外扩），
      // 这里负 margin 外扩 + 等量 padding 补偿，铺满整个容器宽度且内部布局不变。
      margin-left: calc(-1 * var(--bili-sticky-gutter, 0px));
      margin-right: calc(-1 * var(--bili-sticky-gutter, 0px));
      padding-left: var(--bili-sticky-gutter, 0px);
      padding-right: var(--bili-sticky-gutter, 0px);
      // 吸顶后列表内容会从下方滚过，需要不透明底色遮住
      background-color: #fff;
      // 吸顶阴影出现 / 消失的过渡
      transition: box-shadow 0.25s ease;

      // 吸顶态：与滚过的列表内容拉开层次（is-stuck 由哨兵 IntersectionObserver 驱动）
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

  &__more {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 8px 0 4px;
  }

  // 哨兵元素：不占可见高度，仅作 IntersectionObserver 观察目标
  &__sentinel {
    height: 1px;
    width: 100%;
    pointer-events: none;
  }

  // 底部状态文本（加载中 / 没有更多）
  &__status-text {
    color: #9499a0;
    font-size: 13px;
  }

  &__status {
    text-align: center;
    padding: 4px 0;
    color: #9499a0;
    font-size: 13px;
  }
}
</style>
