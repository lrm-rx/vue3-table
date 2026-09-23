<script setup>
/**
 * 基础布局：左侧可折叠 el-menu 侧边栏 + 右侧 router-view 内容区。
 * 菜单项由路由表的 meta.title / meta.icon 驱动，el-menu 开启 router 模式，
 * 点击即路由跳转；isCollapse 控制侧边栏展开/收起。
 */
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import {
  ChatDotRound,
  ChatLineSquare,
  Grid,
  EditPen,
  Document,
  Fold,
  Expand,
} from "@element-plus/icons-vue";

const route = useRoute();

// 侧边栏折叠状态（持久化到 localStorage，刷新后保持）
const STORAGE_KEY = "app_sidebar_collapsed";
const isCollapse = ref(localStorage.getItem(STORAGE_KEY) === "1");
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value;
  localStorage.setItem(STORAGE_KEY, isCollapse.value ? "1" : "0");
};

// 图标映射（与各路由 meta.icon 对应）
const iconMap = {
  ChatDotRound,
  ChatLineSquare,
  Grid,
  EditPen,
  Document,
};

// 菜单数据：取当前布局下的子路由
const menuRoutes = computed(() => {
  const matched = route.matched[0];
  return (matched?.children || []).map((c) => ({
    path: `/${c.path}`,
    title: c.meta?.title || c.path,
    icon: c.meta?.icon,
  }));
});

const activePath = computed(() => route.path);
</script>

<template>
  <el-container class="layout">
    <el-aside :width="isCollapse ? '64px' : '220px'" class="layout__aside">
      <div class="layout__logo">
        <el-icon :size="20"><Grid /></el-icon>
        <span v-show="!isCollapse" class="layout__logo-text">Vue3 组件库</span>
      </div>
      <el-menu
        :default-active="activePath"
        :collapse="isCollapse"
        :collapse-transition="false"
        router
        class="layout__menu"
        background-color="#001529"
        text-color="#cfd8dc"
        active-text-color="#409eff"
      >
        <el-menu-item v-for="m in menuRoutes" :key="m.path" :index="m.path">
          <el-icon><component :is="iconMap[m.icon] || Grid" /></el-icon>
          <template #title>{{ m.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout__header">
        <el-icon class="layout__collapse-btn" @click="toggleCollapse">
          <component :is="isCollapse ? Expand : Fold" />
        </el-icon>
        <span class="layout__header-title">
          {{ route.meta?.title || "首页" }}
        </span>
      </el-header>
      <el-main class="layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style lang="scss" scoped>
.layout {
  height: 100vh;

  &__aside {
    background-color: #001529;
    transition: width 0.2s;
    overflow: hidden;
  }
  &__logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 60px;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
  }
  &__logo-text {
    overflow: hidden;
  }
  &__menu {
    border-right: none;
    height: calc(100vh - 60px);
  }
  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fff;
    border-bottom: 1px solid #ebeef5;
    box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  }
  &__collapse-btn {
    font-size: 20px;
    cursor: pointer;
    color: #606266;

    &:hover {
      color: #409eff;
    }
  }
  &__header-title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
  }
  &__main {
    background-color: #f0f2f5;
    overflow: auto;
  }
}
</style>

<style>
/* 清零 body 默认 margin，保证 100vh 布局不出现文档级滚动条 */
body {
  margin: 0;
}
</style>
