<script setup lang="jsx">
import { ref } from "vue";
import { ElMessage, ElTag, ElButton } from "element-plus";
import { getUserListApi, getFilterOptionsApi } from "@/api";

// ========== 编辑控件预置选项（单独传递，不放在 columns 配置中）==========
// 按列 field 索引，用于 ElSelect / ElRadio / ElCheckbox 等需要 options 的编辑组件
const editOptions = ref({
  // 部门编辑（ElSelect 下拉）
  department: [
    { label: "研发部", value: "dev" },
    { label: "产品部", value: "product" },
    { label: "设计部", value: "design" },
    { label: "运营部", value: "ops" },
    { label: "人事部", value: "hr" },
  ],
  // 角色编辑（ElRadio 单选）
  role: [
    { label: "管理员", value: "admin" },
    { label: "编辑", value: "editor" },
    { label: "访客", value: "viewer" },
    { label: "开发者", value: "developer" },
  ],
  // 状态编辑（ElSwitch / ElRadio 通用）
  status: [
    { label: "启用", value: 1 },
    { label: "禁用", value: 0 },
  ],
});

// ========== 各列编辑控件的额外公共 props（单独传递，不放在 columns 中）==========
const cellEditProps = ref({
  username: { placeholder: "请输入姓名", clearable: true },
  email: { placeholder: "请输入邮箱", clearable: true },
  phone: { placeholder: "请输入手机号", clearable: true },
  department: { placeholder: "请选择部门", clearable: true },
  age: { min: 0, max: 120, controls: true, controlsPosition: "right" },
});

// 注：列公共配置（showOverflow / minWidth / filterDefaults 等）已内置到 tablePro 组件
// 默认值，业务侧无需再写 defaultColumnConfig；如需覆盖可传入 :default-column-config

// ========== 角色/状态 label 映射（render 显示 + formatter 共用）==========
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

