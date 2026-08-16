<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { getUserListApi, getFilterOptionsApi } from "@/api";

// ========== 列配置（匹配 mockjs 用户列表 + 列过滤渲染器 + 排序）==========
const columns = ref([
  { type: "checkbox", width: 50 },
  { type: "seq", width: 60, title: "序号" },
  {
    field: "username",
    title: "姓名",
    minWidth: 130,
    sortable: true,
    // FilterInput: 按姓名模糊查询
    filters: [{ data: { value: "" } }],
    filterRender: { name: "FilterInput" },
  },
  {
    field: "account",
    title: "账号",
    minWidth: 130,
    sortable: true,
    filters: [{ data: { value: "" } }],
    filterRender: { name: "FilterInput" },
  },
  {
    field: "email",
    title: "邮箱",
    minWidth: 200,
    filters: [{ data: { value: "" } }],
    filterRender: { name: "FilterInput" },
  },
  {
    field: "phone",
    title: "手机号",
    minWidth: 130,
    sortable: true,
    filters: [{ data: { value: "" } }],
    filterRender: { name: "FilterInput" },
  },
  {
    field: "role",
    title: "角色",
    minWidth: 110,
    sortable: true,
    // 自定义 requestFilterAPI 组合参数的 key（默认取 field）
    filterParamKey: "roleList",
    formatter: ({ cellValue }) =>
      ({
        admin: "管理员",
        editor: "编辑",
        viewer: "访客",
        developer: "开发者",
      })[cellValue] ?? cellValue,
    // FilterCheckbox: 多选角色
    filters: [{ data: { values: [], search: "" } }],
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
    field: "department",
    title: "部门",
    minWidth: 100,
    sortable: true,
    // 自定义 requestFilterAPI 组合参数的 key（默认取 field）
    filterParamKey: "departmentList",
    // FilterCheckbox: 多选部门（远程模式时选项由 requestFilterAPI 提供）
    filters: [{ data: { values: [], search: "" } }],
    filterRender: {
      name: "FilterCheckbox",
      props: {
        // 静态选项：未传 requestFilterAPI 时使用；传了 requestFilterAPI 时由接口提供
        options: [],
      },
    },
  },
  {
    field: "status",
    title: "状态",
    width: 100,
    sortable: true,
    formatter: ({ cellValue }) =>
      ({ 0: "禁用", 1: "启用" })[cellValue] ?? cellValue,
    // FilterCheckbox: 多选状态
    filters: [{ data: { values: [], search: "" } }],
    filterRender: {
      name: "FilterCheckbox",
      props: {
        options: [
          { label: "启用", value: 1 },
          { label: "禁用", value: 0 },
        ],
      },
    },
  },
  {
    field: "createTime",
    title: "创建时间",
    minWidth: 180,
    sortable: true,
    // FilterDateRange: 按创建时间区间过滤
    filters: [{ data: { start: "", end: "" } }],
    filterRender: { name: "FilterDateRange" },
  },
]);

// ========== 远程模式：requestApi ==========
const currentApi = ref(getUserListApi);

// ========== 过滤选项远程接口（requestFilterAPI）==========
// 切换是否使用远程接口拉取 FilterCheckbox 列的过滤选项
// requestFilterAPI 接收组合参数 { field, filters }：
//   - field: 当前要拉取选项的列 field
//   - filters: 所有 FilterCheckbox 列的当前过滤值，形如 { roleList: ['admin'], departmentList: [], status: [] }
//     参数 key 通过列配置 filterParamKey 自定义（role/department 列），默认取 field（status 列）
const useRemoteFilter = ref(true);
// 接口返回数据使用 name / code 键名，配合 filterOptionKeys 映射
const requestFilterAPI = ref(
  useRemoteFilter.value ? (params) => getFilterOptionsApi(params) : null,
);
const onToggleRemoteFilter = () => {
  useRemoteFilter.value = !useRemoteFilter.value;
  requestFilterAPI.value = useRemoteFilter.value
    ? (params) => getFilterOptionsApi(params)
    : null;
  ElMessage.info(
    `过滤选项远程接口已${useRemoteFilter.value ? "开启" : "关闭"}（点击「角色」「部门」「状态」列的过滤图标验证）`,
  );
};

