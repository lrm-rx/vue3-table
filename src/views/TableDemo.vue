<script setup lang="jsx">
/**
 * 表格组件演示页：TablePro 远程模式 + 本地过滤排序 + 可编辑单元格 + 配置式 render。
 * 原内联于 App.vue，路由化后独立为视图。
 */
import { ref } from "vue";
import { ElMessage, ElTag, ElButton } from "element-plus";
import { getUserListApi, getFilterOptionsApi } from "@/api";

// ========== 编辑控件预置选项（单独传递，不放在 columns 配置中）==========
const editOptions = ref({
  department: [
    { label: "研发部", value: "dev" },
    { label: "产品部", value: "product" },
    { label: "设计部", value: "design" },
    { label: "运营部", value: "ops" },
    { label: "人事部", value: "hr" },
  ],
  role: [
    { label: "管理员", value: "admin" },
    { label: "编辑", value: "editor" },
    { label: "访客", value: "viewer" },
    { label: "开发者", value: "developer" },
  ],
  status: [
    { label: "启用", value: 1 },
    { label: "禁用", value: 0 },
  ],
});

const cellEditProps = ref({
  username: { placeholder: "请输入姓名", clearable: true },
  email: { placeholder: "请输入邮箱", clearable: true },
  phone: { placeholder: "请输入手机号", clearable: true },
  department: { placeholder: "请选择部门", clearable: true },
  age: { min: 0, max: 120, controls: true, controlsPosition: "right" },
});

const roleTextMap = {
  admin: { label: "管理员", type: "danger" },
  editor: { label: "编辑", type: "warning" },
  viewer: { label: "访客", type: "info" },
  developer: { label: "开发者", type: "success" },
};
const statusTextMap = {
  1: { label: "启用", type: "success" },
  0: { label: "禁用", type: "info" },
};

const columns = ref([
  { type: "checkbox", width: 50 },
  { type: "seq", width: 60, title: "序号" },
  { type: "radio", width: 60 },
  {
    field: "username",
    title: "姓名",
    sortable: true,
    filterType: "FilterInput",
    editRender: { name: "ElInput" },
  },
  {
    field: "account",
    title: "账号",
    sortable: true,
    filterType: "FilterInput",
    editRender: { name: "ElInput" },
    render: "cell_account",
  },
  {
    field: "email",
    title: "邮箱",
    filterType: "FilterInput",
    sortable: true,
    editRender: "edit_email",
    render: (params, h) => {
      const val = params.cellValue;
      if (!val) return <span style="color:#c0c4cc">—</span>;
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            color: "#409eff",
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 1024 1024"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M832 128H192c-53 0-96 43-96 96v576c0 53 43 96 96 96h640c53 0 96-43 96-96V224c0-53-43-96-96-96zm0 128L512 512 192 256V224c0-17.7 14.3-32 32-32h576c17.7 0 32 14.3 32 32v32z" />
          </svg>
          {val}
        </span>
      );
    },
  },
  {
    field: "phone",
    title: "手机号",
    sortable: true,
    filterType: "FilterInput",
    headerRender: "header_phone",
    editRender: (params, h) => {
      const { row, field } = params;
      return (
        <ElInput
          modelValue={row[field]}
          onUpdate:modelValue={(v) => {
            row[field] = v;
          }}
          placeholder="请输入手机号"
          clearable
        />
      );
    },
    render: "cell_phone",
  },
  {
    field: "role",
    title: "角色",
    sortable: true,
    params: { defParamKey: "roleList" },
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
    editRender: { name: "ElRadio" },
    render: (params, h) => {
      const info = roleTextMap[params.cellValue] || {
        label: params.cellValue || "—",
        type: "",
      };
      return (
        <ElTag type={info.type || "info"} size="small" effect="light">
          {info.label}
        </ElTag>
      );
    },
  },
  {
    field: "department",
    title: "部门",
    sortable: true,
    params: { hideColumn: false, defParamKey: "departmentList" },
    filterRender: {
      name: "FilterCheckbox",
      props: { options: [] },
    },
    editRender: { name: "ElSelect" },
  },
  {
    field: "status",
    title: "状态",
    width: 110,
    sortable: true,
    filterType: "FilterCheckbox",
    filterRender: { name: "FilterCheckbox" },
    editRender: {
      name: "ElSwitch",
      props: {
        activeValue: 1,
        inactiveValue: 0,
        inlinePrompt: true,
        activeText: "启",
        inactiveText: "禁",
      },
    },
    render: (params, h) => {
      const info = statusTextMap[params.cellValue] || {
        label: String(params.cellValue),
        type: "info",
      };
      return (
        <ElTag type={info.type} size="small" effect="dark">
          {info.label}
        </ElTag>
      );
    },
  },
  {
    field: "action",
    title: "操作",
    width: 180,
    fixed: "right",
    render: (params, h) => {
      const row = params.row;
      return (
        <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          <ElButton
            type="primary"
            link
            size="small"
            onClick={() =>
              ElMessage.success(`编辑：${row.username || row.account}`)
            }
          >
            编辑
          </ElButton>
          <ElButton
            type="danger"
            link
            size="small"
            onClick={() =>
              ElMessage.warning(`删除：${row.username || row.account}`)
            }
          >
            删除
          </ElButton>
        </div>
      );
    },
  },
  {
    field: "age",
    title: "年龄",
    width: 120,
    sortable: true,
    filterType: "FilterNumberRange",
    filterRender: { name: "FilterNumberRange", suffix: "岁" },
    editRender: { name: "ElInputNumber" },
  },
  {
    field: "remark",
    title: "备注",
    minWidth: 200,
    editRender: { name: "TextareaPopoverEdit" },
    params: { hideColumn: false },
  },
  {
    field: "createTime",
    title: "创建时间创建时间创建时间创建时间创建时间创建时间",
    sortable: true,
    filterType: "FilterDateRange",
    editRender: {
      name: "ElDatePicker",
      props: {
        type: "date",
        valueFormat: "YYYY-MM-DD HH:mm:ss",
        placeholder: "选择日期",
      },
    },
  },
]);

