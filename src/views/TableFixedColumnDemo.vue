<script setup lang="jsx">
/**
 * 表格固定列 + 过滤图标修复验证演示页
 * 专门测试以下修复点：
 *   1. 列配置 width/minWidth 后水平滚动条是否正常出现
 *   2. 右固定列（fixed: 'right'）表头过滤图标是否显示完整（不被裁剪）
 *   3. 过滤激活态红色角标（::after 伪元素）在固定列上是否可见
 *   4. 左/右固定列与滚动区域之间是否有实线 border 分界线
 *   5. 修复后普通列（非固定列）的过滤/排序图标显示是否受影响（回归验证）
 */
import { ref } from "vue";
import { ElTag, ElButton, ElMessage } from "element-plus";

// ========== 测试场景切换 ==========
// 0: 综合场景（左固定 + 右固定 + 多列滚动 + 过滤）
// 1: 仅右固定列 + 过滤（最小复现场景）
// 2: 无固定列（回归验证：普通列图标显示不受影响）
// 3: border=false 验证（分界线在 border=false 时不应突兀）
const sceneIndex = ref(0);

const scenes = [
  { label: "综合场景（左固定+右固定+多列）", value: 0 },
  { label: "最小复现（仅右固定+过滤）", value: 1 },
  { label: "回归验证（无固定列）", value: 2 },
  { label: "border=false 验证", value: 3 },
];