// ========== 默认参数（initParam）==========
// 首屏加载即应用：默认分页 20 条/页、按创建时间降序、默认过滤角色=admin+developer
// 演示要点：
//  - role 多选默认值 ['admin','developer'] → 面板打开时这两个选项会置顶显示
//  - sortField/sortOrder → 排序图标高亮
//  - filters → 过滤图标高亮 + 面板内显示默认值
const initParam = ref({
  pageNum: 1,
  pageSize: 20,
  sortField: "createTime",
  sortOrder: "desc",
  filters: {
    role: ["admin", "developer"],
  },
});

// 数据回调：对返回的数据进行二次处理
const onDataCallback = (data) => {
  if (!data || !Array.isArray(data.list)) return data;
  data.list = data.list.map((item) => ({
    ...item,
    roleText:
      { admin: "管理员", editor: "编辑", viewer: "访客", developer: "开发者" }[
        item.role
      ] || item.role,
  }));
  return data;
};

// 过滤选项数据回调：对 requestFilterAPI 返回的原始数据进行二次处理
// 验证点：
//   1) 回调被调用 → 控制台打印收到的原始数据
//   2) 数据处理生效 → 过滤掉 code === 'tester' 的项（mock 默认返回5项，处理后应为4项）
const onFilterDataCallback = (data) => {
  console.log("[filterDataCallback] 收到原始数据:", data);
  if (!Array.isArray(data)) return data;
  const filtered = data.filter((item) => item.code !== "tester");
  console.log("[filterDataCallback] 处理后数据:", filtered);
  return filtered;
};

// 请求错误监听
const onRequestError = (error) => {
  console.error("[TablePro requestError]", error);
  ElMessage.error(`表格请求失败：${error?.message || error}`);
};

// ========== 测试按钮 ==========
const tableProRef = ref();
const paginationEnabled = ref(true);

const onManualRefresh = () => {
  tableProRef.value?.getTableList?.();
  ElMessage.success("已触发手动刷新");
};

const failingApi = () =>
  Promise.reject(new Error("模拟请求失败（测试 requestError）"));
const onTestError = () => {
  currentApi.value = failingApi;
  ElMessage.info("已切换为失败 api，点击手动刷新触发 requestError");
};

const onRestoreApi = () => {
  currentApi.value = getUserListApi;
  ElMessage.success("已恢复为 getUserListApi");
};

const onTogglePagination = () => {
  paginationEnabled.value = !paginationEnabled.value;
  ElMessage.info(
    `分页已${paginationEnabled.value ? "开启" : "关闭"}（重新挂载组件生效）`,
  );
};

const onCheckboxChange = () => {
  const rows = tableProRef.value?.getCheckboxRecords?.() || [];
  if (rows.length) ElMessage.info(`已选中 ${rows.length} 条`);
};

// 列过滤确认 / 重置 / 全部重置事件回调（外部监听；内部已联动 useTable）
const onFilterConfirm = (payload) => {
  const active = (payload?.filters || []).filter((f) => f.active).length;
  if (active)
    ElMessage.success(
      `列过滤确认：生效条件 ${active} 条（已联动 useTable.search）`,
    );
};
const onFilterReset = (payload) => {
  const field = payload?.column?.field || "未知";
  ElMessage.info(`已重置列「${field}」过滤条件（已联动 useTable.search）`);
};
const onFilterResetAll = () => {
  ElMessage.info("已清空所有列过滤条件（已联动 useTable.search）");
};

// 列排序变化事件回调（外部监听；内部已联动 useTable.search）
const onSortChange = (payload) => {
  const field = payload?.field || payload?.property || "未知";
  const order = payload?.order || "无";
  ElMessage.success(
    `列排序变化：${field} → ${order}（已联动 useTable.search）`,
  );
};

// 工具栏「刷新」按钮事件：参数为当前所有过滤 + 排序条件
const onRefresh = (payload) => {
  const activeFilters = (payload?.filters || []).filter((f) => f.active).length;
  const activeSorts = (payload?.sorts || []).filter((s) => s.order).length;
  ElMessage.success(
    `工具栏刷新：过滤条件 ${activeFilters} 条，排序条件 ${activeSorts} 条（已根据当前搜索条件重新请求）`,
  );
};

// 工具栏「重置过滤」按钮事件：参数为清空后的所有过滤 + 排序条件
const onResetFilter = (payload) => {
  const remainingFilters = (payload?.filters || []).filter(
    (f) => f.active,
  ).length;
  const activeSorts = (payload?.sorts || []).filter((s) => s.order).length;
  ElMessage.info(
    `工具栏重置过滤：剩余过滤 ${remainingFilters} 条，排序 ${activeSorts} 条（已联动 useTable.search）`,
  );
};
</script>

