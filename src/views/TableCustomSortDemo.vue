<script setup lang="jsx">
/**
 * 列个性化设置 · 拖拽排序演示页
 * 验证 TablePro 内置列面板的拖拽排序能力（分组列同样支持），实现方式：
 *   - customConfig.immediate = true：拖拽实时生效（免点「确定」，也是分组子列可拖的前提）
 *   - columnDragConfig.isPeerDrag = true：允许同级拖动，分组内子列（level >= 2）显示拖拽手柄
 * 验证要点：
 *   1. 顶层列互拖排序（含分组列整体拖动，子列跟随）
 *   2. 分组内子列同级拖动排序
 *   3. 拖拽实时生效，无需点「确定」
 *   4. customStorage 场景：拖动结果记忆到 localStorage，刷新页面后顺序保留
 */
import { ref } from "vue";
import { ElTag, ElMessage } from "element-plus";
import TablePro from "@/components/tablePro/index.vue";

// ========== 场景切换 ==========
// 0: 拖拽排序（默认，不记忆）
// 1: 拖拽排序 + customStorage 记忆（刷新页面顺序保留）
const sceneIndex = ref(0);

const scenes = [
  { label: "拖拽排序（默认）", value: 0 },
  { label: "拖拽排序 + 记忆（刷新保留）", value: 1 },
];

// ========== 静态数据 ==========
const genData = (count = 28) => {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: i,
      name: `用户${String(i).padStart(3, "0")}`,
      age: 20 + (i % 30),
      gender: i % 2,
      birthDate: `19${String(70 + (i % 30)).padStart(2, "0")}-0${(i % 9) + 1}-1${i % 9}`,
      department: i % 3 === 0 ? "研发部" : i % 3 === 1 ? "产品部" : "设计部",
      phone: `138${String(10000000 + i).slice(-8)}`,
      email: `user${i}@example.com`,
      salary: 8000 + i * 100,
      joinDate: `202${i % 4}-${String((i % 12) + 1).padStart(2, "0")}-15`,
      status: i % 2,
      address: `北京市朝阳区某某街道${i}号`,
      score: 60 + ((i * 7) % 40),
    });
  }
  return list;
};
const tableData = ref(genData());

// ========== 列配置（含两个表头分组）==========
const buildColumns = () => [
  { type: "seq", width: 60, title: "序号" },
  { field: "name", title: "姓名", width: 120, sortable: true },
  {
    // 分组列：面板内可整体拖动，子列跟随；子列可在组内同级拖动
    title: "基本信息",
    children: [
      { field: "age", title: "年龄", width: 100, sortable: true },
      {
        field: "gender",
        title: "性别",
        width: 90,
        render: (params, h) => (
          <ElTag type={params.cellValue ? "success" : "primary"} size="small" effect="light">
            {params.cellValue ? "女" : "男"}
          </ElTag>
        ),
      },
      { field: "birthDate", title: "出生日期", width: 150 },
    ],
  },
  { field: "department", title: "部门", width: 120, sortable: true },
  {
    title: "联系方式",
    children: [
      { field: "phone", title: "手机号", width: 140 },
      { field: "email", title: "邮箱", width: 200 },
    ],
  },
  { field: "salary", title: "薪资", width: 110, sortable: true },
  { field: "joinDate", title: "入职日期", width: 130, sortable: true },
  {
    field: "status",
    title: "状态",
    width: 90,
    render: (params, h) => (
      <ElTag type={params.cellValue ? "success" : "info"} size="small" effect="light">
        {params.cellValue ? "在职" : "离职"}
      </ElTag>
    ),
  },
  { field: "address", title: "地址", minWidth: 200 },
  { field: "score", title: "绩效", width: 90, sortable: true },
];

const currentColumns = ref(buildColumns());

const onSceneChange = (val) => {
  sceneIndex.value = val;
  // 重建列配置 + :key 强制重建表格，避免上个场景的记忆状态串场
  currentColumns.value = buildColumns();
};

// ========== 拖拽排序事件 ==========
// vxe-grid 透传事件：custom-sort-change 在面板内拖拽排序变更时触发（immediate 模式下每次拖动即触发）
const onCustomSortChange = (params) => {
  const title = params?.column?.title || "列";
  ElMessage.success(`「${title}」顺序已更新（实时生效）`);
};

// ========== 重置列配置 ==========
// 通过暴露的 gridRef 调 vxe-grid 原生 resetCustom，恢复初始顺序并清空面板改动（含 storage 记忆）
const proRef = ref(null);
const resetColumnSetting = () => {
  proRef.value?.gridRef?.resetCustom(true);
  ElMessage.info("已重置列配置");
};
</script>

<template>
  <div style="padding: 0 20px 20px">
    <!-- 说明卡片 -->
    <el-card style="margin-bottom: 16px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span style="font-weight: 600; font-size: 15px">列个性化 · 拖拽排序验证场景</span>
          <div style="display: flex; gap: 12px; align-items: center">
            <el-button size="small" @click="resetColumnSetting">重置列配置</el-button>
            <el-radio-group :model-value="sceneIndex" size="small" @change="onSceneChange">
              <el-radio-button v-for="s in scenes" :key="s.value" :value="s.value">
                {{ s.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>
      <div style="font-size: 13px; color: #606266; line-height: 1.8">
        <p style="margin: 0 0 4px"><b>操作入口：</b>点击表格工具栏右侧的「列个性化设置」按钮（漏斗/齿轮图标）打开面板。</p>
        <p><b>验证要点：</b></p>
        <ol style="margin: 0; padding-left: 20px">
          <li>面板内每列左侧出现排序手柄，按住可拖动；拖完即时生效（immediate），无需点「确定」</li>
          <li>顶层列互拖：拖动普通列调整顺序，表格列实时重排</li>
          <li>分组整体拖动：拖动「基本信息」「联系方式」分组列，其子列跟随移动</li>
          <li>组内子列拖动：分组内子列（年龄/性别/出生日期 等）可同级拖动排序</li>
          <li>记忆场景：切到「拖拽排序 + 记忆」后拖动，刷新浏览器页面，列顺序保持不变</li>
        </ol>
      </div>
    </el-card>

    <!-- 测试表格 -->
    <TablePro
      :key="sceneIndex"
      ref="proRef"
      table-id="customSortDemo"
      :columns="currentColumns"
      :data="tableData"
      :custom-storage="sceneIndex === 1"
      :pagination="true"
      :pager-config="{ pageSizes: [10, 20, 50] }"
      height="auto"
      style="height: 560px"
      @custom-sort-change="onCustomSortChange"
    />
  </div>
</template>
