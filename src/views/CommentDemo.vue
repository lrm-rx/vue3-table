<script setup>
/**
 * 评论区演示页：通过 MockJS（vite-plugin-mock → /mock-api/comment/*）
 * 批量生成评论数据，实测 CommentSection 的虚拟滚动与楼中楼交互。
 * 支持两种数据模式：
 *  - 全量模式：一次拉取 N 条（/comment/list），客户端切片/虚拟滚动承载
 *  - 远程模式：分页拉取（/comment/page），触底自动加载下一页，到底提示「没有更多评论了」
 * 页面层负责取数与状态，CommentSection 只接收 props / 抛出事件。
 */
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import CommentSection from "@/components/comment/index.vue";
import {
  getCommentListApi,
  getCommentPageApi,
  sendCommentApi,
  replyCommentApi,
  likeCommentApi,
  deleteCommentApi,
} from "@/api/comment";

// 演示当前用户（id=me 的评论展示删除入口，与 mock 数据作者对齐）
const currentUser = { id: "me", name: "我", avatar: "", role: "admin" };

// 组件实例：写操作失败时调用 rollback(opId) 还原乐观态
const commentRef = ref(null);
// 写接口模拟失败开关：开启后所有写操作返回业务错误，用于验证回滚
const simulateFail = ref(false);

// —— 演示控制项 ——
const countOptions = [50, 200, 500, 1000, 5000];
const count = ref(500);
const seed = ref(0);
const loading = ref(false);
const virtualScroll = ref(true);
const listHeight = ref(600);
// 非虚拟模式触底自动加载（本地模式开启后滚近底部自动扩容，隐藏「点击加载更多」按钮）
const autoLoadMore = ref(false);
// 数据模式：local 全量拉取 + 本地切片；remote 分页触底加载
const dataMode = ref("local");

// —— 评论数据（v-model:comments 与组件双向同步）——
const comments = ref([]);

// —— 远程模式状态 ——
const remoteHasMore = ref(true);
const pageNum = ref(1);
const remotePageSize = 20;

// —— 组件事件计数（验证交互回调）——
const eventCount = ref({ send: 0, reply: 0, like: 0, delete: 0 });
const bump = (key) => {
  eventCount.value[key] += 1;
};

// 全量模式：一次性拉取
const loadData = async () => {
  loading.value = true;
  try {
    const data = await getCommentListApi({
      count: count.value,
      seed: seed.value,
    });
    comments.value = data.list;
  } catch (err) {
    ElMessage.error(`评论数据加载失败：${err?.message || err}`);
  } finally {
    loading.value = false;
  }
};

// 远程模式：拉取首页
const loadFirstPage = async () => {
  loading.value = true;
  remoteHasMore.value = true;
  pageNum.value = 1;
  try {
    const data = await getCommentPageApi({
      pageSize: remotePageSize,
      pageNum: 1,
      seed: seed.value,
    });
    comments.value = data.list;
    remoteHasMore.value = data.hasMore;
  } catch (err) {
    ElMessage.error(`评论数据加载失败：${err?.message || err}`);
  } finally {
    loading.value = false;
  }
};

// 远程模式：触底加载下一页
const loadNextPage = async () => {
  if (loading.value || !remoteHasMore.value) return;
  loading.value = true;
  try {
    const next = pageNum.value + 1;
    const data = await getCommentPageApi({
      pageSize: remotePageSize,
      pageNum: next,
      seed: seed.value,
    });
    comments.value = [...comments.value, ...data.list];
    pageNum.value = next;
    remoteHasMore.value = data.hasMore;
  } catch (err) {
    ElMessage.error(`加载更多失败：${err?.message || err}`);
  } finally {
    loading.value = false;
  }
};

// 更换 seed → mock 侧击穿缓存，重新生成一批全新数据
const regenerate = () => {
  seed.value += 1;
  if (dataMode.value === "remote") {
    loadFirstPage();
  } else {
    loadData();
  }
};

// 切换数据模式
const onModeChange = () => {
  if (dataMode.value === "remote") {
    loadFirstPage();
  } else {
    loadData();
  }
};

// —— 写操作事件：组件已乐观更新，请求成功 settle、失败 rollback ——
const onSend = async ({ content, opId }) => {
  bump("send");
  try {
    await sendCommentApi({ content, simulateFail: simulateFail.value });
    commentRef.value?.settle(opId);
  } catch {
    commentRef.value?.rollback(opId);
    ElMessage.info("发布失败，已还原本地内容");
  }
};

const onReply = async ({ commentId, content, replyTo, opId }) => {
  bump("reply");
  try {
    await replyCommentApi({
      commentId,
      content,
      replyTo,
      simulateFail: simulateFail.value,
    });
    commentRef.value?.settle(opId);
  } catch {
    commentRef.value?.rollback(opId);
    ElMessage.info("回复失败，已还原本地内容");
  }
};