const editRules = ref({
  remark: [{ required: true, message: "请输入备注", trigger: "change" }],
  username: [{ required: true, message: "请输入姓名", trigger: "change" }],
  account: [{ required: true, message: "请输入账号", trigger: "change" }],
  email: [{ required: true, message: "请输入邮箱", trigger: "change" }],
  phone: [{ required: true, message: "请输入手机号", trigger: "change" }],
  age: [{ required: true, message: "请输入年龄", trigger: "change" }],
  department: [{ required: true, message: "请选择部门", trigger: "change" }],
  role: [{ required: true, message: "请选择角色", trigger: "change" }],
  createTime: [{ required: true, message: "请选择创建时间", trigger: "change" }],
});

const currentApi = ref(getUserListApi);

const useRemoteFilter = ref(true);
const requestFilterAPI = ref(
  useRemoteFilter.value ? (params) => getFilterOptionsApi(params) : null,
);

const initParam = ref({
  pageNum: 1,
  pageSize: 20,
  sortField: "createTime",
  sortOrder: "desc",
  filters: { role: ["admin", "developer"] },
});

const pageSizes = [10, 20, 50, 100, 200, 500, 1000];

const onDataCallback = (data) => {
  if (!data || !Array.isArray(data.list)) return data;
  data.list = data.list.map((item) => ({
    ...item,
    roleText:
      { admin: "管理员", editor: "编辑", viewer: "访客", developer: "开发者" }[
        item.role
      ] || item.role,
    age: item.age != null ? item.age : 18 + ((Math.random() * 40) | 0),
  }));
  return data;
};

const onFilterDataCallback = (data) => {
  if (!Array.isArray(data)) return data;
  return data.filter((item) => item.code !== "tester");
};

const onRequestError = (error) => {
  console.error("[TablePro requestError]", error);
  ElMessage.error(`表格请求失败：${error?.message || error}`);
};

