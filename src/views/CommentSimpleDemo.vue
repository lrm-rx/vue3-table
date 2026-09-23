<script setup>
/**
 * 简化版评论区（commentSimple）演示页
 *
 * 该组件「仅远程模式」，本演示完整覆盖以下测试点：
 *  1. 远程分页：触底 emit load-more，父组件分页取数 append，到底显示「没有更多评论了」
 *  2. loading 状态文本：列表底部展示「加载中...」/「没有更多评论了」（无 v-loading 全屏遮罩）
 *  3. 增删改后局部刷新且不折叠已展开回复（核心特性）：
 *     - 展开某条评论的楼中楼
 *     - 触发任意写操作（发布/回复/删除）或手动「模拟服务端刷新」
 *     - 父组件用全新对象数组覆盖 comments（模拟服务端返回最新数据）
 *     - 已展开的楼中楼保持展开（展开态由 commentSimple 内部按 comment.id 持久化）
 *  4. 排序切换（最热 / 最新）、空列表态、点赞乐观翻转、删除权限
 */
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import CommentSimple from "@/components/commentSimple/index.vue";
import {
  getCommentPageApi,
  sendCommentApi,
  replyCommentApi,
  likeCommentApi,
  deleteCommentApi,
} from "@/api/comment";

// —— 当前用户（id=me 的评论可删除；role=admin 可删任意）——
const currentUser = { id: "me", name: "我", avatar: "", role: "admin" };

// 组件实例：写操作失败时调用 rollback(opId) 还原乐观态
const commentRef = ref(null);
// 写接口模拟失败开关：开启后所有写操作返回业务错误，用于验证回滚
const simulateFail = ref(false);

// —— 演示控制项 ——
const pageSize = 10; // 每页条数（小一点便于触发多页加载）
const seed = ref(0);
const loading = ref(false);
const remoteHasMore = ref(true);
const pageNum = ref(0);
// 自定义数据总条数：null = 默认 200 条；数字 = 极小数据集（如 3 / 15，测试边界）
const totalOverride = ref(null);
const serverTotal = ref(0);

// —— 评论数据（v-model:comments 双向同步）——
const comments = ref([]);

// —— 操作后是否自动模拟服务端刷新（用全新对象数组覆盖 comments）——
// 开启后：发布/回复/删除 → 组件先乐观更新本地 → 父组件重新拉取覆盖 →
//         已展开的楼中楼应保持展开（验证核心特性）
const autoRefreshAfterAction = ref(true);

// —— 事件计数（验证交互回调）——
const eventCount = ref({ send: 0, reply: 0, like: 0, delete: 0 });
const bump = (key) => {
  eventCount.value[key] += 1;
};

// 构造分页请求参数（totalOverride 存在时带上自定义 total）
const buildParams = (num) => ({
  pageSize,
  pageNum: num,
  seed: seed.value,
  ...(totalOverride.value !== null ? { total: totalOverride.value } : {}),
});

// —— 拉取首页 ——
const loadFirstPage = async () => {
  loading.value = true;
  remoteHasMore.value = true;
  pageNum.value = 1;
  try {
    const data = await getCommentPageApi(buildParams(1));
    // 关键：用全新对象数组覆盖（模拟服务端返回最新数据），
    // 即使 comment.id 相同，对象引用也是新的，用于验证展开态不丢失
    comments.value = data.list.map((c) => ({ ...c }));
    remoteHasMore.value = data.hasMore;
    serverTotal.value = data.total;
  } catch (err) {
    ElMessage.error(`评论数据加载失败：${err?.message || err}`);
  } finally {
    loading.value = false;
  }
};

// —— 触底加载下一页 ——
const loadNextPage = async () => {
  if (loading.value || !remoteHasMore.value) return;
  loading.value = true;
  try {
    const next = pageNum.value + 1;
    const data = await getCommentPageApi(buildParams(next));
    // 追加新页数据（同样用新对象）
    comments.value = [...comments.value, ...data.list.map((c) => ({ ...c }))];
    pageNum.value = next;
    remoteHasMore.value = data.hasMore;
  } catch (err) {
    ElMessage.error(`加载更多失败：${err?.message || err}`);
  } finally {
    loading.value = false;
  }
};