const onLike = async ({ comment, reply, liked, opId }) => {
  bump("like");
  try {
    await likeCommentApi({
      targetId: (reply || comment).id,
      liked,
      simulateFail: simulateFail.value,
    });
    commentRef.value?.settle(opId);
  } catch {
    commentRef.value?.rollback(opId);
    ElMessage.info("点赞失败，已还原点赞状态");
  }
};

const onDelete = async ({ comment, reply, opId }) => {
  bump("delete");
  try {
    await deleteCommentApi({
      targetId: (reply || comment).id,
      isReply: !!reply,
      simulateFail: simulateFail.value,
    });
    commentRef.value?.settle(opId);
  } catch {
    commentRef.value?.rollback(opId);
    ElMessage.info("删除失败，已还原被删内容");
  }
};

const onLoadMore = () => {
  if (dataMode.value === "remote") loadNextPage();
};

onMounted(loadData);
</script>

<template>
  <div class="comment-demo">
    <el-card shadow="never" class="comment-demo__panel">
      <template #header>
        <div class="comment-demo__toolbar">
          <span class="comment-demo__label">数据模式</span>
          <el-radio-group v-model="dataMode" size="small" @change="onModeChange">
            <el-radio-button value="local">全量</el-radio-button>
            <el-radio-button value="remote">远程分页</el-radio-button>
          </el-radio-group>

          <template v-if="dataMode === 'local'">
            <span class="comment-demo__label">MockJS 数据量</span>
            <el-select
              v-model="count"
              size="small"
              style="width: 120px"
              @change="loadData"
            >
              <el-option
                v-for="n in countOptions"
                :key="n"
                :label="`${n} 条评论`"
                :value="n"
              />
            </el-select>
          </template>

          <el-button size="small" @click="regenerate">重新生成一批</el-button>

          <el-divider direction="vertical" />

          <span class="comment-demo__label">虚拟滚动</span>
          <el-switch v-model="virtualScroll" />
          <template v-if="!virtualScroll">
            <span class="comment-demo__label">触底自动加载</span>
            <el-switch v-model="autoLoadMore" />
          </template>
          <span class="comment-demo__label">视口高度</span>
          <el-select v-model="listHeight" size="small" style="width: 100px">
            <el-option :value="400" label="400px" />
            <el-option :value="600" label="600px" />
            <el-option :value="800" label="800px" />
          </el-select>

          <el-divider direction="vertical" />

          <span class="comment-demo__label">写接口模拟失败</span>
          <el-switch v-model="simulateFail" />
          <span class="comment-demo__tip">
            （开启后发布/回复/点赞/删除均返回错误，验证乐观更新回滚）
          </span>
        </div>
      </template>

      <div class="comment-demo__events">
        事件计数：发布
        <b>{{ eventCount.send }}</b> · 回复 <b>{{ eventCount.reply }}</b> ·
        点赞 <b>{{ eventCount.like }}</b> · 删除
        <b>{{ eventCount.delete }}</b>
        <span v-if="dataMode === 'remote'" class="comment-demo__tip">
          （远程分页：已加载 {{ comments.length }} 条 · 第 {{ pageNum }} 页）
        </span>
        <span v-else class="comment-demo__tip">
          （楼层为按发帖时间固定的编号，显示在每条评论昵称行右端，切换最热/最新排序后保持原始楼层）
        </span>
      </div>

      <CommentSection
        ref="commentRef"
        v-model:comments="comments"
        :current-user="currentUser"
        :loading="loading"
        :virtual-scroll="virtualScroll"
        :auto-load-more="autoLoadMore"
        :list-height="listHeight"
        :remote="dataMode === 'remote'"
        :remote-has-more="remoteHasMore"
        @send="onSend"
        @reply="onReply"
        @like="onLike"
        @delete="onDelete"
        @load-more="onLoadMore"
      />
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.comment-demo {
  display: flex;
  justify-content: center;

  // el-card 自带 overflow:hidden、el-card__body 自带 overflow:auto，
  // 两者会在「吸顶头部 → App 根滚动容器」之间形成新的滚动容器，吞掉 position:sticky；
  // 页面级滚动由 App 根容器（height:100vh; overflow:auto）承担，此处放开保证吸顶生效
  :deep(.el-card),
  :deep(.el-card__body) {
    overflow: visible;
  }

  &__panel {
    width: 100%;
    max-width: 760px;
    border-radius: 8px;
    // 吸顶条横向铺满卡片体：外扩量取 el-card__body 的左右 padding（CSS 变量继承进组件）
    --bili-sticky-gutter: var(--el-card-padding);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__label {
    font-size: 13px;
    color: #61666d;
  }

  &__events {
    margin-bottom: 12px;
    font-size: 13px;
    color: #61666d;

    b {
      color: #fb7299;
    }
  }

  &__tip {
    margin-left: 8px;
    color: #9499a0;
    font-size: 12px;
  }
}
</style>