// ========== 静态表演示：本地过滤 + 排序 ==========
const staticRoles = ["admin", "editor", "viewer", "developer"];
const localFilterSortEnabled = ref(true);
const staticFilterApiCalls = ref(0);
const staticRequestFilterApi = (params) => {
  staticFilterApiCalls.value += 1;
  console.warn("[staticRequestFilterApi] 被调用", params);
  ElMessage.warning("静态表 requestFilterAPI 被调用（当前为后端参与模式）");
  return Promise.resolve([
    { label: "管理员", value: "admin" },
    { label: "编辑", value: "editor" },
    { label: "访客", value: "viewer" },
    { label: "开发者", value: "developer" },
    { label: "测试员（仅接口返回）", value: "tester" },
  ]);
};
const onToggleLocalFilterSort = (v) => {
  staticFilterApiCalls.value = 0;
  ElMessage.info(
    `本地过滤+排序已${v ? "开启（后端不参与，不调 requestFilterAPI）" : "关闭（后端参与）"}`,
  );
};
const genStaticData = () => {
  const surnames = ["张", "李", "王", "赵", "陈", "刘", "杨", "黄", "周", "吴"];
  const departments = ["技术部", "产品部", "市场部"];
  const list = [];
  for (let i = 1; i <= 32; i++) {
    list.push({
      id: i,
      username: `${surnames[i % surnames.length]}${i}号`,
      account: `user_${String(i).padStart(3, "0")}`,
      role: staticRoles[i % staticRoles.length],
      department: i > 20 ? "海外事业部" : departments[i % departments.length],
      age: i % 9 === 0 ? null : 20 + ((i * 7) % 30),
      createTime: `2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    });
  }
  return list;
};
const staticData = ref(genStaticData());

const staticColumns = ref([
  { type: "seq", width: 60, title: "序号" },
  { field: "username", title: "姓名", sortable: true, filterType: "FilterInput" },
  {
    field: "role",
    title: "角色",
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
    render: (params, h) => {
      const info = roleTextMap[params.cellValue] || {
        label: params.cellValue || "—",
        type: "",
      };
      return (
        <ElTag type={info.type || "info"} size="small" effect="light">
          {info.label}
        </ElTag>
      );
    },
  },
  {
    field: "department",
    title: "部门",
    sortable: true,
    filterType: "FilterCheckbox",
  },
  {
    field: "age",
    title: "年龄",
    width: 120,
    sortable: true,
    filterType: "FilterNumberRange",
    filterRender: { name: "FilterNumberRange", suffix: "岁" },
  },
  {
    field: "createTime",
    title: "创建时间",
    sortable: true,
    filterType: "FilterDateRange",
  },
]);

const staticSortConfig = { remote: true, multiple: true, trigger: "button" };
const staticInitParam = { sortField: "createTime", sortOrder: "desc" };

const onStaticFilterConfirm = (payload) => {
  const active = (payload?.filters || []).filter((f) => f.active).length;
  const sorts = (payload?.sorts || []).filter((s) => s.order).length;
  ElMessage.success(`本地过滤确认：生效过滤 ${active} 条，排序 ${sorts} 个字段`);
};

const handleBeforePageChange = async ({ currentPage, pageSize }) => {
  try {
    await ElMessageBox.confirm(
      `确认切换到第 ${currentPage} 页，每页 ${pageSize} 条吗？`,
      "确认切换",
      { confirmButtonText: "确认", cancelButtonText: "取消", type: "warning" },
    );
    return true;
  } catch {
    return false;
  }
};

const tableProRef = ref();
const paginationEnabled = ref(true);
const editableEnabled = ref(true);
const cellChanged = ref(false);

const onCellEditChange = (params) => {
  const { row, column, field, value, cellValue } = params || {};
  ElMessage.success(
    `单元格编辑完成：${column?.title || field} = ${JSON.stringify(value)}（原值=${JSON.stringify(cellValue)}，行：${row?.username || row?.account}）`,
  );
};
const onTextareaClear = () => ElMessage.info("已清空备注");
const onTextareaCancel = (params) => {
  const { row, field, value } = params || {};
  ElMessage.info(`已取消编辑：${field}（行：${row?.username || row?.account}），未保存值=${JSON.stringify(value)}`);
};
const onTextareaConfirm = (params) => {
  const { row, field, value } = params || {};
  ElMessage.success(`已确认编辑：${field} = ${JSON.stringify(value)}（行：${row?.username || row?.account}）`);
};
const onRefresh = (payload) => {
  const activeFilters = (payload?.filters || []).filter((f) => f.active).length;
  const activeSorts = (payload?.sorts || []).filter((s) => s.order).length;
  ElMessage.success(`工具栏刷新：过滤条件 ${activeFilters} 条，排序条件 ${activeSorts} 条`);
};
const onResetFilter = (payload) => {
  const remaining = (payload?.filters || []).filter((f) => f.active).length;
  ElMessage.info(`工具栏重置过滤：剩余过滤 ${remaining} 条`);
};
const onCheckboxChange = () => {
  const rows = tableProRef.value?.getCheckboxRecords?.() || [];
  if (rows.length) ElMessage.info(`已选中 ${rows.length} 条`);
};

const doValidate = async () => {
  if (!tableProRef.value?.fullValidate) {
    ElMessage.warning("tablePro 未暴露 fullValidate 方法");
    return false;
  }
  try {
    const errMap = await tableProRef.value.fullValidate();
    if (errMap) {
      const errCount = Object.keys(errMap).length;
      const firstField = Object.keys(errMap)[0];
      const firstErr = errMap[firstField]?.[0];
      if (firstErr?.row) tableProRef.value?.scrollToRow?.(firstErr.row);
      ElMessage.error(`校验未通过：${errCount} 个字段存在错误`);
      return false;
    }
    ElMessage.success(`校验通过，提交 ${tableProRef.value?.getData?.()?.length || 0} 条数据`);
    return true;
  } catch (err) {
    ElMessage.error(`校验异常：${err?.message || err}`);
    return false;
  }
};
const onSubmit = () => doValidate();
const onSaveChanges = async () => {
  const ok = await doValidate();
  if (!ok) return;
  await tableProRef.value?.markSaved?.();
  ElMessage.success("保存成功");
};
const onCancelChanges = async () => {
  const ok = await tableProRef.value?.revertChanges?.();
  ElMessage[ok ? "success" : "info"](ok ? "已还原为变更前数据" : "当前没有可还原的变更");
};
const onInsertRow = () => tableProRef.value?.insertRow?.({});
const onRemoveSelected = () => {
  const rows = tableProRef.value?.getCheckboxRecords?.() || [];
  if (!rows.length) {
    ElMessage.warning("请先勾选要删除的行");
    return;
  }
  tableProRef.value?.removeRows?.(rows);
};
</script>

<template>
  <div style="padding: 0 20px 20px">
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
      :pager-config="{ pageSizes }"
      :editable="editableEnabled"
      v-model:cellChanged="cellChanged"
      :init-param="initParam"
      :sort-config="{ remote: true, multiple: false, trigger: 'button' }"
      :edit-options="editOptions"
      :cell-edit-props="cellEditProps"
      :edit-rules="editRules"
      :valid-config="{ autoPos: false }"
      :before-page-change="handleBeforePageChange"
      :toolbar-config="{ wrapToggle: true }"
      height="auto"
      style="height: 560px"
      @checkbox-change="onCheckboxChange"
      @checkbox-all="onCheckboxChange"
      @refresh="onRefresh"
      @reset-filter="onResetFilter"
      @cell-edit-change="onCellEditChange"
      @textarea-clear="onTextareaClear"
      @textarea-cancel="onTextareaCancel"
      @textarea-confirm="onTextareaConfirm"
    >
      <template #toolbarButtons>
        <el-button type="primary" @click="onInsertRow">新增行</el-button>
        <el-button type="danger" @click="onRemoveSelected">删除选中</el-button>
        <el-button type="primary">按钮1</el-button>
        <el-button type="primary">按钮2</el-button>
        <el-button v-if="cellChanged" @click="onCancelChanges">取消</el-button>
        <el-button v-if="cellChanged" type="success" @click="onSaveChanges">
          保存
        </el-button>
        <el-button type="success" @click="onSubmit">提交校验</el-button>
      </template>

      <template #cell_phone="{ row }">
        <el-tag type="primary" size="small" effect="plain">
          📞 {{ row.phone }}
        </el-tag>
      </template>
      <template #cell_account="{ row }">
        <el-button link type="primary" :underline="false">
          <b>@{{ row.account || "" }}</b>
        </el-button>
      </template>

      <template #edit_email="{ row }">
        <el-input
          :model-value="row.email"
          @update:model-value="(v) => (row.email = v)"
          type="email"
          placeholder="请输入邮箱"
          clearable
        />
      </template>

      <template #header_phone="{ column }">
        <span style="color: var(--el-color-primary)">📱 {{ column.title }}</span>
      </template>
      <template #operation="{ row }">
        <div style="display: flex; gap: 8px; justify-content: center">
          <el-button
            type="primary"
            link
            size="small"
            @click="ElMessage.success(`编辑：${row.username || row.account}`)"
          >
            编辑
          </el-button>
          <el-button
            type="danger"
            link
            size="small"
            @click="ElMessage.warning(`删除：${row.username || row.account}`)"
          >
            删除
          </el-button>
        </div>
      </template>
    </TablePro>

    <el-divider content-position="left">
      本地过滤 + 排序：由 localFilterSort 布尔属性控制（true=本地处理 / false=后端参与，与是否传 requestApi 无关）
    </el-divider>
    <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px">
      <el-switch
        v-model="localFilterSortEnabled"
        @change="onToggleLocalFilterSort"
      />
      <span style="font-size: 13px; color: #606266">
        localFilterSort = <b>{{ localFilterSortEnabled }}</b>
        （{{ localFilterSortEnabled ? "本地处理，后端不参与" : "后端参与" }}）
      </span>
      <el-tag size="small" type="warning">
        requestFilterAPI 被调用次数：{{ staticFilterApiCalls }}
      </el-tag>
    </div>
    <TablePro
      :columns="staticColumns"
      :data="staticData"
      :local-filter-sort="localFilterSortEnabled"
      :requestFilterAPI="staticRequestFilterApi"
      :toolbar-config="{ wrapToggle: true }"
      :pagination="true"
      :pager-config="{ pageSizes: [10, 20, 50] }"
      :sort-config="staticSortConfig"
      :init-param="staticInitParam"
      :before-page-change="handleBeforePageChange"
      height="auto"
      style="height: 480px"
      @filter-confirm="onStaticFilterConfirm"
    />
  </div>
</template>
