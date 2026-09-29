<script setup>
/**
 * FloatBall 悬浮球演示页
 *  - 可拖拽：按住中心球拖动，松开后自动吸附到最近的左 / 右窗口边缘（垂直位置保持不变）
 *  - 悬浮展开：鼠标移入展开 n 个扇形按钮（沿圆环均分，整体呈圆形），移出收起
 *  - 按钮名称/图标可自定义
 *  - 可调吸附开关、半隐藏、展开半径、吸附阈值、按钮数量
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  House,
  Search,
  Bell,
  Setting,
  Star,
  Top,
} from '@element-plus/icons-vue'
import FloatBall from '@/components/floatBall/index.vue'

// 可选按钮池（名称可自定义）
const buttonPool = [
  { name: '首页', icon: House, color: '#409eff' },
  { name: '搜索', icon: Search, color: '#67c23a' },
  { name: '消息', icon: Bell, color: '#e6a23c' },
  { name: '收藏', icon: Star, color: '#f56c6c' },
  { name: '设置', icon: Setting, color: '#909399' },
  { name: '回顶', icon: Top, color: '#9c27b0' },
]

// 按钮数量（n 扇形）
const count = ref(5)
const items = computed(() => buttonPool.slice(0, count.value))

// 配置项
const snapEnabled = ref(true)
const hideHalf = ref(false)
const radius = ref(90)
const snapThreshold = ref(0)
const expandOnHover = ref(true)
const ballRef = ref()

// 事件反馈
const lastEvent = ref('（暂无操作）')
const onItemClick = (item) => {
  lastEvent.value = `点击了「${item.name}」`
  if (item.name === '回顶') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  ElMessage.success(`点击了「${item.name}」`)
}
const onSnap = (edge) => {
  lastEvent.value = `吸附到「${edge}」边`
}
</script>

<template>
  <div class="float-demo">
    <el-card shadow="never" class="float-demo__panel">
      <template #header>
        <span class="float-demo__title">灵动悬浮球 FloatBall</span>
      </template>

      <div class="float-demo__tip">
        <el-icon><InfoFilled /></el-icon>
        <span>
          按住中心球<b>拖拽</b>，松开后<b>吸附到最近的左 / 右边缘</b>（垂直位置不变）；
          鼠标<b>悬浮</b>展开环形按钮（{{ count }} 扇形，整体呈圆形）。
        </span>
      </div>

      <el-form inline label-width="90px" class="float-demo__form">
        <el-form-item label="按钮数量">
          <el-slider v-model="count" :min="2" :max="6" :marks="{ 2: '2', 4: '4', 6: '6' }" style="width: 160px" />
        </el-form-item>
        <el-form-item label="展开半径">
          <el-slider v-model="radius" :min="60" :max="140" :step="10" style="width: 160px" />
        </el-form-item>
        <el-form-item label="吸附阈值">
          <el-slider v-model="snapThreshold" :min="0" :max="300" :step="10" style="width: 160px" />
        </el-form-item>
        <el-form-item label="边缘吸附">
          <el-switch v-model="snapEnabled" />
        </el-form-item>
        <el-form-item label="半隐藏">
          <el-switch v-model="hideHalf" />
        </el-form-item>
        <el-form-item label="悬浮展开">
          <el-switch v-model="expandOnHover" />
        </el-form-item>
        <el-form-item label="实例方法">
          <el-button size="small" @click="ballRef?.expand()">展开</el-button>
          <el-button size="small" @click="ballRef?.collapse()">收起</el-button>
          <el-button size="small" @click="ballRef?.snapToEdge()">立即吸附</el-button>
        </el-form-item>
      </el-form>

      <el-alert
        class="float-demo__event"
        :title="`最近事件：${lastEvent}`"
        type="info"
        :closable="false"
        show-icon
      />

      <!-- 占位内容，验证悬浮球 fixed 定位不随页面滚动 -->
      <div class="float-demo__content">
        <p v-for="n in 24" :key="n" class="float-demo__line">
          页面占位内容第 {{ n }} 行 —— 滚动页面，悬浮球始终固定在视口内。
        </p>
      </div>
    </el-card>

    <!-- 悬浮球：fixed 定位，挂在演示页内即可全局悬浮 -->
    <FloatBall
      ref="ballRef"
      :items="items"
      :snap="snapEnabled"
      :hide-half="hideHalf"
      :radius="radius"
      :snap-threshold="snapThreshold"
      :expand-on-hover="expandOnHover"
      title="菜单"
      @item-click="onItemClick"
      @snap="onSnap"
    />
  </div>
</template>

<style scoped lang="scss">
.float-demo {
  position: relative;

  &__panel {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    border-radius: 8px;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
  }

  &__tip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: #f4f4f5;
    border-radius: 4px;
    font-size: 13px;
    color: #61666d;

    b {
      color: #fb7299;
    }
  }

  &__form {
    margin-bottom: 8px;
  }

  &__event {
    margin-bottom: 12px;
  }

  &__content {
    color: #909399;
  }

  &__line {
    margin: 14px 0;
    font-size: 13px;
  }
}
</style>