// —— 手动模拟服务端刷新：重新拉取已加载的所有页（覆盖 comments）——
// 用于单独验证「展开态不丢失」：展开某楼中楼后点此按钮
const refreshAll = async () => {
  loading.value = true;
  try {
    // 重新拉取前 pageNum 页并合并覆盖
    const allPages = [];
    for (let p = 1; p <= pageNum.value; p++) {
      const data = await getCommentPageApi(buildParams(p));
      allPages.push(...data.list);
    }
    // 用全新对象数组覆盖（即使 id 相同，引用也是新的）
    comments.value = allPages.map((c) => ({ ...c }));
    ElMessage.success("已模拟服务端刷新（comments 数组被全新对象覆盖）");
  } catch (err) {
    ElMessage.error(`刷新失败：${err?.message || err}`);
  } finally {
    loading.value = false;
  }
};

// 更换 seed → 重新生成一批全新数据（恢复默认 200 条）
const regenerate = () => {
  seed.value += 1;
  totalOverride.value = null;
  loadFirstPage();
};

// —— 极小数据集边界测试 ——
// total=3：首屏仅 3 条且服务端无更多数据 → 应直接显示「没有更多评论了」
const loadTinyDataset = () => {
  totalOverride.value = 3;
  loadFirstPage();
};

// total=15：首页 10 条(hasMore=true)，触底加载末页 5 条后显示「没有更多评论了」
const loadTwoPageDataset = () => {
  totalOverride.value = 15;
  loadFirstPage();
};

// —— 组件事件回调：组件已乐观更新，请求成功 settle（回填服务端真实 id/floor）、失败 rollback ——
const onSend = async ({ content, opId }) => {
  bump("send");
  try {
    const data = await sendCommentApi({
      content,
      author: currentUser,
      simulateFail: simulateFail.value,
    });
    commentRef.value?.settle(opId, data);
    ElMessage.success(`已发布评论：${content.slice(0, 20)}`);
    if (autoRefreshAfterAction.value) refreshAll();
  } catch {
    commentRef.value?.rollback(opId);
    ElMessage.info("发布失败，已还原本地内容");
  }
};

const onReply = async ({ commentId, content, replyTo, opId }) => {
  bump("reply");
  try {
    const data = await replyCommentApi({
      commentId,
      content,
      replyTo,
      author: currentUser,
      simulateFail: simulateFail.value,
    });
    commentRef.value?.settle(opId, data);
    const target = replyTo?.name ? `@${replyTo.name}` : "楼主";
    ElMessage.success(`已回复${target}：${content.slice(0, 20)}`);
    if (autoRefreshAfterAction.value) refreshAll();
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
    const target = reply
      ? `回复「${reply.content.slice(0, 10)}」`
      : `评论「${comment.content.slice(0, 10)}」`;
    ElMessage.info(`${liked ? "点赞" : "取消点赞"}：${target}`);
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
    ElMessage.warning(reply ? "已删除回复" : "已删除评论");
    // 删除后不刷新：mock 数据是静态的，刷新会把已删除的评论带回来。
    // 真实场景中服务端删除后刷新，评论自然消失；此处保留组件的乐观删除效果。
  } catch {
    commentRef.value?.rollback(opId);
    ElMessage.info("删除失败，已还原被删内容");
  }
};

const onLoadMore = () => {
  loadNextPage();
};

onMounted(loadFirstPage);
</script>

