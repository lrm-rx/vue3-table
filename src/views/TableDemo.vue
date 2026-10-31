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
const departmentTextMap = {
  dev: "研发部",
  product: "产品部",
  design: "设计部",
  ops: "运营部",
  hr: "人事部",
};
// 部门插槽编辑列（editRender: 'edit_dept2'）的下拉选项，与 mock 数据 department 取值一致
const deptSlotOptions = ["技术部", "产品部", "设计部", "运营部", "市场部"];
// 所在地区列（ElCascader）的级联选项
const cascaderEditOptions = [
  {
    value: "zhejiang",
    label: "浙江省",
    children: [
      { value: "hangzhou", label: "杭州市" },
      { value: "ningbo", label: "宁波市" },
    ],
  },
  {
    value: "jiangsu",
    label: "江苏省",
    children: [
      { value: "nanjing", label: "南京市" },
      { value: "suzhou", label: "苏州市" },
    ],
  },
];

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
   // render: "cell_department",
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
    width: "auto",
    fixed: "right",
    // 操作列标记：排除插槽/JSX 内容超宽省略，按钮完整显示
    params: { isAction: true },
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
  // ===== 弹出类编辑控件验证列（二次封装/插槽式接入）=====
  {
    field: "dept2",
    title: "部门插槽编辑",
    width: 150,
    sortable: true,
    // 字符串式 editRender → slots.edit 引用下方 #edit_dept2 具名插槽（内含 el-select）
    editRender: "edit_dept2",
  },
  {
    field: "workTime",
    title: "上班时间",
    width: 150,
    sortable: true,
    editRender: { name: "ElTimePicker" },
  },
  {
    field: "regionPath",
    title: "所在地区",
    width: 170,
    // ElCascader 级联面板（弹出面板类编辑控件验证）
    editRender: {
      name: "ElCascader",
      props: { options: cascaderEditOptions, placeholder: "请选择地区" },
    },
  },
  {
    field: "favColor",
    title: "偏好颜色",
    width: 130,
    // ElColorPicker 取色面板（弹出面板类编辑控件验证）
    editRender: { name: "ElColorPicker" },
    // 非编辑态展示色块 + 色值文本（便于识别当前选中颜色）
    render: ({ cellValue }) =>
      cellValue ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              borderRadius: "3px",
              background: cellValue,
              verticalAlign: "middle",
            }}
          />
          <span>{cellValue}</span>
        </span>
      ) : (
        ""
      ),
  },
]);