// ========== 静态数据生成 ==========
const genData = (count = 30) => {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: i,
      name: `用户${String(i).padStart(3, "0")}`,
      account: `user_${i}`,
      email: `user${i}@example.com`,
      phone: `138${String(10000000 + i).slice(-8)}`,
      department: i % 3 === 0 ? "研发部" : i % 3 === 1 ? "产品部" : "设计部",
      role: i % 4 === 0 ? "admin" : i % 4 === 1 ? "editor" : i % 4 === 2 ? "viewer" : "developer",
      status: i % 2,
      age: 20 + (i % 30),
      salary: 8000 + i * 100,
      joinDate: `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
      address: `北京市朝阳区某某街道${i}号`,
      remark: `这是第 ${i} 条数据的备注信息，内容比较长用于测试省略号显示`,
      level: i % 5,
      score: 60 + (i * 7) % 40,
    });
  }
  return list;
};
const tableData = ref(genData());

// ========== 公共列配置（带过滤 + 排序，用于回归验证普通列图标显示）==========
const baseColumns = [
  { type: "seq", width: 60, title: "序号" },
  {
    field: "name",
    title: "姓名",
    width: 120,
    sortable: true,
    filterType: "FilterInput",
  },
  {
    field: "account",
    title: "账号",
    width: 140,
    sortable: true,
    filterType: "FilterInput",
  },
  {
    field: "email",
    title: "邮箱邮箱邮箱邮箱",
    minWidth: 200,
    sortable: true,
    filterType: "FilterInput",
  },
  {
    field: "phone",
    title: "手机号",
    width: 150,
    sortable: true,
    filterType: "FilterInput",
  },
  {
    field: "department",
    title: "部门",
    width: 130,
    sortable: true,
    filterType: "FilterCheckbox",
    filterRender: {
      name: "FilterCheckbox",
      props: {
        options: [
          { label: "研发部", value: "研发部" },
          { label: "产品部", value: "产品部" },
          { label: "设计部", value: "设计部" },
        ],
      },
    },
  },
  {
    field: "role",
    title: "角色",
    width: 130,
    sortable: true,
    filterType: "FilterCheckbox",
    filterRender: {
      name: "FilterCheckbox",
      props: {
        options: [
          { label: "管理员", value: "admin" },
          { label: "编辑", value: "editor" },
          { label: "访客", value: "viewer" },
          { label: "开发者", value: "developer" },
        ],
      },
    },
  },
  {
    field: "status",
    title: "状态",
    width: 100,
    sortable: true,
    filterType: "FilterCheckbox",
    filterRender: { name: "FilterCheckbox" },
    render: (params, h) => {
      const val = params.cellValue;
      return (
        <ElTag type={val ? "success" : "info"} size="small" effect="light">
          {val ? "启用" : "禁用"}
        </ElTag>
      );
    },
  },
  {
    field: "age",
    title: "年龄",
    width: 100,
    sortable: true,
    filterType: "FilterNumberRange",
    filterRender: { name: "FilterNumberRange", suffix: "岁" },
  },
  {
    field: "salary",
    title: "薪资",
    width: 120,
    sortable: true,
    filterType: "FilterNumberRange",
    filterRender: { name: "FilterNumberRange", suffix: "元" },
  },
  {
    field: "joinDate",
    title: "入职日期",
    width: 150,
    sortable: true,
    filterType: "FilterDateRange",
  },
  {
    field: "address",
    title: "地址",
    minWidth: 220,
    filterType: "FilterInput",
  },
  {
    field: "level",
    title: "等级",
    width: 100,
    sortable: true,
    filterType: "FilterCheckbox",
    filterRender: { name: "FilterCheckbox" },
  },
  {
    field: "score",
    title: "评分",
    width: 100,
    sortable: true,
    filterType: "FilterNumberRange",
  },
  {
    field: "remark",
    title: "备注",
    minWidth: 200,
    filterType: "FilterInput",
  },
];

// 右固定操作列（带过滤图标，用于测试图标显示完整性）
const rightFixedActionColumn = {
  field: "action",
  title: "操作",
  width: 200,
  fixed: "right",
  // 关键：给固定列也配过滤，测试过滤图标 + 激活角标在 fixed:right 列上是否完整显示
  filterType: "FilterCheckbox",
  filterRender: {
    name: "FilterCheckbox",
    props: {
      options: [
        { label: "编辑权限", value: "edit" },
        { label: "删除权限", value: "delete" },
        { label: "查看权限", value: "view" },
      ],
    },
  },
  render: (params, h) => {
    const row = params.row;
    return (
      <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
        <ElButton
          type="primary"
          link
          size="small"
          onClick={() => ElMessage.success(`编辑：${row.name}`)}
        >
          编辑
        </ElButton>
        <ElButton
          type="danger"
          link
          size="small"
          onClick={() => ElMessage.warning(`删除：${row.name}`)}
        >
          删除
        </ElButton>
      </div>
    );
  },
};

// 左固定列（带过滤，测试左侧分界线）
const leftFixedColumn = {
  field: "id",
  title: "ID",
  width: 80,
  fixed: "left",
  sortable: true,
  filterType: "FilterInput",
};

// ========== 各场景列配置 ==========
const getColumns = (idx) => {
  switch (idx) {
    case 0: // 综合：左固定 + 普通列 + 右固定
      return [leftFixedColumn, ...baseColumns, rightFixedActionColumn];
    case 1: // 最小复现：少量普通列 + 右固定带过滤
      return [
        { type: "seq", width: 60, title: "序号" },
        { field: "name", title: "姓名", width: 120, filterType: "FilterInput", sortable: true },
        { field: "account", title: "账号", width: 140, filterType: "FilterInput" },
        { field: "department", title: "部门", width: 130, filterType: "FilterCheckbox", filterRender: { name: "FilterCheckbox" } },
        rightFixedActionColumn,
      ];
    case 2: // 回归：无固定列，验证普通列图标不受影响
      return baseColumns;
    case 3: // border=false：验证分界线不会突兀
      return [leftFixedColumn, ...baseColumns, rightFixedActionColumn];
    default:
      return baseColumns;
  }
};

const currentColumns = ref(getColumns(0));
const currentBorder = ref(true);

const onSceneChange = (val) => {
  sceneIndex.value = val;
  currentColumns.value = getColumns(val);
  currentBorder.value = val !== 3;
};

// 默认激活一个过滤条件，用于测试激活角标在固定列上的显示
const initParam = ref({
  filters: {
    // 右固定列的过滤默认激活，测试红色角标是否被裁剪
    action: ["edit"],
    // 普通列也激活一个，对比显示
    role: ["admin"],
  },
});

const onFilterConfirm = (payload) => {
  const active = (payload?.filters || []).filter((f) => f.active).length;
  ElMessage.success(`过滤确认：${active} 个条件生效`);
};
</script>

<template>
  <div style="padding: 0 20px 20px">
    <!-- 场景切换 -->
    <el-card style="margin-bottom: 16px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span style="font-weight: 600; font-size: 15px">修复验证测试场景</span>
          <el-radio-group :model-value="sceneIndex" size="small" @change="onSceneChange">
            <el-radio-button
              v-for="s in scenes"
              :key="s.value"
              :value="s.value"
            >
              {{ s.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div style="font-size: 13px; color: #606266; line-height: 1.8">
        <p><b>验证要点：</b></p>
        <ol style="margin: 0; padding-left: 20px">
          <li>水平滚动：列总宽超过容器时底部应出现横向滚动条，拖动滚动条验证</li>
          <li>右固定列过滤图标：「操作」列表头的漏斗图标应完整显示，不被裁切</li>
          <li>激活角标：点击过滤并确认后，图标右上角红色圆点应完整可见（不被 overflow:hidden 切掉）</li>
          <li>分界线：左右固定列与中间滚动区域之间应有实线 border，滚动时线条连续不断</li>
          <li>回归：切换到「无固定列」场景，普通列的过滤/排序图标显示应与修复前一致</li>
        </ol>
      </div>
    </el-card>

    <!-- 测试表格 -->
    <TablePro
      :key="sceneIndex"
      :columns="currentColumns"
      :data="tableData"
      :border="currentBorder"
      :local-filter-sort="true"
      :pagination="true"
      :pager-config="{ pageSizes: [10, 20, 50] }"
      :init-param="initParam"
      :toolbar-config="{ wrapToggle: true }"
      height="auto"
      style="height: 600px"
      @filter-confirm="onFilterConfirm"
    />
  </div>
</template>