<template>
  <div class="comment-simple-demo">
    <el-card shadow="never" class="comment-simple-demo__panel">
      <template #header>
        <div class="comment-simple-demo__toolbar">
          <span class="comment-simple-demo__label">数据批次</span>
          <el-button size="small" @click="regenerate">重新生成一批</el-button>

          <el-divider direction="vertical" />

          <span class="comment-simple-demo__label">边界测试</span>
          <el-button size="small" type="info" @click="loadTinyDataset">
            仅 3 条（不足一屏）
          </el-button>
          <el-button size="small" type="info" @click="loadTwoPageDataset">
            共 15 条（末页不满）
          </el-button>

          <el-divider direction="vertical" />

          <span class="comment-simple-demo__label">操作后自动服务端刷新</span>
          <el-switch v-model="autoRefreshAfterAction" />
          <span class="comment-simple-demo__tip">
            （开启后发布/回复/删除会用全新对象数组覆盖 comments，验证已展开回复不折叠）
          </span>

          <el-button size="small" type="warning" @click="refreshAll">
            手动模拟服务端刷新
          </el-button>

          <el-divider direction="vertical" />

          <span class="comment-simple-demo__label">写接口模拟失败</span>
          <el-switch v-model="simulateFail" />
          <span class="comment-simple-demo__tip">
            （开启后发布/回复/点赞/删除均返回错误，验证乐观更新回滚）
          </span>
        </div>
      </template>

      <div class="comment-simple-demo__events">
        事件计数：发布 <b>{{ eventCount.send }}</b> · 回复
        <b>{{ eventCount.reply }}</b> · 点赞 <b>{{ eventCount.like }}</b> · 删除
        <b>{{ eventCount.delete }}</b>
        <span class="comment-simple-demo__tip">
          （远程分页：已加载 {{ comments.length }} / 服务端共 {{ serverTotal }} 条 ·
          第 {{ pageNum }} 页 · hasMore = {{ remoteHasMore }}）
        </span>
      </div>

      <div class="comment-simple-demo__guide">
        <b>测试要点：</b>
        <ol>
          <li>滚动列表到底部，观察底部「加载中...」→ 自动加载下一页 → 到底显示「没有更多评论了」</li>
          <li>
            <b>核心特性验证</b>：展开某条评论的「查看全部 n 条回复」→ 点击「手动模拟服务端刷新」
            （或开启「操作后自动服务端刷新」后做发布/回复/删除）→ 观察该楼中楼仍保持展开，未被折叠
          </li>
          <li>点赞为乐观翻转（计数 +1/-1，点赞按钮高亮），删除需确认（本人/管理员可删）</li>
          <li>切换「最热/最新」排序，楼层号保持固定</li>
          <li>loading 仅底部状态文本，无全屏遮罩</li>
          <li>
            <b>数据量边界</b>：点「仅 3 条」→ 3 条数据且无更多时直接显示「没有更多评论了」，
            不卡在「加载中」；点「共 15 条」→ 触底加载末页 5 条后正常结束
          </li>
          <li>
            <b>乐观更新回滚</b>：开启「写接口模拟失败」→ 做点赞/发布/回复/删除
            → 界面先出现乐观变化，约 600ms 后自动还原（组件按操作前快照精确回滚）；
            关闭该开关后操作正常生效
          </li>
        </ol>
      </div>

      <CommentSimple
        ref="commentRef"
        v-model:comments="comments"
        :current-user="currentUser"
        :loading="loading"
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
.comment-simple-demo {
  display: flex;
  justify-content: center;

  // el-card 自带 overflow:hidden、el-card__body 自带 overflow:auto，
  // 放开保证 sticky 吸顶生效（页面级滚动由 App 根容器承担）
  :deep(.el-card),
  :deep(.el-card__body) {
    overflow: visible;
  }

  &__panel {
    width: 100%;
    max-width: 760px;
    border-radius: 8px;
    // 吸顶条横向铺满卡片体
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

  &__tip {
    margin-left: 4px;
    color: #9499a0;
    font-size: 12px;
  }

  &__events {
    margin-bottom: 12px;
    font-size: 13px;
    color: #61666d;

    b {
      color: #fb7299;
    }
  }

  &__guide {
    margin-bottom: 16px;
    padding: 10px 14px;
    border-radius: 6px;
    background-color: #f6f7f8;
    font-size: 13px;
    color: #61666d;
    line-height: 1.9;

    ol {
      margin: 6px 0 0;
      padding-left: 20px;
    }

    b {
      color: #fb7299;
    }
  }
}
</style>