const editRules = ref({
  remark: [{ required: true, message: "请输入备注", trigger: "change" }],
  username: [{ required: true, message: "必填", trigger: "change" }],
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
    // ===== 弹出类编辑控件验证列的派生字段 =====
    // dept2：与 department 同源，用于「自定义插槽式编辑（editRender: 'edit_dept2' + el-select）」验证
    dept2: item.department,
    // workTime：ElTimePicker 编辑验证
    workTime: item.workTime || "09:30:00",
    // regionPath：ElCascader 编辑验证
    regionPath: item.regionPath || ["zhejiang", "hangzhou"],
    // favColor：ElColorPicker 编辑验证
    favColor: item.favColor || "#409EFF",
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

// ========== 常驻编辑器（列 alwaysEdit）示例 ==========
// 列设置 alwaysEdit: true 后，该单元格始终渲染为输入控件（不进入点击编辑态），
// 输入只更新组件本地值，停止输入 300ms / 失焦 / 单元格卸载时才写回 row[field]。
// 注意：必须配合 editable 开启（本示例显式 :editable="true"），不参与 editRules 校验。
const alwaysEditDeptOptions = [
  { label: "研发部", value: "dev" },
  { label: "产品部", value: "product" },
  { label: "设计部", value: "design" },
  { label: "运营部", value: "ops" },
  { label: "人事部", value: "hr" },
];
const alwaysEditColumns = ref([
  { type: "seq", width: 60, title: "序号" },
  {
    field: "username",
    title: "姓名",
    editRender: { name: "ElInput" },
    alwaysEdit: true,
  },
  {
    field: "department",
    title: "部门",
    width: 150,
    editRender: { name: "ElSelect" },
    alwaysEdit: true,
  },
  {
    field: "age",
    title: "年龄",
    width: 140,
    editRender: { name: "ElInputNumber" },
    alwaysEdit: true,
  },
  {
    field: "createTime",
    title: "入职时间",
    width: 180,
    editRender: {
      name: "ElDatePicker",
      props: { type: "date", valueFormat: "YYYY-MM-DD", placeholder: "选择日期" },
    },
    alwaysEdit: true,
  },
]);
const alwaysEditOptions = ref({ department: alwaysEditDeptOptions });
const alwaysEditCellProps = ref({
  username: { placeholder: "请输入姓名", clearable: true },
  department: { placeholder: "请选择部门", clearable: true },
  age: { min: 0, max: 120 },
});
const alwaysEditData = ref(
  [
    ["张1号", "dev", 26, "2024-03-01"],
    ["李2号", "product", 31, "2023-11-20"],
    ["王3号", "design", 24, "2025-01-06"],
    ["赵4号", "ops", 38, "2022-07-15"],
    ["陈5号", "hr", 29, "2024-09-12"],
    ["刘6号", "dev", 35, "2021-05-08"],
    ["杨7号", "product", 22, "2025-04-01"],
    ["黄8号", "design", 41, "2020-12-18"],
  ].map(([username, department, age, createTime], i) => ({
    id: i + 1,
    username,
    department,
    age,
    createTime,
  })),
);
const alwaysEditRef = ref();
const alwaysEditChanged = ref(false);
// 写回发生在停止输入 300ms 或失焦时（不是每次按键）
const onAlwaysEditChange = ({ field, value, cellValue }) => {
  ElMessage.success(
    `常驻编辑器写回：${field} = ${JSON.stringify(value)}（原值=${JSON.stringify(cellValue)}）`,
  );
};
// getData 内部会先 flush 未写回的防抖输入，可直接拿到最新数据
const onAlwaysEditSave = async () => {
  const data = alwaysEditRef.value?.getData?.() || [];
  await alwaysEditRef.value?.markSaved?.();
  ElMessage.success(`已保存 ${data.length} 条（首行：${data[0]?.username} / ${data[0]?.department} / ${data[0]?.age}）`);
};
const onAlwaysEditCancel = async () => {
  const reverted = await alwaysEditRef.value?.revertChanges?.();
  ElMessage[reverted ? "success" : "info"](reverted ? "已还原为变更前数据" : "当前没有可还原的变更");
};

// ===== 校验 trigger + 无固定高度单行提示兜底 验证 =====
// 场景一（trigger 生效）：code 列「非必填，但有值时必须为数字」，
//   trigger=change 输入过程即校验；失焦（trigger=blur）也会校验。
// 场景二（提示可见）：:height="null" + max-height 固定 + 单行数据，
//   validConfig.autoPos=false 时 vxe 内联提示不渲染，组件兜底弹出校验浮层。
const validDemoRef = ref();
const validDemoColumns = ref([
  { type: "seq", width: 60, title: "序号" },
  { field: "username", title: "姓名", width: 160, editRender: { name: "ElInput" } },
  { field: "code", title: "编码（非必填，须为数字）", minWidth: 200, editRender: { name: "ElInput" } },
  { field: "email", title: "邮箱（非必填，blur校验）", minWidth: 220, editRender: { name: "ElInput" } },
]);
const validDemoData = ref([{ id: 1, username: "张三", code: "100", email: "a@b.co" }]);
const validDemoRules = ref({
  username: [{ required: true, message: "请输入姓名", trigger: "change" }],
  code: [
    {
      trigger: "change",
      message: "编码必须为数字",
      validator: ({ cellValue }) => {
        if (cellValue != null && cellValue !== "" && !/^\d+$/.test(String(cellValue))) {
          return new Error("编码必须为数字");
        }
      },
    },
  ],
  // blur trigger：编辑中（change）不应触发，退出编辑态（blur）才触发
  email: [
    {
      trigger: "blur",
      message: "邮箱格式不正确",
      validator: ({ cellValue }) => {
        if (cellValue != null && cellValue !== "" && !/^[\w.-]+@[\w.-]+\.\w+$/.test(String(cellValue))) {
          return new Error("邮箱格式不正确");
        }
      },
    },
  ],
});
// 行数切换：单行验证浮层兜底；两行验证内联提示（message='default' 多行走内联）
const toggleValidDemoRows = () => {
  validDemoData.value =
    validDemoData.value.length > 1
      ? [{ id: 1, username: "张三", code: "100", email: "a@b.co" }]
      : [
          { id: 1, username: "张三", code: "100", email: "a@b.co" },
          { id: 2, username: "李四", code: "200", email: "c@d.co" },
        ];
};
const onValidDemoSubmit = async () => {
  // 组件 fullValidate 内部已统一处理：先 clearEdit 关闭编辑态写回最新值，
  // 并让位宏任务避开 vxe 全局 mousedown 的迟到 autoClear，此处无需额外处理
  const errMap = await validDemoRef.value?.fullValidate?.(true);
  ElMessage[errMap ? "error" : "success"](
    errMap ? "校验未通过（浮层应完整可见）" : "校验通过",
  );
};

// ===== 弹窗中的表格校验提示验证 =====
// 场景：TablePro 放进 el-dialog（遮罩层 z-index 2000+ 递增），校验失败时
// 内联提示渲染在 td 内（无 z-index 问题）；单行兜底浮层 teleport 到 body，
// z-index 必须高于 dialog 遮罩才不被遮挡。此处实测验证两种提示均可见。
const dialogValidVisible = ref(false);
const dialogValidRef = ref();
const dialogValidData = ref([{ id: 1, username: "张三", code: "100", email: "a@b.co" }]);
const onDialogValidSubmit = async () => {
  const errMap = await dialogValidRef.value?.fullValidate?.(true);
  ElMessage[errMap ? "error" : "success"](
    errMap ? "校验未通过（弹窗内提示应可见）" : "校验通过",
  );
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

      <template #cell_department="{ row }">
        <el-tag size="small" effect="plain">
          🏢 {{ departmentTextMap[row.department] || row.department || "—" }}
        </el-tag>
      </template>

      <template #edit_dept2="{ row }">
        <el-select
          :model-value="row.dept2"
          @update:model-value="(v) => (row.dept2 = v)"
          placeholder="请选择部门"
          clearable
        >
          <el-option
            v-for="d in deptSlotOptions"
            :key="d"
            :label="d"
            :value="d"
          />
        </el-select>
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

    <el-divider content-position="left">
      常驻编辑器（列 alwaysEdit）：单元格始终为输入控件（不进入点击编辑态），输入停止 300ms / 失焦时写回行数据
    </el-divider>
    <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px">
      <el-tag :type="alwaysEditChanged ? 'warning' : 'success'">
        cellChanged = {{ alwaysEditChanged }}
      </el-tag>
      <el-button
        type="success"
        :disabled="!alwaysEditChanged"
        @click="onAlwaysEditSave"
      >
        保存（getData 落盘）
      </el-button>
      <el-button :disabled="!alwaysEditChanged" @click="onAlwaysEditCancel">
        取消
      </el-button>
      <span style="font-size: 13px; color: #606266">
        直接修改姓名 / 部门 / 年龄 / 入职时间，输入停顿后自动写回 row
      </span>
    </div>
    <TablePro
      ref="alwaysEditRef"
      :columns="alwaysEditColumns"
      :data="alwaysEditData"
      :editable="true"
      :edit-options="alwaysEditOptions"
      :cell-edit-props="alwaysEditCellProps"
      :pagination="false"
      :show-toolbar="false"
      height="auto"
      style="height: 420px"
      v-model:cellChanged="alwaysEditChanged"
      @cell-edit-change="onAlwaysEditChange"
    />

    <el-divider content-position="left">
      校验 trigger 生效 + 无固定高度单行提示兜底（:height="null" + max-height 固定 +
      单行数据 + validConfig.autoPos=false，校验失败浮层应完整可见）
    </el-divider>
    <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px">
      <el-button type="success" @click="onValidDemoSubmit">提交校验</el-button>
      <el-button @click="toggleValidDemoRows">
        {{ validDemoData.length > 1 ? "恢复单行" : "添加一行" }}
      </el-button>
      <span style="font-size: 13px; color: #606266">
        编码列输入非数字即时报错（trigger=change）；邮箱列失焦才报错（trigger=blur）；
        清空姓名后点「提交校验」：单行看浮层、两行看内联提示
      </span>
    </div>
    <TablePro
      ref="validDemoRef"
      class="valid-demo-table"
      :columns="validDemoColumns"
      :data="validDemoData"
      :editable="true"
      :edit-rules="validDemoRules"
      :valid-config="{ autoPos: false }"
      :pagination="false"
      :show-toolbar="false"
      :height="null"
      :max-height="140"
    />

    <el-divider content-position="left">
      弹窗中的表格校验提示（el-dialog 遮罩 z-index 较高，内联/浮层提示均应可见不被遮挡）
    </el-divider>
    <el-button @click="dialogValidVisible = true">在弹窗中打开校验表格</el-button>
    <el-dialog
      v-model="dialogValidVisible"
      title="弹窗中的表格"
      width="800px"
      append-to-body
    >
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px">
        <el-button type="success" @click="onDialogValidSubmit">提交校验</el-button>
        <span style="font-size: 13px; color: #606266">
          清空姓名后点「提交校验」：单行浮层应浮在弹窗之上
        </span>
      </div>
      <TablePro
        ref="dialogValidRef"
        class="dialog-valid-table"
        :columns="validDemoColumns"
        :data="dialogValidData"
        :editable="true"
        :edit-rules="validDemoRules"
        :valid-config="{ autoPos: false }"
        :pagination="false"
        :show-toolbar="false"
        :height="null"
        :max-height="140"
      />
    </el-dialog>
  </div>
</template>
