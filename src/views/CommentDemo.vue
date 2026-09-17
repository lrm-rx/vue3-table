<script setup>
/**
 * 评论区演示页：通过 MockJS（vite-plugin-mock → /mock-api/comment/list）
 * 批量生成评论数据，实测 CommentSection 的虚拟滚动与楼层序号列。
 * 页面层负责取数与状态，CommentSection 只接收 props / 抛出事件。
 */
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import CommentSection from "@/components/comment/index.vue";
import { mockCurrentUser } from "@/components/comment/mock.js";
import { getCommentListApi } from "@/api/comment";

const currentUser = { ...mockCurrentUser };

// —— 演示控制项 ——
const countOptions = [50, 200, 500, 1000, 5000];
const count = ref(500);
const seed = ref(0);
const loading = ref(false);
const virtualScroll = ref(true);
const showFloorIndex = ref(true);
const floorSortable = ref(true);
const listHeight = ref(600);

// —— 评论数据（v-model:comments 与组件双向同步）——
const comments = ref([]);

// —— 组件事件计数（验证交互回调）——
const eventCount = ref({ send: 0, reply: 0, like: 0, delete: 0 });
const bump = (key) => {
  eventCount.value[key] += 1;
};

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

// 更换 seed → mock 侧击穿缓存，重新生成一批全新数据
const regenerate = () => {
  seed.value += 1;
  loadData();
};

onMounted(loadData);
</script>

<template>
  <div class="comment-demo">
    <el-card shadow="never" class="comment-demo__panel">
      <template #header>
        <div class="comment-demo__toolbar">
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
          <el-button size="small" @click="regenerate">重新生成一批</el-button>

          <el-divider direction="vertical" />

          <span class="comment-demo__label">虚拟滚动</span>
          <el-switch v-model="virtualScroll" />
          <span class="comment-demo__label">楼层序号列</span>
          <el-switch v-model="showFloorIndex" :disabled="!virtualScroll" />
          <span class="comment-demo__label">列头点击排序</span>
          <el-switch
            v-model="floorSortable"
            :disabled="!virtualScroll || !showFloorIndex"
          />
          <span class="comment-demo__label">视口高度</span>
          <el-select v-model="listHeight" size="small" style="width: 100px">
            <el-option :value="400" label="400px" />
            <el-option :value="600" label="600px" />
            <el-option :value="800" label="800px" />
          </el-select>
        </div>
      </template>

      <div class="comment-demo__events">
        事件计数：发布
        <b>{{ eventCount.send }}</b> · 回复 <b>{{ eventCount.reply }}</b> ·
        点赞 <b>{{ eventCount.like }}</b> · 删除
        <b>{{ eventCount.delete }}</b>
        <span class="comment-demo__tip">
          （楼层为按发帖时间固定的编号，切换最热/最新排序后序号列仍显示原始楼层）
        </span>
      </div>

      <CommentSection
        v-model:comments="comments"
        :current-user="currentUser"
        :loading="loading"
        :virtual-scroll="virtualScroll"
        :list-height="listHeight"
        :show-floor-index="showFloorIndex"
        :floor-sortable="floorSortable"
        @send="bump('send')"
        @reply="bump('reply')"
        @like="bump('like')"
        @delete="bump('delete')"
      />
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.comment-demo {
  display: flex;
  justify-content: center;

  &__panel {
    width: 100%;
    max-width: 760px;
    border-radius: 8px;
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