// ========== 列配置（演示 JSX 只读渲染 + 可编辑单元格 + 配置简化）==========
const columns = ref([
  { type: "checkbox", width: 50 },
  { type: "seq", width: 60, title: "序号" },
  { type: "radio", width: 60 },
  // 演示 1：filterType: 'FilterInput' → 自动注入完整过滤配置
  //         不再需要手动写 filters:[{data:{value:''}}] / filterRender:{name:'FilterInput'}
  // 演示 2：editRender 单元格可编辑（ElInput）
  {
    field: "username",
    title: "姓名",
    sortable: true,
    filterType: "FilterInput",
    editRender: { name: "ElInput" },
  },

  // 演示：filterType 简化 + editRender
  //       render: 'cell_account' 字符串引用外部具名插槽（#cell_account）
  {
    field: "account",
    title: "账号",
    sortable: true,
    filterType: "FilterInput",
    editRender: { name: "ElInput" },
    render: "cell_account",
  },

  // 演示 3：render（JSX 只读渲染）—— 自定义邮箱样式并加图标
  {
    field: "email",
    title: "邮箱",
    filterType: "FilterInput",
    sortable: true,
    // 字符串式 editRender：引用 #edit_email 外部具名插槽
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

  // 演示：render: 'cell_phone' 字符串插槽引用（插槽式渲染）
  //       editRender 函数式 JSX 自定义编辑控件（直接 v-model 绑 row[field]，编辑即生效）
  {
    field: "phone",
    title: "手机号",
    sortable: true,
    filterType: "FilterInput",
    // headerRender: (params, h) => {
    //   return <span>手机号aaa</span>;
    // },
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

  // 演示 4：render (JSX 只读) → 使用 Element Plus ElTag 渲染角色
  //         editRender: ElRadio（使用 editOptions.role 预置选项）
  //         filterType: FilterCheckbox + defParamKey 自定义参数 key
  {
    field: "role",
    title: "角色",
    sortable: true,
    params: {
      defParamKey: "roleList",
    },
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

  // 演示 5：editRender ElSelect（使用 editOptions.department 预置选项数组）
  //        filterRender.name 已指定 'FilterCheckbox'，可省略 filterType（组件按 name 自动注入 filters）
  {
    field: "department",
    title: "部门",
    sortable: true,
    params: {
      hideColumn: false,
      defParamKey: "departmentList",
    },
    filterRender: {
      name: "FilterCheckbox",
      props: { options: [] }, // 远程模式：选项由 requestFilterAPI 提供
    },
    editRender: { name: "ElSelect" },
  },

  // 演示 6：editRender ElSwitch（使用 cellEditProps.status 的额外 props）
  //         render JSX 渲染状态标签
  {
    field: "status",
    title: "状态",
    width: 110,
    sortable: true,
    filterType: "FilterCheckbox",
    filterRender: {
      name: "FilterCheckbox",
      // props: {
      //   options: [
      //     { label: "启用", value: 1 },
      //     { label: "禁用", value: 0 },
      //   ],
      // },
    },
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
  // 演示 9：操作列专用插槽 —— 列里写 render: 'operation' 引用 #operation 具名插槽
  //         （tablePro 会自动把 #operation 透传给 vxe-grid 对应列的 default 插槽）
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
    // render: "operation",
  },

  // 演示 7：editRender ElInputNumber 年龄编辑
  // filterRender.props.paramMode 控制参数呈现方式（可选 'array' / 'split' / 'both'，默认 'array'）：
  //   'array' → age: [min, max]（与 FilterCheckbox 风格一致，单个数组）
  //   'split' → ageMin: min, ageMax: max（原始分开传递）
  //   'both'  → 以上两种都传递
  {
    field: "age",
    title: "年龄",
    width: 120,
    sortable: true,
    filterType: "FilterNumberRange",
    filterRender: { name: "FilterNumberRange", suffix: "岁" },
    editRender: { name: "ElInputNumber" },
  },

  // 演示：自定义 TextareaPopoverEdit 组件 —— 点击单元格以 popover 弹出文本域
  //   · popover 自动避让边界（右放不下显示在左、下放不下显示在上）
  //   · 文本域支持自由拖拽宽高（resize: both）
  //   · 右上角「取消 / 确定」按钮控制是否写回
  {
    field: "remark",
    title: "备注",
    minWidth: 200,
    editRender: { name: "TextareaPopoverEdit" },
    params: {
      hideColumn: false,
    },
  },
  // 演示 8：editRender ElDatePicker 编辑入职日期
  //         + filterType FilterDateRange 简化配置
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

// ========== 单元格编辑校验规则（透传 vxe-grid editRules）==========
// 提交时调用 tableProRef.fullValidate() 触发全表校验
const editRules = ref({
  // 当前列：备注（必填）
  remark: [{ required: true, message: "请输入备注", trigger: "change" }],
  // 其他输入类单元格（必填）
  username: [{ required: true, message: "请输入姓名", trigger: "change" }],
  account: [{ required: true, message: "请输入账号", trigger: "change" }],
  email: [{ required: true, message: "请输入邮箱", trigger: "change" }],
  phone: [{ required: true, message: "请输入手机号", trigger: "change" }],
  age: [{ required: true, message: "请输入年龄", trigger: "change" }],
  // 其他选择类单元格（必填）
  department: [{ required: true, message: "请选择部门", trigger: "change" }],
  role: [{ required: true, message: "请选择角色", trigger: "change" }],
  createTime: [{ required: true, message: "请选择创建时间", trigger: "change" }],
});

// ========== 远程模式：requestApi ==========
const currentApi = ref(getUserListApi);

// ========== 过滤选项远程接口（requestFilterAPI）==========
const useRemoteFilter = ref(true);
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
const initParam = ref({
  pageNum: 1,
  pageSize: 20,
  sortField: "createTime",
  sortOrder: "desc",
  filters: {
    role: ["admin", "developer"],
  },
});

// 分页大小选项（10 万条数据演示，包含更大档位）
const pageSizes = [10, 20, 50, 100, 200, 500, 1000];

// 数据回调：对返回的数据进行二次处理
const onDataCallback = (data) => {
  if (!data || !Array.isArray(data.list)) return data;
  data.list = data.list.map((item) => ({
    ...item,
    roleText:
      { admin: "管理员", editor: "编辑", viewer: "访客", developer: "开发者" }[
        item.role
      ] || item.role,
    // 给 age 填个默认值，方便编辑演示（mock 没返回 age 时也能看到效果）
    age: item.age != null ? item.age : 18 + ((Math.random() * 40) | 0),
  }));
  return data;
};

// 过滤选项数据回调
const onFilterDataCallback = (data) => {
  if (!Array.isArray(data)) return data;
  const filtered = data.filter((item) => item.code !== "tester");
  return filtered;
};

// 请求错误监听
const onRequestError = (error) => {
  console.error("[TablePro requestError]", error);
  ElMessage.error(`表格请求失败：${error?.message || error}`);
};

// ========== 静态表演示：本地过滤 + 排序由 localFilterSort 布尔开关显式控制 ==========
// 注意：不再由「是否传 requestApi」隐式决定，localFilterSort=true 时后端不参与
// 数据纯前端生成；即使本表传入了 requestFilterAPI（探针），开关开启时也绝不调用
const staticRoles = ["admin", "editor", "viewer", "developer"];
// 本地过滤+排序开关（true=本地处理，false=后端参与）
const localFilterSortEnabled = ref(true);
// requestFilterAPI 调用探针：开关开启时计数必须恒为 0；关闭后打开角色过滤面板才会被调用
const staticFilterApiCalls = ref(0);
const staticRequestFilterApi = (params) => {
  staticFilterApiCalls.value += 1;
  console.warn("[staticRequestFilterApi] 被调用（仅 localFilterSort=false 时应出现）", params);
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
  const list = [];
  for (let i = 1; i <= 32; i++) {
    list.push({
      id: i,
      username: `${surnames[i % surnames.length]}${i}号`,
      account: `user_${String(i).padStart(3, "0")}`,
      role: staticRoles[i % staticRoles.length],
      // i 为 9/18/27 时年龄为空，验证排序空值恒最后 + 区间过滤不含空值行
      age: i % 9 === 0 ? null : 20 + ((i * 7) % 30),
      createTime: `2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    });
  }
  return list;
};
const staticData = ref(genStaticData());

// 静态表列配置：覆盖 4 种 filterType + 可排序列
const staticColumns = ref([
  { type: "seq", width: 60, title: "序号" },
  { field: "username", title: "姓名", sortable: true, filterType: "FilterInput" },
  {
    field: "role",
    title: "角色",
    sortable: true,
    filterType: "FilterCheckbox",
    // 本地过滤排序开关开启时直接使用本地 options（即使表上传了 requestFilterAPI 也不会调用）
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

// 多字段排序演示：multiple=true，依次点击多列表头排序图标即按点击优先级组合排序
const staticSortConfig = { remote: true, multiple: true, trigger: "button" };
// 默认按创建时间倒序：验证静态模式下 initParam 默认排序在本地生效
const staticInitParam = { sortField: "createTime", sortOrder: "desc" };

const onStaticFilterConfirm = (payload) => {
  const active = (payload?.filters || []).filter((f) => f.active).length;
  const sorts = (payload?.sorts || []).filter((s) => s.order).length;
  ElMessage.success(`本地过滤确认：生效过滤 ${active} 条，排序 ${sorts} 个字段`);
};

// ========== beforePageChange 演示：分页切换前置拦截 ==========
// 返回 false / Promise reject（含 resolve 为 false）→ 阻止本次切换并回滚 UI
const handleBeforePageChange = async ({ type, currentPage, pageSize }) => {
  try {
    await ElMessageBox.confirm(
      `确认切换到第 ${currentPage} 页，每页 ${pageSize} 条吗？`,
      "确认切换",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    return true
  } catch {
    return false
  }
};

// ========== 测试按钮 / 事件回调 ==========
const tableProRef = ref();
const paginationEnabled = ref(true);
const editableEnabled = ref(true);

// 单元格编辑完成事件
const onCellEditChange = (params) => {
  const { row, column, field, value, cellValue } = params || {};
  ElMessage.success(
    `单元格编辑完成：${column?.title || field} = ${JSON.stringify(value)}（原值=${JSON.stringify(cellValue)}，行：${row?.username || row?.account}）`,
  );
  console.log("[cell-edit-change]", params);
};

// TextareaPopoverEdit 三按钮事件演示
const onTextareaClear = (params) => {
  ElMessage.info("已清空备注");
  console.log("[textarea-clear]", params);
};
const onTextareaCancel = (params) => {
  const { row, field, value } = params || {};
  ElMessage.info(`已取消编辑：${field}（行：${row?.username || row?.account}），未保存值=${JSON.stringify(value)}`);
  console.log("[textarea-cancel]", params);
};
const onTextareaConfirm = (params) => {
  const { row, field, value } = params || {};
  ElMessage.success(`已确认编辑：${field} = ${JSON.stringify(value)}（行：${row?.username || row?.account}）`);
  console.log("[textarea-confirm]", params);
};

const onRefresh = (payload) => {
  const activeFilters = (payload?.filters || []).filter((f) => f.active).length;
  const activeSorts = (payload?.sorts || []).filter((s) => s.order).length;
  ElMessage.success(
    `工具栏刷新：过滤条件 ${activeFilters} 条，排序条件 ${activeSorts} 条`,
  );
};

const onResetFilter = (payload) => {
  const remainingFilters = (payload?.filters || []).filter(
    (f) => f.active,
  ).length;
  ElMessage.info(`工具栏重置过滤：剩余过滤 ${remainingFilters} 条`);
};

const onCheckboxChange = () => {
  const rows = tableProRef.value?.getCheckboxRecords?.() || [];
  if (rows.length) ElMessage.info(`已选中 ${rows.length} 条`);
};

// ========== 提交校验（触发 vxe-grid fullValidate 全表校验）==========
const onSubmit = async () => {
  if (!tableProRef.value?.fullValidate) {
    ElMessage.warning("tablePro 未暴露 fullValidate 方法");
    return;
  }
  try {
    // fullValidate 返回错误映射：null 表示校验通过
    // validConfig.autoPos=false → 校验不自动激活编辑态（避免 TextareaPopoverEdit 等弹层遮住错误语）
    const errMap = await tableProRef.value.fullValidate();
    if (errMap) {
      const errCount = Object.keys(errMap).length;
      // 滚动到首个错误行（autoPos=false 不再自动滚动，需手动定位）
      const firstField = Object.keys(errMap)[0];
      const firstErr = errMap[firstField]?.[0];
      if (firstErr?.row) tableProRef.value?.scrollToRow?.(firstErr.row);
      ElMessage.error(`校验未通过：${errCount} 个字段存在错误`);
      console.log("[fullValidate errorMap]", errMap);
    } else {
      const data = tableProRef.value?.getData?.() || [];
      ElMessage.success(`校验通过，提交 ${data.length} 条数据`);
      console.log("[submit data]", data);
    }
  } catch (err) {
    ElMessage.error(`校验异常：${err?.message || err}`);
    console.error("[fullValidate error]", err);
  }
};
</script>

<template>
  <div
    style="padding: 20px; height: 100vh; box-sizing: border-box; overflow: auto"
  >
    <!-- <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap">
      <el-tag type="success">
        演示：<b>filterType</b> 简化过滤配置 + 组件内置公共列配置
      </el-tag>
      <el-tag type="warning">
        演示：<b>render</b> JSX 只读渲染（邮箱图标、角色/状态
        ElTag、操作列按钮）
      </el-tag>
      <el-tag type="danger">
        演示：<b>editRender</b> 可编辑单元格（单击进入编辑，编辑完触发
        cell-edit-change）
      </el-tag>
      <el-tag type="info">
        演示：<b>editOptions</b> /
        <b>cellEditProps</b> 单独传递编辑选项数组与公共 props
      </el-tag>
      <span style="display: inline-flex; align-items: center; gap: 6px; margin-left: 8px">
        <el-switch v-model="editableEnabled" size="small" />
        <span style="font-size: 12px; color: #606266">
          editable={{ editableEnabled ? "true（可编辑）" : "false（只读）" }}
        </span>
      </span>
    </div>
    <div
      style="
        margin-bottom: 10px;
        color: #606266;
        font-size: 13px;
        line-height: 1.8;
      "
    >
      功能验证要点：<br />
      · <b>配置简化</b>：姓名/账号/手机号/邮箱列仅写
      <code>filterType: 'FilterInput'</code>， 不再手动写
      <code
        >filters: [{ data: { value: '' } }] filterRender: { name: 'FilterInput'
        }</code
      >
      （由组件内置 DEFAULT_FILTER_CONFIG 自动注入）<br />
      · <b>公共列配置</b>：所有数据列默认左对齐、120
      最小宽度、溢出省略（由组件内置默认值生效）<br />
      · <b>render (JSX 只读)</b>：邮箱列显示图标、角色列/状态列渲染
      ElTag、操作列渲染 ElButton （配置式写 render 函数即可，无需在 template
      定义具名插槽）<br />
      · <b>editRender (可编辑)</b>：单击单元格进入编辑模式（双击也可），
      姓名/账号/邮箱/手机号 → ElInput，年龄 → ElInputNumber，部门 → ElSelect，
      角色 → ElRadio，状态 → ElSwitch，创建时间 → ElDatePicker<br />
      · <b>editOptions 单独传递</b>：部门/角色/状态列的编辑选项数组未放在
      columns 里， 而是通过 tablePro 的 :edit-options 单独注入，保持 columns
      纯净无数据噪音<br />
      ·
      <b>cell-edit-change 事件</b
      >：任意单元格编辑完成后弹出消息提示并在控制台打印完整参数
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
      :pager-config="{ pageSizes }"
      :editable="editableEnabled"
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
        <el-button type="primary">按钮1</el-button>
        <el-button type="primary">按钮2</el-button>
        <el-button type="success" @click="onSubmit">提交校验</el-button>
      </template>

      <!-- 插槽式渲染演示：外部具名插槽 #cell_xxx（对应 columns[i].field）-->
      <!-- 也支持在 columns 里写 render: "cell_phone"（字符串引用外部插槽名）-->
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

      <!-- 字符串式 editRender 演示：editRender: 'edit_email' 引用此插槽 -->
      <template #edit_email="{ row }">
        <el-input
          :model-value="row.email"
          @update:model-value="(v) => (row.email = v)"
          type="email"
          placeholder="请输入邮箱"
          clearable
        />
      </template>

      <!-- 表头插槽式渲染演示：#header_xxx（对应 columns[i].field）-->
      <!-- 也支持在 columns 里写 headerRender: "header_phone"（字符串引用外部插槽名）-->
      <template #header_phone="{ column }">
        <span style="color: var(--el-color-primary)">
          📱 {{ column.title }}
        </span>
      </template>
      <!-- 操作列专用插槽：列配置 render: 'operation' 引用此插槽 -->
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

    <!-- ========== 本地过滤 + 排序演示（localFilterSort 布尔开关显式控制）========== -->
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
      <span style="font-size: 12px; color: #909399">
        开关开启时，即使本表传了 requestFilterAPI，打开角色过滤面板也不会调用（次数恒为 0，选项为列配置静态项）
      </span>
    </div>
    <div
      style="margin-bottom: 8px; color: #606266; font-size: 13px; line-height: 1.8"
    >
      验证要点：姓名（FilterInput 包含匹配）· 角色（FilterCheckbox
      命中任一选中值）· 年龄（FilterNumberRange 数值区间）· 创建时间（FilterDateRange
      日期区间，纯日期端点按整天）；<b>多字段排序</b>：sortConfig.multiple=true
      依次点击多列排序图标按点击优先级组合；年龄空值恒排最后；过滤后分页 total
      同步变化；默认 initParam 按 createTime 倒序；<b>关闭开关</b>后过滤/排序不再本地生效（仅抛
      filter-confirm 事件），打开角色过滤面板会走 requestFilterAPI（计数+1，多出「测试员」选项）；<b>beforePageChange
      拦截演示</b>：切到每页 50 条（同步 false 回滚）与跳转第 4
      页（Promise reject）会被阻止，其余分页操作正常放行
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