<template>
  <div style="padding: 20px; height: 100vh; box-sizing: border-box">
    <!-- <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap">
      <el-button type="primary" @click="onManualRefresh"
        >手动刷新（getTableList）</el-button
      >
      <el-button type="danger" @click="onTestError"
        >模拟请求错误（测试 requestError）</el-button
      >
      <el-button type="warning" @click="onRestoreApi">恢复正常 api</el-button>
      <el-button @click="onTogglePagination">切换分页（pagination）</el-button>
      <el-button
        :type="useRemoteFilter ? 'success' : 'info'"
        @click="onToggleRemoteFilter"
      >
        过滤选项远程接口：{{ useRemoteFilter ? "开启" : "关闭" }}
      </el-button>
      <el-tag v-if="currentApi === getUserListApi" type="success"
        >当前 api: getUserListApi</el-tag
      >
      <el-tag v-else type="danger">当前 api: failingApi</el-tag>
      <el-tag v-if="paginationEnabled" type="info">pagination: true</el-tag>
      <el-tag v-else type="warning">pagination: false</el-tag>
      <el-tag v-if="useRemoteFilter" type="success"
        >filterOptionKeys: { label: name, value: code }</el-tag
      >
    </div>
    <div style="margin-bottom: 10px; color: #606266; font-size: 13px">
      验证提示（默认参数 initParam 已启用）：<br />
      ·
      首屏加载即带默认参数：pageSize=20、sortField=createTime&sortOrder=desc、role=admin,developer；<br />
      · 工具栏「刷新」按钮：根据当前搜索条件（过滤+排序）重新触发请求，并抛出
      @refresh 事件（参数为所有过滤+排序条件）；<br />
      · 工具栏「重置过滤」按钮：清空所有列过滤条件并重新请求，抛出 @reset-filter
      事件（参数为清空后的过滤+排序条件）；<br />
      · 过滤图标高亮（漏斗变蓝 +
      红点角标）表示该列有过滤条件生效；排序图标高亮表示该列有排序生效；<br />
      ·
      打开「角色」过滤面板，默认选中的「管理员」「开发者」会置顶显示（多选默认值可见性保障）；<br />
      · 列排序仅通过点击排序图标触发（trigger:
      'button'），点击列标题文字不会触发排序。<br />
      ·
      <b>requestFilterAPI</b
      >：开启后点击「角色」「部门」「状态」列的过滤图标会远程拉取选项（接口返回
      name/code 键名，通过 filterOptionKeys 映射为
      label/value）；关闭后「角色」「状态」回退到列配置静态
      options，「部门」无静态 options 则显示「无匹配数据」。<br />
      · 仅 FilterCheckbox 列受 requestFilterAPI 影响，FilterInput /
      FilterDateRange 列不受影响。
    </div> -->

    <TablePro
      ref="tableProRef"
      :key="paginationEnabled ? 'p-on' : 'p-off'"
      :columns="columns"
      :request-api="currentApi"
      :request-auto="true"
      :data-callback="onDataCallback"
      :request-error="onRequestError"
      :requestFilterAPI="requestFilterAPI"
      :filter-data-callback="onFilterDataCallback"
      :filter-option-keys="
        useRemoteFilter
          ? { label: 'name', value: 'code' }
          : { label: 'label', value: 'value' }
      "
      :pagination="paginationEnabled"
      :init-param="initParam"
      :sort-config="{ remote: true, multiple: false, trigger: 'button' }"
      height="auto"
      @checkbox-change="onCheckboxChange"
      @checkbox-all="onCheckboxChange"
      @filter-confirm="onFilterConfirm"
      @filter-reset="onFilterReset"
      @filter-reset-all="onFilterResetAll"
      @sort-change="onSortChange"
      @refresh="onRefresh"
      @reset-filter="onResetFilter"
    >
      <template #toolbarButtons>
        <el-button type="primary">按钮1</el-button>
        <el-button type="primary">按钮2</el-button>
        <el-button type="primary">按钮3</el-button>
      </template>
    </TablePro>
  </div>
</template>

<style scoped lang="scss">
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;

  &:hover {
    filter: drop-shadow(0 0 2em #646cffaa);
  }

  &.vue:hover {
    filter: drop-shadow(0 0 2em #42b883aa);
  }
}
</style>
