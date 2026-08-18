<script setup>
/**
 * TablePro 通用表格组件
 * 基于 vxe-grid 二次封装，使用 vxe-grid 配置式工具栏（toolbar-config）
 * 与列个性化设置（custom-config：列拖拽排序、列固定左/右、显示/隐藏）。
 *
 * 工具栏所需的 vxe-pc-ui 组件在 main.js 中按需引入，未全量引入。
 * 分页与加载遮罩使用 element-plus。
 *
 * 远程数据模式（传入 requestApi）：
 *   - 内部集成 useTable hook，自动管理 tableData / pageable / 请求参数
 *   - 通过 requestAuto 控制挂载后是否自动发起首次请求
 *   - 通过 dataCallback 对返回数据进行二次处理
 *   - 通过 requestError 监听请求异常
 * 静态数据模式（不传 requestApi）：
 *   - 直接使用外部传入的 data / pagerConfig
 */
import {
  ref,
  reactive,
  computed,
  useSlots,
  useAttrs,
  provide,
  nextTick,
  onMounted,
  watch,
  h,
  markRaw,
} from "vue";
// Element Plus 编辑组件（列编辑 slots.edit 使用）
import {
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElRadioGroup,
  ElRadio,
  ElRadioButton,
  ElCheckboxGroup,
  ElCheckbox,
  ElCheckboxButton,
  ElDatePicker,
  ElTimePicker,
  ElSwitch,
  ElRate,
} from "element-plus";
// 注册表头过滤渲染器（高阶复用），作为模块副作用执行一次
import "./renderers.js";
import { FILTER_DEFAULTS, isFilterActive } from "./filter-config.js";
import { useTable } from "@/hooks/useTable";
// 抽离的分页组件
import Pagination from "./components/Pagination.vue";

// 关闭自动 inheritAttrs（避免父组件传入的未声明属性落到根 div），
// 改由下方 gridProps 显式将这些属性透传到 <vxe-grid>；class / style 仍绑定到根元素 .table-pro
defineOptions({ inheritAttrs: false });

const props = defineProps({
  // 列配置（vxe-grid columns）
  columns: { type: Array, default: () => [] },
  // 表格数据（静态数据模式使用；远程模式由 useTable 接管）
  data: { type: Array, default: () => [] },
  // 表格高度
  height: { type: [String, Number], default: "auto" },
  // 斑马纹
  stripe: { type: Boolean, default: true },
  // 边框
  border: { type: [Boolean, String], default: true },
  // 圆角
  round: { type: Boolean, default: false },
  // 表格 id（用于列状态记忆隔离，开启 customStorage 时必填且唯一）
  tableId: { type: String, default: "" },
  // 行 / 选择 / 排序 / 树 / 展开配置
  rowConfig: { type: Object, default: () => ({}) },
  checkboxConfig: { type: Object, default: () => ({}) },
  radioConfig: { type: Object, default: () => ({}) },
  sortConfig: {
    type: Object,
    default: () => ({ remote: true, multiple: false, trigger: "button" }),
  },
  // ========== 排序参数 key 自定义配置 ==========
  // 远程排序时，控制最终发送到后端的排序参数 key 名与格式。
  // 默认行为：
  //   单字段排序：params.sortField = 'xxx' / params.sortOrder = 'asc' | 'desc'
  //   多字段排序：params.sortField = 'a,b' / params.sortOrder = 'asc,desc'
  // 可通过该 prop 自定义：
  //   {
  //     fieldKey: 'sortField',         // 排序字段的参数 key（默认 'sortField'）
  //     orderKey: 'sortOrder',         // 排序方向的参数 key（默认 'sortOrder'）
  //     combined: false,               // 是否将字段+方向合并到一个 key（默认 false）
  //     combinedKey: 'orderBy',         // 合并模式的 key 名（默认 'orderBy'）
  //     combinedSeparator: ' ',        // 合并模式字段与方向之间的分隔符（默认空格）
  //     combinedMultiSeparator: ','    // 多字段合并时各排序项之间的分隔符（默认逗号）
  //   }
  // 合并模式示例（combined: true）：
  //   单字段：params.orderBy = 'createTime desc'
  //   多字段：params.orderBy = 'createTime desc,username asc'
  sortParamConfig: { type: Object, default: () => ({}) },
  // 过滤配置（默认 remote：由外部根据 filter-confirm 事件自行过滤，vxe 不做客户端过滤）
  // transfer: true — 将过滤面板 teleport 到 body，避免面板定位越界时触发表格水平滚动条
  filterConfig: {
    type: Object,
    default: () => ({ remote: true, transfer: true }),
  },
  treeConfig: { type: Object, default: () => ({}) },
  expandConfig: { type: Object, default: () => ({}) },
  columnConfig: { type: Object, default: () => ({}) },
  // 单元格编辑配置（vxe editConfig，控制触发方式：click/manual/dblclick 等）
  // keepSource: true 保留行源数据，编辑后可对比修改（标记脏数据）
  editConfig: {
    type: Object,
    default: () => ({
      trigger: "click",
      mode: "cell",
      showStatus: true,
      keepSource: true,
    }),
  },
  // 工具栏开关
  showToolbar: { type: Boolean, default: true },
  // 内置刷新按钮（vxe-grid 工具栏）
  showRefresh: { type: Boolean, default: true },
  // 内置列个性化设置按钮（vxe-grid 工具栏：含列拖拽排序 / 固定左/右 / 显示隐藏）
  showColumnSetting: { type: Boolean, default: true },
  // 导出按钮（element-plus，直接调用 vxe-grid exportData 导出 CSV）
  showExport: { type: Boolean, default: true },
  // 工具栏右侧搜索框（element-plus）
  showSearch: { type: Boolean, default: true },
  // 工具栏右侧密度切换（element-plus）
  showDensity: { type: Boolean, default: true },
  // 工具栏内置「重置所有过滤条件」按钮
  showResetFilter: { type: Boolean, default: true },
  // 是否记忆列状态到 localStorage
  customStorage: { type: Boolean, default: false },
  // 额外传入的 toolbarConfig（与内部默认合并）
  toolbarConfig: { type: Object, default: () => ({}) },
  // 额外传入的 customConfig（与内部默认合并）
  customConfig: { type: Object, default: () => ({}) },
  // 分页（element-plus ElPagination）
  showPagination: { type: Boolean, default: true },
  pagerConfig: {
    type: Object,
    default: () => ({ currentPage: 1, pageSize: 10, total: 0 }),
  },

  // ========== 远程数据模式相关 props ==========
  // 请求表格数据的 api（传入即进入远程模式，由 useTable 接管数据与分页）
  requestApi: { type: Function, default: null },
  // 是否自动执行请求 api（默认 true，挂载后自动发起首次请求）
  requestAuto: { type: Boolean, default: true },
  // 表格 api 请求错误监听
  requestError: { type: Function, default: null },
  // 返回数据的回调函数，可以对数据进行处理
  dataCallback: { type: Function, default: null },
  // 过滤选项远程接口（传入后，FilterCheckbox 列在打开过滤面板时自动拉取选项）
  // 接收组合参数 { field, filters }：
  //   - field: 当前要拉取选项的列 field
  //   - filters: 所有 FilterCheckbox 列的当前过滤值，形如 { role: ['admin'], department: [] }
  //     参数 key 默认为列 field，可通过列配置 defParamKey 自定义（如 roleList）
  // 返回一个选项数组（Promise）
  requestFilterAPI: { type: Function, default: null },
  // 过滤选项远程接口返回数据的回调函数，可以对数据进行处理
  filterDataCallback: { type: Function, default: null },
  // 过滤选项 label/value 自定义键名（接口返回数据可能不是 label/value 键名）
  // 形如：{ label: "name", value: "code" }，默认 { label: "label", value: "value" }
  filterOptionKeys: {
    type: Object,
    default: () => ({ label: "label", value: "value" }),
  },
  // 是否需要分页组件（默认 true；与 showPagination 同时控制分页显示）
  pagination: { type: Boolean, default: true },

  // ========== 默认参数（初始化时应用，并同步到表格 UI）==========
  // 形如：
  //   {
  //     pageNum: 1,                  // 默认页码
  //     pageSize: 20,                // 默认每页条数
  //     sortField: 'createTime',      // 默认排序字段（逗号分隔多字段；最终发送的参数 key 由 sortParamConfig 控制）
  //     sortOrder: 'desc',            // 默认排序方向（逗号分隔多字段）
  //     filters: {                    // 默认列过滤值（按 field 索引）
  //       username: '袁',                          // FilterInput
  //       role: ['admin', 'developer'],            // FilterCheckbox（多选）
  //       status: 1,                                // FilterCheckbox（单选）
  //       createTime: ['2020-01-01', '2025-12-31'], // FilterDateRange（[startCreateTime, endCreateTime]）
  //       age: [18, 30],                            // FilterNumberRange（[min, max]）
  //     }
  //   }
  initParam: { type: Object, default: () => ({}) },

  // ========== 列公共配置（基于业务封装，减少 columns 中重复配置）==========
  // 对所有列自动合并，列自身配置优先级更高。组件已内置默认值：
  //   { showOverflow: 'tooltip', minWidth: 120 }
  // 业务侧可通过该 prop 覆盖或扩展（如自定义 align / headerAlign）。
  // 注：filterDefaults 的兜底由组件内部 DEFAULT_FILTER_CONFIG 提供（FilterInput / FilterCheckbox /
  //     FilterDateRange / FilterNumberRange），无需在此重复配置；如需自定义渲染器默认值可覆盖。
  defaultColumnConfig: {
    type: Object,
    default: () => ({ showOverflow: "tooltip", minWidth: 120 }),
  },

  // ========== 单元格可编辑功能：预置的选项数组（单独传递，不放在 columns 中）==========
  // 按列 field 索引：{ [field]: [{ label, value, disabled? }, ...] }
  // 用于 ElSelect / ElRadio / ElCheckbox 等需要 options 的编辑控件
  editOptions: { type: Object, default: () => ({}) },

  // ========== 单元格可编辑功能：各列编辑控件的额外公共 props（单独传递）==========
  // 按列 field 索引：{ [field]: { placeholder, size, disabled, clearable, ... } }
  cellEditProps: { type: Object, default: () => ({}) },
});

const emit = defineEmits([
  "refresh",
  "export",
  "search",
  "density-change",
  "toolbar-button-click",
  "update:pagerConfig",
  "page-change",
  "sort-change",
  "checkbox-change",
  "checkbox-all",
  "radio-change",
  "cell-click",
  "cell-dblclick",
  "row-click",
  "row-dblclick",
  // 表头过滤：点击面板「确定」后抛出全部过滤 + 排序的组合参数
  "filter-confirm",
  // 表头过滤：点击面板「重置」（单列表头）后抛出事件，含被重置的列信息与最新组合参数
  "filter-reset",
  // 工具栏「重置过滤」按钮：清空所有列过滤条件后抛出重置事件
  "filter-reset-all",
  // 工具栏「重置过滤」按钮：自定义事件，参数为当前所有过滤 + 排序条件
  "reset-filter",
  // 单元格编辑完成：{ row, column, field, value, cellValue }
  "cell-edit-change",
]);

const slots = useSlots();
const attrs = useAttrs();
const gridRef = ref();

// ========== 单元格编辑上下文 ==========
// - 给 mergedColumns 内部使用（局部变量 getEditContext_）
// - 同时 provide，方便通过 inject 扩展（预留兼容）
const editContextRef = {
  onCellEditChange: (params) => emit("cell-edit-change", params),
};
const getEditContext_ = () => editContextRef;
provide("tableProEditContext", {
  editOptions: computed(() => props.editOptions || {}),
  cellEditProps: computed(() => props.cellEditProps || {}),
  onCellEditChange: editContextRef.onCellEditChange,
});

// ========== 单元格编辑态本地值管理（避免 slots 函数创建 ref/watch 副作用）==========
// 进入编辑时 copy 一份原始值到 editLocalState[key]，编辑期间修改只写这里，
// 退出编辑（edit-closed）时再统一提交到 row + 发射 cell-edit-change，避免 vxe 状态机混乱
const editLocalState = reactive({});
let _rowAutoIdSeq = 0;
const ROW_ID_KEY = Symbol("__tblRowId");
const resolveEditStateKey = (row, field) => {
  if (!row) return `__no_row__:${String(field)}`
  // 优先用稳定 ID（如 mock 的 id）
  const stableId = row.id != null ? `id:${row.id}` : (row[ROW_ID_KEY] != null ? `auto:${row[ROW_ID_KEY]}` : null)
  const prefix = stableId != null
    ? stableId
    : `auto:${(row[ROW_ID_KEY] = ++_rowAutoIdSeq)}`
  return `${prefix}:${String(field)}`
}
// 进入编辑态：用 row[field] 初始化本地值（作为 actived 时的"旧值"快照）
const onEditActivated = (params) => {
  const row = params && params.row
  const field = params && params.column && params.column.field
  if (!row || !field) return
  const key = resolveEditStateKey(row, field)
  editLocalState[key] = row[field]
}
// 退出编辑态：从本地值写回 row + 发射事件 + 清理本地态
// 分流：
//   - 对象式 editRender：editLocalState 存本地编辑值（新值），row[field] 为旧值 → 写回 row
//   - 函数式/字符串式 editRender：用户编辑期间直接绑 row[field]（新值已落 row），
//     editLocalState 为 actived 时的旧值 → 不覆盖 row，仅以 row[field] 为新值发射事件
const onEditClosed = (params) => {
  const row = params && params.row
  const col = params && params.column
  const field = col && col.field
  if (!row || !field) return
  const key = resolveEditStateKey(row, field)
  if (!(key in editLocalState)) return

  const isCustomEdit = !!(customEditFields.value && customEditFields.value[field])
  let newValue, oldValue

  if (isCustomEdit) {
    // 函数式/字符串式：row[field] 已是用户改后的新值，editLocalState 是旧值快照
    newValue = row[field]
    oldValue = editLocalState[key]
    // 不覆盖 row（已是新值）
  } else {
    // 对象式：editLocalState 是本地编辑值（新值），row[field] 是旧值
    newValue = editLocalState[key]
    oldValue = row[field]
    // 写回 row（不调用 $table.setCellValue，避免触发 vxe 重新进入编辑态）
    try {
      row[field] = newValue
    } catch (e) { /* noop */ }
  }

  try { delete editLocalState[key] } catch (e) { editLocalState[key] = undefined }

  // 值发生变化才发射 cell-edit-change（避免进编辑又退出无改动时也触发）
  if (newValue !== oldValue) {
    const ctx = getEditContext_()
    if (typeof ctx.onCellEditChange === 'function') {
      ctx.onCellEditChange({
        row,
        column: col,
        field,
        value: newValue,
        cellValue: oldValue,
      })
    }
  }
}

// 每个 FilterCheckbox 列的重新拉取计数器（用于面板每次打开时触发重新 fetch，避免组件复用导致数据串列或级联数据不刷新）
const filterRefetchCounter = reactive({});
const bumpFilterRefetchCounter = (field) => {
  if (!field) return;
  filterRefetchCounter[field] = (filterRefetchCounter[field] || 0) + 1;
};

// ========== 过滤面板草稿快照（与 vxe-table 列过滤逻辑保持一致）==========
// vxe-grid 在面板关闭时可能自动设置 opt.checked=true（即使未点击确认），
// 导致未确认的草稿改动被标记为「已激活」。通过快照机制在面板关闭时恢复未确认的状态：
//  - 面板打开（visible=true）：保存当前列所有 filter option 的 data + checked 快照
//  - 点击「确定」：清除快照（确认的改动保留）
//  - 点击「重置」：更新快照为重置后的状态（重置立即生效）
//  - 面板关闭（visible=false）：若快照仍存在（未确认），恢复 data + checked
const pendingFilterSnapshots = reactive({});
// 深拷贝过滤 data（处理 FilterCheckbox.values 等数组类型的属性）
const cloneFilterData = (data) => {
  if (!data || typeof data !== "object") return data;
  const clone = { ...data };
  Object.keys(clone).forEach((k) => {
    if (Array.isArray(clone[k])) clone[k] = [...clone[k]];
  });
  return clone;
};
// 保存指定列的过滤快照
const saveFilterSnapshot = (column) => {
  if (!column || !column.id) return;
  pendingFilterSnapshots[column.id] = (column.filters || []).map((opt) => ({
    data: cloneFilterData(opt.data),
    checked: opt.checked,
  }));
};
// 恢复指定列的过滤快照（未确认的改动被撤销）
const restoreFilterSnapshot = (column) => {
  if (!column || !column.id) return;
  const snapshot = pendingFilterSnapshots[column.id];
  if (!snapshot) return;
  (column.filters || []).forEach((opt, i) => {
    if (snapshot[i]) {
      opt.data = cloneFilterData(snapshot[i].data);
      opt.checked = snapshot[i].checked;
    }
  });
  delete pendingFilterSnapshots[column.id];
};
// 更新指定列的快照为当前状态（用于「重置」后更新快照基线）
const updateFilterSnapshot = (column) => {
  saveFilterSnapshot(column);
};
// 清除指定列的快照（用于「确认」后清除，表示改动已提交无需恢复）
const clearFilterSnapshot = (column) => {
  if (!column || !column.id) return;
  delete pendingFilterSnapshots[column.id];
};

const currentDensity = ref("small");

// ========== 远程数据模式：集成 useTable hook ==========
// 是否处于远程模式：传入了 requestApi 函数即视为远程模式
const isRemoteMode = computed(() => typeof props.requestApi === "function");

// 集成 useTable：
// 1) 包装 requestApi：项目 request.js 拦截器已剥除外层 { code, message, data }，
//    直接返回内部 data；而 useTable 内部使用 `let { data } = await api(...)` 解构，
//    因此这里包一层 { data: result } 以适配 hook 的解构约定。
// 2) 包装为函数形式，确保每次调用都读取最新的 props.requestApi / dataCallback / requestError，
//    避免闭包捕获旧值（支持外部动态切换 api）。
const tableHook = useTable(
  async (params) => {
    if (typeof props.requestApi !== "function") {
      return { data: { list: [], total: 0 } };
    }
    const result = await props.requestApi(params);
    return { data: result };
  },
  {},
  props.pagination,
  // dataCallback / requestError 同样通过包装读取最新值
  (...args) =>
    typeof props.dataCallback === "function"
      ? props.dataCallback(...args)
      : args[0],
  (...args) =>
    typeof props.requestError === "function" && props.requestError(...args),
);

// ========== 过滤默认值构建工具 ==========
// 将 initParam.filters 中的默认值转换为对应过滤类型的 data 结构
// 统一供 mergedColumns / applyInitParam / resetColumnFilter / resetAllFilter 复用
const buildFilterDataFromDefault = (name, defaultVal) => {
  switch (name) {
    case "FilterInput":
      return { value: defaultVal == null ? "" : String(defaultVal) };
    case "FilterCheckbox":
      return {
        values: Array.isArray(defaultVal)
          ? [...defaultVal]
          : defaultVal == null
            ? []
            : [defaultVal],
        search: "",
      };
    case "FilterDateRange":
    case "FilterNumberRange": {
      // 区间类默认值支持数组 [first, second]（推荐，与 FilterCheckbox 一致）
      // 兼容旧对象格式 { start, end } / { min, max }
      let a = null;
      let b = null;
      if (Array.isArray(defaultVal)) {
        a = defaultVal[0];
        b = defaultVal[1];
      } else if (defaultVal && typeof defaultVal === "object") {
        a = defaultVal.start != null ? defaultVal.start : defaultVal.min;
        b = defaultVal.end != null ? defaultVal.end : defaultVal.max;
      }
      return {
        values: [
          a != null && a !== "" ? a : null,
          b != null && b !== "" ? b : null,
        ],
      };
    }
    default:
      return null;
  }
};

// 获取指定列的「默认过滤 data」：
//  - 若 initParam.filters 中存在该列的默认值，则转换为对应 data 结构
//  - 否则回退到 FILTER_DEFAULTS（空值）
// 用于重置过滤时恢复默认值（而非清空默认值）
const getColumnDefaultData = (field, filterRenderName) => {
  const ip = props.initParam || {};
  const defaultVal = ip.filters && ip.filters[field];
  if (defaultVal != null) {
    const data = buildFilterDataFromDefault(filterRenderName, defaultVal);
    if (data) return data;
  }
  const fac = FILTER_DEFAULTS[filterRenderName];
  return fac ? fac() : null;
};

// ========== Element Plus 组件映射（editRender.name -> 组件 + 选项包裹配置）==========
const EL_EDIT_MAP = {
  ElInput:        { comp: ElInput },
  ElInputNumber:  { comp: ElInputNumber },
  ElDatePicker:   { comp: ElDatePicker },
  ElTimePicker:   { comp: ElTimePicker },
  ElSwitch:       { comp: ElSwitch },
  ElRate:         { comp: ElRate },
  ElSelect:       { comp: ElSelect,       wrap: 'ElOption' },
  ElRadio:        { comp: ElRadioGroup,   wrap: 'ElRadio' },
  ElRadioButton:  { comp: ElRadioGroup,   wrap: 'ElRadioButton' },
  ElCheckbox:     { comp: ElCheckboxGroup,wrap: 'ElCheckbox' },
  ElCheckboxButton:{ comp: ElCheckboxGroup,wrap:'ElCheckboxButton' },
}
const WRAP_COMPONENTS = { ElOption, ElRadio, ElRadioButton, ElCheckbox, ElCheckboxButton }

// 读取某列的编辑选项数组（优先级：editRender.props.options → props.editOptions[field]）
const resolveEditOptions = (field, editRenderProps) => {
  if (editRenderProps && Array.isArray(editRenderProps.options)) return editRenderProps.options
  const eo = props.editOptions || {}
  return Array.isArray(eo[field]) ? eo[field] : []
}
// 合并编辑控件 props（列 editRender.props.props + cellEditProps[field] + v-model）
const mergeEditCompProps = (field, editRender, editValue, extra = {}) => {
  const erProps = (editRender && editRender.props) || {}
  const innerProps = erProps.props || {}
  // cellEditProps（外部单独注入，优先级更高）
  const cep = props.cellEditProps || {}
  const commonProps = cep[field] || {}
  return {
    ...erProps,              // editRender.props 顶层（如 activeValue / type 等）
    ...innerProps,           // editRender.props.props（标准组件 props 容器）
    ...commonProps,          // 外部 :cell-edit-props 统一注入（优先级最高）
    ...extra,                // v-model 等基础绑定（优先级最高）
  }
}

// 合并默认过滤值的列配置
// 将 initParam.filters 中的默认值注入到对应列的 filters[0].data + checked 属性中，
// 这样 vxe-grid 在首次渲染时就携带默认过滤值，不会被数据更新重新渲染时重置。
//
// 另外还负责以下业务级列配置优化：
//   1. defaultColumnConfig（除 filterDefaults 外）与各数据列浅合并（checkbox/seq/radio/expand 特殊列排除），
//      列自身配置优先级更高，保证对齐方式和表头一致。
//   2. defaultColumnConfig.filterDefaults + 自定义属性 filterType：
//      业务侧仅写 `filterType: 'FilterInput'` 即自动注入完整 filters + filterRender 默认值。
//   3. `render`（只读 JSX 函数 (h, params) => VNode）→ 转为列 slots.default 响应式 JSX 插槽，
//      同时也支持配置式：render: 'cell_role' 字符串引用外部具名插槽名（#cell_role）。
//   4. `editRender`（可编辑配置）→ 设置 editable:true，并构建 slots.edit 渲染 Element Plus 组件；
//      非编辑态 slots.default 若用户没写 render，则自动按 editOptions 显示 label 文本（否则原值）。
//   5. 插槽式渲染：外部 <TablePro> 的 template 中 #cell_xxx / #edit_xxx 具名插槽透传到 vxe-grid 对应列，
//      列配置 slots.default/edit 写字符串时按插槽名匹配；写函数时按响应式 JSX 插槽使用。
const mergedColumns = computed(() => {
  const defCfg = props.defaultColumnConfig || {}
  const { filterDefaults: defFilterDefaults, ...defColumnCommon } = defCfg

  const DEFAULT_FILTER_CONFIG = {
    FilterInput:       { filters: [{ data: { value: '' } }],                 filterRender: { name: 'FilterInput' } },
    FilterCheckbox:    { filters: [{ data: { values: [], search: '' } }],   filterRender: { name: 'FilterCheckbox' } },
    FilterDateRange:   { filters: [{ data: { values: [null, null] } }],    filterRender: { name: 'FilterDateRange' } },
    FilterNumberRange: { filters: [{ data: { values: [null, null] } }],    filterRender: { name: 'FilterNumberRange' } },
  }
  const filterDefaults = { ...DEFAULT_FILTER_CONFIG, ...(defFilterDefaults || {}) }

  const ip = props.initParam || {}
  const initFilters = ip.filters && typeof ip.filters === 'object' ? ip.filters : {}

  // 外部插槽集合（用于支持 render: 'cell_role' 这种字符串引用外部具名插槽）
  const externalSlots = slots || {}

  return (props.columns || []).map((rawCol) => {
    if (!rawCol || typeof rawCol !== 'object') return rawCol
    const colType = rawCol.type
    const isSpecialCol = !!(colType && /^(checkbox|seq|radio|expand)$/.test(colType))

    let col = { ...rawCol }
    // slots 深拷贝一层，避免污染 rawCol
    col.slots = rawCol.slots ? { ...rawCol.slots } : {}

    // ---------- 1) 公共列属性（仅对非特殊列生效，避免 checkbox/seq 上的居中、showOverflow 干扰对齐）----------
    if (!isSpecialCol && Object.keys(defColumnCommon).length) {
      col = { ...defColumnCommon, ...col }
      // 列 slots 在上面展开 defColumnCommon 时可能被覆盖，重新恢复
      col.slots = rawCol.slots ? { ...rawCol.slots } : {}
    }

    // ---------- 1a) 对齐默认值与一致性 ----------
    // - checkbox/seq 特殊列默认居中（未显式设置时生效）
    // - 普通列默认左对齐（align='left'）；若仅显式设置了 headerAlign 而未设置 align，
    //   则用 headerAlign 保证单元格与表头对齐一致
    // 优先级：列显式配置 > defaultColumnConfig > 组件默认 'left'
    // 注：vxe-table 会根据 headerAlign 自动给表头 th 加 col--left/center/right class，
    //     样式侧直接用该原生 class 做差异化布局，无需在此注入自定义标记 class。
    if (colType === 'checkbox' || colType === 'seq') {
      if (col.align == null) col.align = 'center'
      if (col.headerAlign == null) col.headerAlign = 'center'
    } else if (col.headerAlign != null && col.align == null) {
      col.align = col.headerAlign
    } else if (col.align == null && col.headerAlign == null) {
      col.align = 'left'
      col.headerAlign = 'left'
    }

    // ---------- 2) filterType 自动注入过滤配置 ----------
    if (col.filterType && filterDefaults[col.filterType]) {
      const autoCfg = filterDefaults[col.filterType] || {}
      if (col.filters == null && autoCfg.filters) {
        col.filters = autoCfg.filters.map((o) => ({ ...o, data: o.data ? { ...o.data } : {} }))
      }
      if (col.filterRender == null && autoCfg.filterRender) {
        col.filterRender = { ...autoCfg.filterRender }
      }
    }

    // ---------- 3) render → slots.default（配置式 JSX 只读渲染 + 插槽式字符串引用）----------
    // 优先级：用户显式 slots.default > col.render > (editRender + options 的 label 回退)
    // 函数签名：(params, h) => VNode，params 为标准化参数对象，h 为 Vue 渲染函数
    // （params 比 h 更常用，故 params 置首；JSX 写法下 h 可省略，仅在需手写 h(...) 时用到）
    const field = col.field || ''
    if (!col.slots.default) {
      if (typeof col.render === 'function') {
        // 函数式 JSX 渲染（推荐）
        const userRender = col.render
        col.slots.default = markRaw((scope) => {
          try {
            // 给用户回调标准化参数（兼容之前的 params 结构）
            const params = {
              row: scope.row,
              column: col,
              field,
              cellValue: field ? scope.row && scope.row[field] : undefined,
              rowIndex: scope.$rowIndex,
              columnIndex: scope.$columnIndex,
              $table: scope.$table,
            }
            return userRender(params, h)
          } catch (e) {
            return h('span', { style: 'color:#f56c6c' }, String(e && e.message ? e.message : e))
          }
        })
      } else if (typeof col.render === 'string') {
        // 字符串：引用外部具名插槽名（如 render: 'cell_role' 对应 <template #cell_role="{row}">）
        const slotName = col.render
        if (typeof externalSlots[slotName] === 'function') {
          col.slots.default = slotName
        }
      }
    }

    // ---------- 3a) headerRender → slots.header（配置式 JSX 自定义表头 + 插槽式字符串引用）----------
    // 优先级：用户显式 slots.header > col.headerRender
    // 支持：
    //   1) 函数式 JSX：(params, h) => VNode，params 标准化字段：column/field/title/$table/$rowIndex/$columnIndex
    //   2) 字符串：引用外部具名插槽名（如 headerRender: 'header_role' 对应 <template #header_role="{column}">）
    if (!col.slots.header) {
      if (typeof col.headerRender === 'function') {
        const userHeader = col.headerRender
        col.slots.header = markRaw((scope) => {
          try {
            const params = {
              column: col,
              field,
              title: col.title,
              $table: scope.$table,
              rowIndex: scope.$rowIndex,
              columnIndex: scope.$columnIndex,
            }
            return userHeader(params, h)
          } catch (e) {
            return h('span', { style: 'color:#f56c6c' }, String(e && e.message ? e.message : e))
          }
        })
      } else if (typeof col.headerRender === 'string') {
        const slotName = col.headerRender
        if (typeof externalSlots[slotName] === 'function') {
          col.slots.header = slotName
        }
      }
    }

    // ---------- 4) editRender → editable:true + slots.edit 构建编辑控件 ----------
    // 支持三种形式（优先级：用户显式 slots.edit > editRender）：
    //   1) 函数式 JSX：editRender: (params, h) => VNode
    //      params 标准化字段：row/column/field/cellValue/rowIndex/columnIndex/$table
    //      适用：完全自定义编辑控件（如组合组件、第三方组件、条件渲染等）
    //      注：函数式下编辑态值需用户自行管理（如 v-model 绑 row[field]），
    //          退出编辑由 vxe edit-closed 统一提交，组件不自动接管 modelValue。
    //   2) 字符串引用外部具名插槽：editRender: 'edit_phone' → <template #edit_phone>
    //   3) 对象配置式（原有）：editRender: { name: 'ElInput', props: {...} }
    //      通过 EL_EDIT_MAP 映射到 Element Plus 组件，自动管理本地编辑态 + label 回退
    if (col.editRender) {
      if (typeof col.editRender === 'function') {
        // (1) 函数式 JSX
        if (col.editable == null) col.editable = true
        if (!col.slots.edit) {
          const userEdit = col.editRender
          col.slots.edit = markRaw((scope) => {
            try {
              const row = scope.row
              const originalVal = field != null && row ? row[field] : undefined
              const params = {
                row,
                column: col,
                field,
                cellValue: scope.cellValue != null ? scope.cellValue : originalVal,
                rowIndex: scope.$rowIndex,
                columnIndex: scope.$columnIndex,
                $table: scope.$table,
              }
              return userEdit(params, h)
            } catch (e) {
              return h('span', { style: 'color:#f56c6c' }, String(e && e.message ? e.message : e))
            }
          })
        }
      } else if (typeof col.editRender === 'string') {
        // (2) 字符串引用外部具名插槽
        if (col.editable == null) col.editable = true
        if (!col.slots.edit) {
          const slotName = col.editRender
          if (typeof externalSlots[slotName] === 'function') {
            col.slots.edit = slotName
          }
        }
      } else if (col.editRender.name) {
        // (3) 对象配置式（原有逻辑：EL_EDIT_MAP 映射 + 本地编辑态 + label 回退）
        if (col.editable == null) col.editable = true
        const erName = col.editRender.name
        const mapEntry = EL_EDIT_MAP[erName]
        if (mapEntry) {
          const Comp = mapEntry.comp
          const wrapName = mapEntry.wrap
          // 构建 slots.edit（若用户未显式写）
          if (!col.slots.edit) {
            // 使用 markRaw 标记为原始对象，避免 Vue 深度劫持造成渲染循环或状态丢失
            col.slots.edit = markRaw((scope) => {
              const row = scope.row
              const originalVal = field != null && row ? row[field] : undefined
              const currentVal = scope.cellValue != null ? scope.cellValue : originalVal
              // 从全局编辑态取本地值（由 edit-actived 初始化），避免在 slots 函数里新建 ref/watch
              const stateKey = resolveEditStateKey(row, field)
              if (!(stateKey in editLocalState)) editLocalState[stateKey] = currentVal
              const bindProps = mergeEditCompProps(field, col.editRender, undefined, {
                modelValue: editLocalState[stateKey],
                'onUpdate:modelValue': (v) => { editLocalState[stateKey] = v },
              })
              // onBlur / onChange 不再主动 commit，统一在 edit-closed 提交，避免 vxe 内部状态机混乱

              if (!wrapName) {
                // Input / InputNumber / DatePicker / TimePicker / Switch / Rate：无子项
                return h(Comp, bindProps)
              }

              // Select / Radio* / Checkbox*：渲染 options
              const erInnerProps = (col.editRender && col.editRender.props) || {}
              const options = resolveEditOptions(field, erInnerProps)
              const WrapComp = WRAP_COMPONENTS[wrapName]
              const children = options.map((opt, idx) => {
                const labelText = opt.label != null ? opt.label : opt.value
                const optValue = opt.value != null ? opt.value : opt.label
                const key = `${field}-opt-${idx}-${String(optValue)}`
                const wrapProps = { key }
                // ElOption：value + label（显示）
                if (wrapName === 'ElOption') {
                  wrapProps.label = labelText
                  wrapProps.value = optValue
                } else {
                  // ElRadio / ElCheckbox 组内子项：label 是 group 的选中绑定值
                  wrapProps.label = optValue
                  wrapProps.value = optValue
                }
                if (opt.disabled != null) wrapProps.disabled = !!opt.disabled
                return h(WrapComp, wrapProps, () => labelText)
              })

              return h(Comp, bindProps, { default: () => children })
            })
          } else if (typeof col.slots.edit === 'string') {
            // 用户写 slots.edit: 'edit_username' 字符串时，什么都不做，直接交给外部具名插槽
          }

          // 如果用户没有提供 render/slots.default，自动给非编辑态渲染 label 文本（基于 editOptions 映射）
          if (!col.slots.default) {
            col.slots.default = markRaw((scope) => {
              const raw = field != null && scope.row ? scope.row[field] : undefined
              const erInnerProps = (col.editRender && col.editRender.props) || {}
              const options = resolveEditOptions(field, erInnerProps)
              if (options.length) {
                const findLabel = (v) => {
                  const hit = options.find((o) => o.value === v || String(o.value) === String(v))
                  return hit ? hit.label : (v == null ? '' : String(v))
                }
                if (Array.isArray(raw)) {
                  return h(
                    'span',
                    raw.map((v, i) => h('span', { key: i, style: i ? 'margin-left:6px' : '' }, findLabel(v)))
                  )
                }
                return h('span', findLabel(raw))
              }
              return h('span', raw == null ? '' : String(raw))
            })
          }
        }
      }
    }

    // ---------- 5) 默认过滤值注入（兼容原有逻辑）----------
    if (col.filters && col.filters.length && col.filterRender) {
      const fName = col.filterRender.name
      if (fName && FILTER_DEFAULTS[fName]) {
        const defaultVal = initFilters[field]
        if (defaultVal != null) {
          const data = buildFilterDataFromDefault(fName, defaultVal)
          if (data) {
            col.filters = col.filters.map((opt, i) =>
              i === 0 ? { ...opt, data: { ...data }, checked: isFilterActive(fName, data) } : { ...opt },
            )
          }
        }
      }
    }

    return col
  })
})

// ========== 函数式/字符串式 editRender 标记 ==========
// 这两种形式下用户编辑期间直接绑 row[field]（值已落 row），onEditClosed 不能用
// editLocalState（actived 时的旧值）覆盖 row[field]，否则会回滚编辑 + cell-edit-change
// 参数 value/cellValue 颠倒。这里收集这类列的 field，供 onEditClosed 分流处理。
const customEditFields = computed(() => {
  const m = {}
  ;(mergedColumns.value || []).forEach((col) => {
    if (!col || typeof col !== 'object') return
    const er = col.editRender
    // 函数式 / 字符串式均视为自定义编辑（用户意图自管编辑态）
    if (typeof er === 'function' || typeof er === 'string') {
      m[col.field] = true
    }
  })
  return m
})

// 实际渲染的表格数据：远程模式由 useTable 接管，否则使用外部传入的 data
const renderData = computed(() =>
  isRemoteMode.value ? tableHook.tableData.value : props.data,
);

// 实际使用的分页配置：远程模式由 useTable 的 pageable 接管
const currentPager = computed(() => {
  if (isRemoteMode.value) {
    const pg = tableHook.pageable.value || {};
    return {
      currentPage: pg.pageNum || 1,
      pageSize: pg.pageSize || 10,
      total: pg.total || 0,
      pageSizes: props.pagerConfig?.pageSizes || [10, 20, 50, 100],
    };
  }
  return props.pagerConfig;
});

// 是否实际展示分页组件：pagination 与 showPagination 同时为 true 才显示
const showPager = computed(() => props.pagination && props.showPagination);

// ========== 默认参数同步 ==========
/**
 * 把 initParam 中的默认值同步到 useTable 与 vxe-grid 的 UI 状态：
 *  - 分页默认值 → useTable.pageable
 *  - 排序默认值 → useTable.searchParam（sortField/sortOrder）+ vxe-grid sort 状态（图标高亮）
 *  - 列过滤默认值 → useTable.searchParam（按 filterStateToParams 约定的 key）+ vxe-grid column.filters[0].data + opt.checked=true（图标高亮）
 *
 * 在首次自动请求（onMounted）之前调用，确保首屏请求即带默认参数。
 */
const applyInitParam = () => {
  const ip = props.initParam || {};
  const hasInit = Object.keys(ip).length > 0;
  if (!hasInit) return;

  // 标记正在应用默认值，防止 vxe sort() 触发 sort-change → 重复请求
  isApplyingDefaults.value = true;

  // 收集需要同步到 vxe-grid UI 的信息，统一在一个 nextTick 中处理
  const sortFields = ip.sortField
    ? String(ip.sortField)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const sortOrders = ip.sortField
    ? String(ip.sortOrder || "")
        .split(",")
        .map((s) => s.trim())
    : [];
  const fakeFilters = [];

  // 1) 分页默认值
  if (props.pagination && tableHook.pageable.value) {
    if (ip.pageNum != null)
      tableHook.pageable.value.pageNum = Number(ip.pageNum) || 1;
    if (ip.pageSize != null)
      tableHook.pageable.value.pageSize = Number(ip.pageSize) || 10;
  }

  // 2) 排序默认值 → 写入 searchParam（复用 sortStateToParams，自动遵循 sortParamConfig 自定义 key）
  if (sortFields.length) {
    const sp = tableHook.searchParam.value;
    const initSorts = sortFields.map((f, i) => ({
      field: f,
      order: sortOrders[i] || "asc",
    }));
    const { params: sortParams, paramKeys } = sortStateToParams(initSorts);
    Object.keys(sortParams).forEach((k) => {
      sp[k] = sortParams[k];
    });
    paramKeys.forEach((k) => lastSortParamKeys.add(k));
  }

  // 3) 列过滤默认值 → 写入 searchParam + 收集 fakeFilters 供 UI 同步
  if (ip.filters && typeof ip.filters === "object") {
    const sp = tableHook.searchParam.value;
    Object.keys(ip.filters).forEach((field) => {
      const col = (props.columns || []).find((c) => c.field === field);
      const fName = col && col.filterRender && col.filterRender.name;
      if (!fName || !FILTER_DEFAULTS[fName]) return;
      const defaultVal = ip.filters[field];
      const data = buildFilterDataFromDefault(fName, defaultVal);
      if (!data) return;
      fakeFilters.push({
        field,
        // 参数 key：默认取 field，可通过列配置 defParamKey 自定义
        paramKey: (col && col.defParamKey) || field,
        title: (col && col.title) || field,
        type: fName,
        data,
        // 透传 filterRender.props，供 filterStateToParams 读取区间类的 emptyValue 等配置
        props: col && col.filterRender ? col.filterRender.props : undefined,
        active: isFilterActive(fName, data),
      });
    });

    const { params: filterParams, paramKeys } =
      filterStateToParams(fakeFilters);
    Object.keys(filterParams).forEach((k) => {
      sp[k] = filterParams[k];
    });
    paramKeys.forEach((k) => lastFilterParamKeys.add(k));
  }

  // 4) 统一在一个 nextTick 中同步 vxe-grid UI 状态（sort 图标 + filter 面板默认值 + 图标高亮）
  nextTick(() => {
    try {
      const $table = gridRef.value;
      if (!$table) return;

      // 4a) 同步排序 UI 状态（让 sort 图标高亮）
      if (sortFields.length && $table.sort) {
        sortFields.forEach((f, i) => {
          const order = sortOrders[i] || "asc";
          try {
            $table.sort(f, order);
          } catch (e) {
            /* ignore */
          }
        });
      }

      // 4b) 列过滤 UI 状态已由 mergedColumns（列配置注入默认 data + checked）处理，
      //     vxe-grid 渲染时即携带默认值，无需在此手动同步 opt.data。
      //     但仍需手动同步过滤图标高亮 class（部分 vxe 版本不自动加 is--filter-active）。
      syncFilterHeaderClass();
    } finally {
      // 4c) UI 同步完成，解除 guard（无论中间是否抛错都必须解除，避免后续 sort-change 被永久跳过）
      isApplyingDefaults.value = false;
    }
  });
};

// 初始化标志：防止 applyInitParam 中的 vxe sort() 触发 sort-change → 重复请求
const isApplyingDefaults = ref(false);

// 挂载后自动发起首次请求（仅远程模式且 requestAuto=true）
onMounted(() => {
  // 先同步默认参数（影响首屏请求的参数 + UI 高亮状态）
  applyInitParam();
  if (isRemoteMode.value && props.requestAuto) {
    // 关键：updatedTotalParam 把 searchParam（含默认 filter/sort 参数）同步到 totalParam，
    // 否则 getTableList 只会发送 pageParam，丢失 filter/sort 默认值
    tableHook.updatedTotalParam();
    tableHook.getTableList();
  }
});

// 当 requestApi 发生变化（例如外部动态切换数据源）时，重新拉取数据
watch(
  () => props.requestApi,
  (api, oldApi) => {
    if (api !== oldApi && isRemoteMode.value && props.requestAuto) {
      // 重置分页到第一页再拉取
      if (tableHook.pageable.value) tableHook.pageable.value.pageNum = 1;
      tableHook.getTableList();
    }
  },
);

// ========== 过滤 popover 二次定位（解决首列/尾列/滚动后再次打开位置不自适应 & 边界溢出）==========
// vxe 的 transfer=true 模式下对 filter 面板的 clamp 使用了 viewport 坐标与 document 坐标混用，
// 当页面/表格出现水平滚动时，首列或尾列的弹窗会超出视口甚至误触外层横向滚动条。
// 这里在每次 filter-visible 打开后，基于实际的视口尺寸进行二次 clamp，并计算箭头位置始终指向触发列。
const clampFilterPanelToViewport = async (column) => {
  await nextTick();
  // setTimeout 让 vxe 内部完成 filterStore.style 写入后再覆盖修正
  setTimeout(() => {
    const panel = document.querySelector(
      ".vxe-table--filter-wrapper.is--active",
    );
    if (!panel) return;
    const margin = 16;
    // === 箭头绘制所需的预留空间 ===
    // 箭头本身 8px + 与表头/面板之间的 2px 安全间隙
    const ARROW_SIZE = 8;
    const ARROW_GAP = 2;
    const ARROW_EXTRA = ARROW_SIZE + ARROW_GAP;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left = parseFloat(panel.style.left) || 0;
    let top = parseFloat(panel.style.top) || 0;

    // ---- 1. 获取触发元素的中心 X（document 坐标系），用于绘制箭头指向 ----
    // 优先精确指向过滤图标（.vxe-filter--btn），找不到时回退到列中心
    let triggerCenterX = left + pw / 2;
    if (column && column.id) {
      const colEl = document.querySelector(`.vxe-header--column.${column.id}`);
      if (colEl) {
        const docScrollLeft =
          document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        // 优先查找过滤图标按钮，让箭头精准指向漏斗图标中心
        const filterBtnEl = colEl.querySelector(".vxe-filter--btn");
        const targetEl = filterBtnEl || colEl;
        const targetRect = targetEl.getBoundingClientRect();
        triggerCenterX = docScrollLeft + targetRect.left + targetRect.width / 2;
      }
    }

    // ---- 2. 把面板整体向下挪 ARROW_EXTRA，给箭头留出"表头下方到面板上方"的可见空间 ----
    // 否则伪元素 translate(-100%) 会被表头自身的白色背景挡住看不到
    top += ARROW_EXTRA;

    // ---- 3. 水平边界：保证弹窗整体在视口内 ----
    const docScrollLeft2 =
      document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const minLeft = docScrollLeft2 + margin;
    const maxLeft = docScrollLeft2 + vw - pw - margin;
    if (pw < vw - margin * 2) {
      if (left < minLeft) left = minLeft;
      else if (left > maxLeft) left = maxLeft;
    } else {
      left = minLeft;
      panel.style.maxWidth = `${vw - margin * 2}px`;
    }

    // ---- 4. 垂直边界（也要把箭头空间算进来） ----
    const docScrollTop =
      document.documentElement.scrollTop || document.body.scrollTop || 0;
    const minTop = docScrollTop + margin;
    const maxTop = docScrollTop + vh - ph - margin;
    if (ph < vh - margin * 2) {
      if (top < minTop) top = minTop;
      else if (top > maxTop) top = maxTop;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    // ---- 5. 计算并写入箭头水平偏移（相对于 panel 左上角）----
    // 箭头锚点位置 clamp 在面板宽度内，留出 12px 安全边距防止箭头露出圆角外
    const arrowHalf = ARROW_SIZE; // 三角形底边一半
    let arrowLeft = triggerCenterX - left;
    const arrowMin = 12 + arrowHalf;
    const arrowMax = pw - 12 - arrowHalf;
    if (arrowLeft < arrowMin) arrowLeft = arrowMin;
    else if (arrowLeft > arrowMax) arrowLeft = arrowMax;
    // 通过 CSS 变量传给 ::before / ::after 伪元素（箭头三角形）
    panel.style.setProperty("--vxe-filter-arrow-left", `${arrowLeft}px`);
  }, 0);
};
const onFilterVisible = (payload) => {
  if (!payload || !payload.column) return;
  const column = payload.column;
  if (payload.visible) {
    // 面板打开时：
    // 0) 先恢复所有其他列的未确认快照（切换列时清除草稿，与 vxe-table 过滤逻辑一致）
    //    场景：A 列勾选未确认 → 打开 B 列 → A 列的勾选自动清除（恢复快照）
    const $table = gridRef.value;
    if ($table && $table.getColumns) {
      $table.getColumns().forEach((col) => {
        if (col.id !== column.id && pendingFilterSnapshots[col.id]) {
          restoreFilterSnapshot(col);
        }
      });
    }
    // 1) 保存当前列过滤状态的快照（用于关闭未确认时恢复）
    saveFilterSnapshot(column);
    // 2) bump 对应列的计数器，强制 FilterCheckbox 重新拉取选项
    //    （解决 vxe 组件复用导致数据串列 / 级联条件变化后取到旧数据的问题）
    const field = column.field;
    if (field) bumpFilterRefetchCounter(field);
    clampFilterPanelToViewport(column);
  } else {
    // 面板关闭时：若快照仍存在（未点击确定），恢复到面板打开前的状态
    // vxe-grid 在面板关闭时可能自动设置 opt.checked=true，
    // 通过 nextTick + setTimout 确保在 vxe 内部设置之后再恢复（优先级最后）
    if (pendingFilterSnapshots[column.id]) {
      nextTick(() => {
        setTimeout(() => {
          restoreFilterSnapshot(column);
          // 同步过滤图标高亮（恢复后立即更新 DOM）
          syncFilterHeaderClass();
        }, 0);
      });
    }
  }
};

// ========== 表头过滤 & 排序（渲染器高阶复用）==========
// 收集所有列的过滤条件 + 排序状态，形成「组合过滤」参数
// 关键：active 使用 opt.checked（仅「确认」后的过滤才生效），
//       而非 isFilterActive(data)（避免未确认的草稿改动被收集）
const getFilterSortState = () => {
  const $table = gridRef.value;
  if (!$table) return { filters: [], sorts: [] };
  const cols = $table.getColumns ? $table.getColumns() : [];
  // vxe-grid 的 getColumns() 返回的内部列对象不保留自定义顶层属性（如 defParamKey），
  // 需要从原始 props.columns 配置中按 field 查找 defParamKey / filterRender.props
  const fieldToParamKey = new Map();
  const fieldToRenderProps = new Map();
  (props.columns || []).forEach((col) => {
    if (col.field) {
      fieldToParamKey.set(col.field, col.defParamKey || col.field);
      if (col.filterRender && col.filterRender.props) {
        fieldToRenderProps.set(col.field, col.filterRender.props);
      }
    }
  });
  const filters = [];
  cols.forEach((col) => {
    const fName = col.filterRender && col.filterRender.name;
    if (!fName || !FILTER_DEFAULTS[fName]) return;
    const paramKey = fieldToParamKey.get(col.field) || col.field;
    (col.filters || []).forEach((opt) => {
      filters.push({
        field: col.field,
        // 参数 key：默认取 field，可通过列配置 defParamKey 自定义
        paramKey,
        title: col.title,
        type: fName,
        data: opt.data,
        // 透传 filterRender.props，供 filterStateToParams 读取区间类的 emptyValue 等配置
        props: fieldToRenderProps.get(col.field),
        active: opt.checked,
      });
    });
  });
  const sorts = ($table.getSortColumns ? $table.getSortColumns() : []).map(
    (s) => ({ field: s.field, property: s.property, order: s.order }),
  );
  return { filters, sorts };
};

/**
 * 把列过滤状态数组 -> 扁平请求参数对象 + 涉及的 key 集合
 * 约定（参数 key 默认取 field，可通过列配置 defParamKey 自定义 → f.paramKey）：
 *  FilterInput({ value })       → params[paramKey] = value
 *  FilterCheckbox({ values })   → params[paramKey] = [v1, v2, ...]（始终为数组）
 *
 * 区间类（FilterDateRange / FilterNumberRange）支持 3 种参数呈现方式，
 *   通过列配置 filterRender.props.paramMode 控制（默认 'array'）：
 *   1) paramMode='array'（默认，与 FilterCheckbox 风格一致）：
 *        FilterDateRange({ values: [start, end] })   → params[paramKey] = [start, end]（2 元素数组）
 *        FilterNumberRange({ values: [min, max] })   → params[paramKey] = [min, max]（2 元素数组）
 *   2) paramMode='split'（原始分开传递）：
 *        FilterDateRange   → params[`start${Capitalize(paramKey)}`] = start
 *                        → params[`end${Capitalize(paramKey)}`]   = end
 *        FilterNumberRange → params[`${paramKey}Min`] = min
 *                        → params[`${paramKey}Max`] = max
 *   3) paramMode='both'：同时输出以上两种格式
 *
 * 区间类通用说明：
 *  - 元素位置固定：[first, second]（FilterDateRange=[起, 止]，FilterNumberRange=[min, max]）
 *  - 某一端无值时使用占位值，默认 null，可通过列配置 filterRender.props.emptyValue 自定义（如 ''）
 *  - 两端均无值时不发送对应参数（split 模式下按端独立判断；array / both 模式下整组一起判断）
 */
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const filterStateToParams = (filters) => {
  const params = {};
  const paramKeys = new Set();
  (filters || []).forEach((f) => {
    if (!f || !f.active) return;
    const d = f.data || {};
    // 参数 key：优先使用 paramKey（支持列配置 defParamKey 自定义），回退到 field
    const key = f.paramKey || f.field;
    switch (f.type) {
      case "FilterInput": {
        const v = String(d.value ?? "").trim();
        if (v) {
          params[key] = v;
          paramKeys.add(key);
        }
        break;
      }
      case "FilterCheckbox": {
        const vals = Array.isArray(d.values)
          ? d.values.filter((v) => v != null && v !== "")
          : [];
        if (vals.length) {
          // 多个值始终使用数组传递（而非逗号拼接）
          params[key] = vals;
          paramKeys.add(key);
        }
        break;
      }
      case "FilterDateRange":
      case "FilterNumberRange": {
        const raw = Array.isArray(d.values) ? [...d.values] : [null, null];
        // 补齐为 2 元素数组，保证位置语义稳定
        while (raw.length < 2) raw.push(null);
        // 占位值：默认 null，可通过 filterRender.props.emptyValue 自定义
        const ev =
          f.props && f.props.emptyValue !== undefined
            ? f.props.emptyValue
            : null;
        const normalized = raw.map((v) =>
          v == null || v === "" ? ev : v,
        );
        // paramMode：'array'（默认）/ 'split' / 'both'
        const mode =
          f.props && ["array", "split", "both"].includes(f.props.paramMode)
            ? f.props.paramMode
            : "array";
        // split 两端的 key 命名规则（与原始逻辑保持一致）
        const isDate = f.type === "FilterDateRange";
        const key0 = isDate ? `start${capitalize(key)}` : `${key}Min`;
        const key1 = isDate ? `end${capitalize(key)}` : `${key}Max`;

        if (mode === "array" || mode === "both") {
          // 数组格式：两端至少一端有值才发送
          if (normalized.some((v) => v != null && v !== "")) {
            params[key] = normalized;
            paramKeys.add(key);
          }
        }
        if (mode === "split" || mode === "both") {
          // 分开格式：按端独立判断（某端有值才写）
          if (normalized[0] != null && normalized[0] !== "") {
            params[key0] = normalized[0];
            paramKeys.add(key0);
          }
          if (normalized[1] != null && normalized[1] !== "") {
            params[key1] = normalized[1];
            paramKeys.add(key1);
          }
        }
        break;
      }
    }
  });
  return { params, paramKeys };
};

// 记录上一次过滤写入的 key，下次应用时用来清掉已失效的过滤参数
// （不会影响外部通过 searchParam 写入的非过滤类查询参数）
const lastFilterParamKeys = new Set();

/**
 * 手动同步列头过滤图标高亮 class
 * vxe-grid 不一定在所有版本都自动加 is--filter-active，
 * 这里统一通过遍历列的 opt.checked 状态来手动添加/移除高亮 class。
 * 关键：使用 opt.checked（仅「确认」后的过滤才高亮），
 *       而非 isFilterActive(data)（避免未确认的草稿改动导致图标高亮）
 * 在以下时机调用：
 *  - applyInitParam 默认值同步后
 *  - filter-confirm / filter-reset / filter-reset-all 后
 *  - resetAllFilter 后
 */
const FILTER_ACTIVE_CLASS = "is--filter-active";
const syncFilterHeaderClass = () => {
  const $table = gridRef.value;
  if (!$table || !$table.getColumns) return;
  const cols = $table.getColumns();
  cols.forEach((col) => {
    const fName = col.filterRender && col.filterRender.name;
    if (!fName || !FILTER_DEFAULTS[fName]) return;
    // 使用 opt.checked 判断是否激活（与 vxe-table 列过滤逻辑保持一致）
    const isActive = (col.filters || []).some((opt) => opt.checked);
    // col.id 是 vxe 内部的列标识，形如 "col_17"（已含前缀），直接作为 class 选择器使用
    const colId = col.id;
    const headerCol = colId
      ? document.querySelector(`.vxe-header--column.${colId}`)
      : null;
    if (headerCol) {
      if (isActive) headerCol.classList.add(FILTER_ACTIVE_CLASS);
      else headerCol.classList.remove(FILTER_ACTIVE_CLASS);
    }
  });
};

/**
 * 列过滤 → useTable.search() 联动
 * 仅远程模式（isRemoteMode）生效；静态模式下仅抛出事件由外部处理。
 */
const applyFilterStateAndSearch = (filterSortPayload) => {
  // 无论是否远程模式，都先记录最新的过滤参数 key（即便当前是静态模式，之后切到远程也能正确）
  const { params: filterParams, paramKeys } = filterStateToParams(
    filterSortPayload?.filters || [],
  );

  if (!isRemoteMode.value) return;

  const sp = tableHook.searchParam.value;

  // 1) 清掉上一轮过滤写入但本轮已失效的 key
  lastFilterParamKeys.forEach((k) => {
    if (!paramKeys.has(k)) {
      delete sp[k];
    }
  });

  // 2) 写入本轮生效的过滤 key
  Object.keys(filterParams).forEach((k) => {
    sp[k] = filterParams[k];
  });

  // 3) 同步本轮 key 集合
  lastFilterParamKeys.clear();
  paramKeys.forEach((k) => lastFilterParamKeys.add(k));

  // 4) useTable.search：pageNum 重置为 1 → 更新 totalParam → getTableList
  tableHook.search();
};

/**
 * 把列排序状态数组 -> 请求参数对象 + 涉及的 key 集合
 * 参数 key 名与格式由 props.sortParamConfig 控制：
 *  - 非合并模式（默认）：
 *      单字段：  params[fieldKey] = field          params[orderKey] = 'asc'|'desc'
 *      多字段：  params[fieldKey] = 'a,b'          params[orderKey] = 'asc,desc'
 *  - 合并模式（sortParamConfig.combined = true）：
 *      单字段：  params[combinedKey] = 'field desc'          （分隔符 combinedSeparator，默认空格）
 *      多字段：  params[combinedKey] = 'a desc,b asc'         （项间分隔符 combinedMultiSeparator，默认逗号）
 *    合并模式忽略 fieldKey/orderKey，所有信息写入 combinedKey
 */
const sortStateToParams = (sorts) => {
  const active = (sorts || []).filter(
    (s) => s && s.order && s.order !== "null" && (s.field || s.property),
  );
  if (!active.length) return { params: {}, paramKeys: new Set() };

  const fields = active.map((s) => s.field || s.property);
  const orders = active.map((s) => s.order);

  const cfg = props.sortParamConfig || {};
  const combined = cfg.combined === true;

  if (combined) {
    const combinedKey = cfg.combinedKey || "orderBy";
    const sep =
      cfg.combinedSeparator != null ? cfg.combinedSeparator : " ";
    const multiSep =
      cfg.combinedMultiSeparator != null ? cfg.combinedMultiSeparator : ",";
    // 每项形如 "field order"，项间用 multiSep 连接
    const value = active
      .map((_, i) => `${fields[i]}${sep}${orders[i]}`)
      .join(multiSep);
    return { params: { [combinedKey]: value }, paramKeys: new Set([combinedKey]) };
  }

  const fieldKey = cfg.fieldKey || "sortField";
  const orderKey = cfg.orderKey || "sortOrder";
  const params = {
    [fieldKey]: fields.length === 1 ? fields[0] : fields.join(","),
    [orderKey]: orders.length === 1 ? orders[0] : orders.join(","),
  };
  return { params, paramKeys: new Set([fieldKey, orderKey]) };
};

// 记录上一轮排序写入的 key（随 sortParamConfig 动态变化），与过滤 key 集合互不重叠
const lastSortParamKeys = new Set();

/**
 * 列排序 → useTable.search() 联动
 * 仅远程模式（isRemoteMode）生效；静态模式下仅抛出事件由外部处理。
 */
const applySortStateAndSearch = (sorts) => {
  const { params: sortParams, paramKeys } = sortStateToParams(sorts);
  if (!isRemoteMode.value) return;

  const sp = tableHook.searchParam.value;

  // 1) 若本轮无任何排序，清掉上轮的 sortField/sortOrder
  lastSortParamKeys.forEach((k) => {
    if (!paramKeys.has(k)) delete sp[k];
  });

  // 2) 写入本轮排序参数
  Object.keys(sortParams).forEach((k) => {
    sp[k] = sortParams[k];
  });

  // 3) 同步本轮 key 集合
  lastSortParamKeys.clear();
  paramKeys.forEach((k) => lastSortParamKeys.add(k));

  // 4) 排序变化通常意味着结果顺序完全改变，重置到第一页再请求
  tableHook.search();
};

/**
 * vxe-grid @sort-change 事件处理：
 * 1) 远程模式 → applySortStateAndSearch（联动 useTable）
 * 2) 始终抛出 sort-change 事件，外部可监听
 */
const onSortChange = (payload) => {
  // payload 形如 { field, property, order, column, $table, ... }
  // 多列排序时 vxe 会逐列触发；这里统一通过 getSortColumns() 拿当前所有已排序列
  const $table = gridRef.value;
  const sorts = $table && $table.getSortColumns ? $table.getSortColumns() : [];
  // 初始化期间 vxe sort() 也会触发 sort-change，跳过 useTable 联动避免重复请求
  if (!isApplyingDefaults.value) {
    applySortStateAndSearch(sorts);
  }
  emit("sort-change", payload);
};

// 重置指定列的过滤条件
// 关键：恢复到 initParam.filters 中的默认值（而非清空），避免默认过滤条件丢失
// 若无默认值则回退到 FILTER_DEFAULTS（空值）
const resetColumnFilter = (params) => {
  const col = params && params.column;
  if (!col) return;
  const fName = col.filterRender && col.filterRender.name;
  if (!fName || !FILTER_DEFAULTS[fName]) return;
  // 获取该列的默认 data（优先 initParam.filters，回退 FILTER_DEFAULTS）
  const defaultData = getColumnDefaultData(col.field, fName);
  (col.filters || []).forEach((opt) => {
    if (defaultData) {
      if (opt.data) Object.assign(opt.data, defaultData);
      else opt.data = { ...defaultData };
    } else {
      const fac = FILTER_DEFAULTS[fName];
      if (opt.data) Object.assign(opt.data, fac());
      else opt.data = fac();
    }
    // checked 基于 data 是否有值（有默认值则 checked=true，无则 false）
    opt.checked = isFilterActive(fName, opt.data);
  });
};

// 重置所有列的过滤条件
// 关键：恢复到 initParam.filters 中的默认值（而非清空），避免默认过滤条件丢失
const resetAllFilter = () => {
  const $table = gridRef.value;
  if (!$table) return;
  const cols = $table.getColumns ? $table.getColumns() : [];
  cols.forEach((col) => {
    const fName = col.filterRender && col.filterRender.name;
    if (!fName || !FILTER_DEFAULTS[fName]) return;
    const defaultData = getColumnDefaultData(col.field, fName);
    (col.filters || []).forEach((opt) => {
      if (defaultData) {
        if (opt.data) Object.assign(opt.data, defaultData);
        else opt.data = { ...defaultData };
      } else {
        const fac = FILTER_DEFAULTS[fName];
        if (opt.data) Object.assign(opt.data, fac());
        else opt.data = fac();
      }
      opt.checked = isFilterActive(fName, opt.data);
    });
  });
};

// ========== 过滤选项远程拉取 ==========
// 供 FilterCheckbox 在面板打开时调用：调用 requestFilterAPI 获取选项，
// 并按 filterOptionKeys.label / filterOptionKeys.value 映射为统一的 { label, value } 结构。
// requestFilterAPI 接收组合参数 { field, filters }：
//   - field: 当前要拉取选项的列 field
//   - filters: 所有 FilterCheckbox 列的当前过滤值（含当前列），形如 { role: ['admin'], department: [] }
//     参数 key 默认为列 field，可通过列配置 defParamKey 自定义（如 roleList）
// 返回一个选项数组（Promise）。

// 收集所有 FilterCheckbox 列的当前过滤值，形成组合参数
// 用于 requestFilterAPI 的 POST 请求体，支持多列级联过滤场景
const collectCheckboxFilterParams = () => {
  const $table = gridRef.value;
  if (!$table || !$table.getColumns) return {};
  const cols = $table.getColumns();
  // vxe-grid 的 getColumns() 返回的内部列对象不保留自定义顶层属性（如 defParamKey），
  // 需要从原始 props.columns 配置中按 field 查找 defParamKey
  const fieldToParamKey = new Map();
  (props.columns || []).forEach((col) => {
    if (col.field) {
      fieldToParamKey.set(col.field, col.defParamKey || col.field);
    }
  });
  const params = {};
  cols.forEach((col) => {
    const fName = col.filterRender && col.filterRender.name;
    if (fName !== "FilterCheckbox") return;
    // 参数 key：从原始列配置查找 defParamKey，默认取 field
    const paramKey = fieldToParamKey.get(col.field) || col.field;
    if (!paramKey) return;
    // 合并该列所有 filter option 的已勾选值（通常只有一个 option，但兼容多 option 场景）
    // 关键：仅收集 opt.checked=true（已确认）的过滤值，
    //       避免未确认的草稿改动被传递到远程接口（级联过滤场景）
    const vals = (col.filters || []).flatMap((opt) => {
      if (!opt.checked) return [];
      const v = opt.data && opt.data.values;
      return Array.isArray(v) ? v.filter((x) => x != null && x !== "") : [];
    });
    // 仅在数组非空时写入参数（空数组不传递，避免后端冗余字段）
    if (vals.length > 0) {
      params[paramKey] = vals;
    }
  });
  return params;
};

const fetchFilterOptions = async (field) => {
  if (typeof props.requestFilterAPI !== "function") return null;
  try {
    // 收集所有 FilterCheckbox 列的当前过滤值，形成组合参数
    const filters = collectCheckboxFilterParams();
    let res = await props.requestFilterAPI({ field, filters });
    // 通过 filterDataCallback 对接口返回的原始数据进行二次处理
    // （例如：从 { code, data } 中提取 data、字段重命名、过滤无效项等）
    if (typeof props.filterDataCallback === "function") {
      res = props.filterDataCallback(res);
    }
    const keys = props.filterOptionKeys || {};
    const labelKey = keys.label || "label";
    const valueKey = keys.value || "value";
    return (Array.isArray(res) ? res : []).map((item) => ({
      label: item[labelKey],
      value: item[valueKey],
    }));
  } catch (e) {
    return null;
  }
};

// 向过滤渲染器面板提供上下文（provide/inject 跨 vxe 的 Teleport 仍按组件树生效）
provide("tableProFilterContext", {
  gather: getFilterSortState,
  fetchFilterOptions,
  // 标记当前是否启用了远程过滤选项（FilterCheckbox 据此决定远程/静态模式）
  hasRemoteFilterAPI: () => typeof props.requestFilterAPI === "function",
  // 每列重新拉取计数器：面板每次打开都会 bump，FilterCheckbox 监听后强制重新 fetch
  // （解决组件复用导致数据串列、级联条件变化后取到旧数据的问题）
  filterRefetchCounter,
  clearCurrent: resetColumnFilter,
  clearAll: resetAllFilter,
  emitConfirm: (params) => {
    // 清除快照（确认的改动保留，面板关闭时不再恢复）
    const col = params && params.column;
    if (col) clearFilterSnapshot(col);
    const payload = getFilterSortState();
    // 列过滤确认 → useTable.search() 联动
    applyFilterStateAndSearch(payload);
    // 同步过滤图标高亮
    nextTick(() => syncFilterHeaderClass());
    emit("filter-confirm", payload);
  },
  // 单列表头重置：抛出被重置列的 field/title + 最新组合参数
  emitReset: (params) => {
    const col = params && params.column;
    // 更新快照为重置后的状态（重置立即生效，后续关闭面板不再恢复到重置前）
    if (col) updateFilterSnapshot(col);
    const info = col ? { field: col.field, title: col.title } : {};
    const payload = { column: info, ...getFilterSortState() };
    // 单列重置 → useTable.search() 联动
    applyFilterStateAndSearch(payload);
    // 同步过滤图标高亮
    nextTick(() => syncFilterHeaderClass());
    emit("filter-reset", payload);
  },
  emitResetAll: () => {
    const payload = getFilterSortState();
    // 全部重置 → useTable.search() 联动
    applyFilterStateAndSearch(payload);
    // 同步过滤图标高亮
    nextTick(() => syncFilterHeaderClass());
    emit("filter-reset-all", payload);
  },
  closePanel: (params) =>
    params &&
    params.$table &&
    params.$table.closeFilter &&
    params.$table.closeFilter(),
});

// ========== 工具栏「刷新」按钮处理 ==========
// vxe-table 内置刷新按钮不触发 toolbar-button-click，而是调用 refreshOptions.queryMethod
// 通过 queryMethod 接管内置刷新按钮：远程模式根据当前搜索条件重新请求 + 抛出 refresh 事件
const handleToolbarRefresh = () => {
  // 抛出自定义 refresh 事件，参数为当前所有过滤 + 排序条件
  const state = getFilterSortState();
  emit("refresh", state);
  // 远程模式：根据当前搜索条件（过滤+排序）重新触发请求
  if (isRemoteMode.value) {
    // 从 vxe-grid 列状态重新同步过滤参数到 searchParam（确保默认值/用户修改值不丢失）
    const { params: filterParams, paramKeys } = filterStateToParams(
      state.filters,
    );
    const sp = tableHook.searchParam.value;
    // 清掉已失效的过滤 key
    lastFilterParamKeys.forEach((k) => {
      if (!paramKeys.has(k)) delete sp[k];
    });
    // 写入当前过滤参数
    Object.keys(filterParams).forEach((k) => {
      sp[k] = filterParams[k];
    });
    lastFilterParamKeys.clear();
    paramKeys.forEach((k) => lastFilterParamKeys.add(k));
    // updatedTotalParam 确保 searchParam（过滤/排序参数）已同步到 totalParam
    tableHook.updatedTotalParam();
    return tableHook.getTableList();
  }
  return Promise.resolve();
};

// ========== 工具栏按钮点击 ==========
// 处理通过 toolbarConfig.buttons 传入的自定义按钮
const onToolbarButtonClick = ({ code, button }) => {
  emit("toolbar-button-click", { code, button });
};

// 内置「重置过滤」工具按钮点击：清空所有列过滤条件并触发重置事件
const onResetAllFilter = () => {
  resetAllFilter();
  // 清除所有待恢复的快照（工具栏重置优先于面板草稿）
  Object.keys(pendingFilterSnapshots).forEach((k) => {
    delete pendingFilterSnapshots[k];
  });
  const payload = getFilterSortState();
  // 工具栏「重置所有过滤」→ useTable.search() 联动
  applyFilterStateAndSearch(payload);
  // 同步过滤图标高亮
  nextTick(() => syncFilterHeaderClass());
  // 抛出自定义事件，参数为当前所有过滤 + 排序条件（清空后的状态）
  emit("filter-reset-all", payload);
  emit("reset-filter", payload);
};

// 是否存在列过滤配置（基于 mergedColumns 判断，兼容 filterType 自动注入的情况）
const hasColumnFilter = computed(() =>
  mergedColumns.value.some(
    (col) => col.filters && col.filters.length > 0 && col.filterRender,
  ),
);

// ========== 工具栏配置（vxe-grid 配置式）==========
const toolbarConfig = computed(() => {
  if (!props.showToolbar) return;
  const userCfg = props.toolbarConfig || {};
  const cfg = {
    custom: props.showColumnSetting ? true : null,
    zoom: true,
    refresh: true,
    refreshOptions: {
      icon: "vxe-icon-refresh",
      queryMethod: handleToolbarRefresh,
    },
    ...userCfg,
  };
  // 用户自定义按钮走 buttons 数组，用户自定义插槽内容走 buttonSuffix；
  // 内置「重置过滤」走 toolSuffix 插槽（右侧工具区，刷新按钮左侧）。
  cfg.buttons = [...(userCfg.buttons || [])];
  cfg.slots = {
    toolSuffix: "toolbarToolSuffix",
    ...(userCfg.slots || {}),
    buttons: "toolbarButtons",
  };
  // 清理空值
  Object.keys(cfg).forEach((k) => cfg[k] == null && delete cfg[k]);
  return cfg;
});

// ========== 列个性化配置 ==========
const customConfig = computed(() => ({
  mode: "popover", // 列个性化面板模式：'modal' | 'drawer' | 'popover'
  allowVisible: true, // 列显示/隐藏
  storage: props.customStorage, // 记忆到 localStorage
  ...props.customConfig,
}));

// ========== 外部插槽透传（插槽式渲染）==========
// 透传规则（取并集）：
//   1) 列配置中字符串引用的 slot 名：通过 `render: 'xxx'` / `headerRender: 'xxx'`
//      引用的任意具名插槽（如 operation / cell_role / header_phone）都会被透传
//      给 vxe-grid 对应列的 default/header 插槽，实现"结合列配置"的插槽式渲染。
//   2) 外部传入的 `cell_` / `edit_` / `header_` 前缀插槽：即使列未显式 render 字符串
//      引用，也宽松透传，便于直接通过 vxe 原生 `slots.default = 'cell_role'` 使用。
// 用法示例：
//   - 列里写 render: 'operation'                  → <template #operation="{ row }">
//   - 列里写 render: 'cell_role'                  → <template #cell_role="{ row }">
//   - 列里写 headerRender: 'header_phone'         → <template #header_phone="{ column }">
//   - 操作列专用快捷：{ field: 'action', render: 'operation' } + <template #operation>
const passthroughSlotNames = computed(() => {
  const nameSet = new Set()

  // (1) 从列配置中收集字符串引用的 slot 名
  ;(mergedColumns.value || []).forEach((col) => {
    if (!col || typeof col !== 'object') return
    const collectFrom = (val) => {
      if (typeof val === 'string' && val && slots && typeof slots[val] === 'function') {
        nameSet.add(val)
      }
    }
    collectFrom(col.render)
    collectFrom(col.headerRender)
    // 兼容 vxe 原生 slots.default/header 字符串引用
    if (col.slots && typeof col.slots === 'object') {
      collectFrom(col.slots.default)
      collectFrom(col.slots.header)
      collectFrom(col.slots.edit)
    }
  })

  // (2) 宽松透传 cell_ / edit_ / header_ 前缀的外部具名插槽
  if (slots && typeof slots === 'object') {
    Object.keys(slots).forEach((n) => {
      if (n.startsWith('cell_') || n.startsWith('edit_') || n.startsWith('header_')) {
        nameSet.add(n)
      }
    })
  }

  return Array.from(nameSet)
})

// ========== vxe-grid 属性 ==========
// 父组件传入的、未在 defineProps 中声明的 vxe-grid 原生属性会进入 attrs，
// 这里通过展开 attrs 实现属性透传；class / style 排除（绑定到根元素 .table-pro）。
// 显式声明的 props 写在后面，优先级更高，避免被透传属性意外覆盖。
const gridProps = computed(() => {
  const { class: _class, style: _style, ...restAttrs } = attrs;
  return {
    ...restAttrs,
    id: props.tableId || undefined,
    border: props.border,
    stripe: props.stripe,
    round: props.round,
    height: props.height,
    size: currentDensity.value,
    rowConfig: { isHover: true, ...props.rowConfig },
    checkboxConfig: props.checkboxConfig,
    radioConfig: props.radioConfig,
    // keepSource 是 vxe-table 的根级 prop（非 editConfig 属性），
    // 必须放在根级，vxe-table 才会缓存源数据快照，isUpdateByRow 才能正确判断 dirty 状态，
    // 进而给单元格 td 加上 col--dirty 类，渲染编辑标记。
    keepSource: true,
    editConfig: {
      trigger: "click",
      mode: "cell",
      showStatus: true,
      ...props.editConfig,
    },
    sortConfig: { trigger: "button", ...props.sortConfig },
    filterConfig: { remote: true, ...props.filterConfig },
    treeConfig: props.treeConfig,
    expandConfig: props.expandConfig,
    columnConfig: { resizable: true, ...props.columnConfig },
    columns: mergedColumns.value,
    // 远程模式使用 useTable 接管的数据；静态模式使用外部传入的 data
    data: renderData.value,
    toolbarConfig: toolbarConfig.value,
    customConfig: customConfig.value,
  };
});

// ========== 分页（element-plus，抽离到 ./components/Pagination.vue）==========
/**
 * 子 Pagination 组件 change 事件统一入口
 * 子组件已自行计算并 emit 最新的 pagerConfig（{ currentPage, pageSize, total, ... }）
 * 这里负责：
 *  1) 远程模式：派发到 useTable 的 handleSizeChange / handleCurrentChange
 *  2) 静态模式：透传 update:pagerConfig 给父组件
 *  3) 始终 emit("page-change", newPager) 供外部监听
 */
const onPagerChange = (newPager) => {
  // 远程模式：交给 useTable（其内部会重新拉取数据）
  if (isRemoteMode.value) {
    // size 变化 → useTable 内部会重置 pageNum=1 并重新拉取
    if (newPager.pageSize !== currentPager.value.pageSize) {
      tableHook.handleSizeChange(newPager.pageSize);
    }
    // currentPage 变化 → useTable 仅切换页码拉取
    if (newPager.currentPage !== currentPager.value.currentPage) {
      tableHook.handleCurrentChange(newPager.currentPage);
    }
    emit("page-change", currentPager.value);
    return;
  }
  // 静态模式：透传给父组件
  emit("update:pagerConfig", newPager);
  emit("page-change", newPager);
};

// ========== 暴露常用方法 ==========
defineExpose({
  gridRef,
  getData: () => gridRef.value?.getTableData?.()?.fullData || [],
  getCheckboxRecords: () => gridRef.value?.getCheckboxRecords?.() || [],
  getRadioRecord: () => gridRef.value?.getRadioRecord?.() || null,
  clearCheckboxRow: () => gridRef.value?.clearCheckboxRow?.(),
  setCheckboxRow: (rows, checked) =>
    gridRef.value?.setCheckboxRow?.(rows, checked),
  toggleCheckboxRow: (rows) => gridRef.value?.toggleCheckboxRow?.(rows),
  clearRadioRow: () => gridRef.value?.clearRadioRow?.(),
  scrollTo: (x, y) => gridRef.value?.scrollTo?.(x, y),
  scrollToRow: (row) => gridRef.value?.scrollToRow?.(row),
  scrollToColumn: (col) => gridRef.value?.scrollToColumn?.(col),
  clearSort: () => gridRef.value?.clearSort?.(),
  clearFilter: () => gridRef.value?.clearFilter?.(),
  exportData: (opts) => gridRef.value?.exportData?.(opts),
  // 重置所有列的过滤条件
  resetAllFilter,
  // 获取当前「过滤 + 排序」组合参数
  getFilterSortState,
  // ========== useTable 暴露（远程模式可用）==========
  // 主动拉取表格数据
  getTableList: tableHook.getTableList,
  // 触发查询（重置到第一页 + 拉取）
  search: tableHook.search,
  // 重置查询条件并拉取
  reset: tableHook.reset,
  // 当前表格数据（远程模式下的响应式引用）
  tableData: tableHook.tableData,
  // 分页信息（远程模式下的响应式引用）
  pageable: tableHook.pageable,
  // 查询参数（远程模式下的响应式引用）
  searchParam: tableHook.searchParam,
});
</script>

<template>
  <div class="table-pro" :class="attrs.class" :style="attrs.style">
    <div class="table-pro__body">
      <vxe-grid
        ref="gridRef"
        v-bind="gridProps"
        @toolbar-button-click="onToolbarButtonClick"
        @sort-change="onSortChange"
        @checkbox-change="(e) => emit('checkbox-change', e)"
        @checkbox-all="(e) => emit('checkbox-all', e)"
        @radio-change="(e) => emit('radio-change', e)"
        @cell-click="(e) => emit('cell-click', e)"
        @cell-dblclick="(e) => emit('cell-dblclick', e)"
        @row-click="(e) => emit('row-click', e)"
        @row-dblclick="(e) => emit('row-dblclick', e)"
        @filter-visible="onFilterVisible"
        @edit-activated="onEditActivated"
        @edit-closed="onEditClosed"
      >
        <template #toolbarButtons="scope">
          <slot name="toolbarButtons" v-bind="scope" />
        </template>
        <template #toolbarToolSuffix="scope">
          <vxe-button
            v-if="showResetFilter && hasColumnFilter"
            circle
            icon="vxe-icon-funnel-clear"
            title="重置过滤"
            class="table-pro__reset-filter-btn"
            @click="onResetAllFilter"
          />
          <slot name="toolbarToolSuffix" v-bind="scope" />
        </template>

        <!-- ========== 插槽式渲染：外部 cell_xxx / edit_xxx 具名插槽透传 ==========
             用法：
             <TablePro :columns="columns">
               <template #cell_role="{ row }">
                 <el-tag>{{ row.role }}</el-tag>
               </template>
               <template #edit_role="{ row }">
                 <el-select v-model="row.role">...</el-select>
               </template>
             </TablePro>
        -->
        <template
          v-for="slotName in passthroughSlotNames"
          :key="slotName"
          #[slotName]="scope"
        >
          <slot :name="slotName" v-bind="scope" />
        </template>
      </vxe-grid>
    </div>
    <Pagination
      v-if="showPager"
      :visible="showPager"
      :pager-config="currentPager"
      @change="onPagerChange"
    />
  </div>
</template>

<style scoped lang="scss">
// 工具栏图标按钮间距（用于工具栏与表格右边框的间距对齐）
$table-toolbar-gap: 12px;

.table-pro {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-light, #ebeef5);
  border-radius: 4px;
  overflow: hidden;

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;

    :deep(.vxe-grid) {
      width: 100%;
      height: 100%;
    }

    // ========== 列头布局：标题与排序/过滤图标 按 headerAlign 差异化处理 ==========
    // vxe-table 4.x 列头结构：
    //   <th class="vxe-header--column col--left|center|right ...">
    //     <div class="vxe-cell">  <!-- flex 容器 -->
    //       <div class="vxe-cell--wrapper vxe-header-cell--wrapper">  <!-- 默认 block -->
    //         <span class="vxe-cell--title">姓名</span>
    //         <span class="vxe-cell--sort">...</span>
    //         <span class="vxe-cell--filter">...</span>
    //       </div>
    //     </div>
    //   </th>
    // vxe-table 已根据 headerAlign 自动给表头 th 加 col--left/center/right class。
    // 策略：
    // - col--left：title 占剩余空间 + 图标靠右（两端对齐），视觉上"图标在列头右端"
    // - col--center/right：保持默认 block，title 与图标一起作为 inline 内容，
    //   跟随列头 text-align 整体居中/右对齐，避免两端对齐导致标题被推到左侧而图标撑到右/中间。
    :deep(.vxe-header--column.col--left) {
      .vxe-cell--wrapper.vxe-header-cell--wrapper {
        display: flex;
        align-items: center;
        width: 100%;

        // 标题占据剩余空间，把后续排序/过滤按钮挤到右端
        .vxe-cell--title {
          margin-right: auto;
        }
      }
    }

    // ========== 列过滤/排序图标高亮（与对齐方式无关，所有列统一生效）==========
    :deep(.vxe-header--column) {
      // 让过滤按钮相对定位，便于角标定位
      .vxe-filter--btn {
        position: relative;
      }

      // 过滤图标激活态（主色 + 角标提示）
      &.is--filter-active,
      &.col--filter.is--filter-active {
        .vxe-filter--btn {
          color: var(--el-color-primary, #409eff) !important;
        }
        .vxe-filter--btn::after {
          content: "";
          position: absolute;
          top: -2px;
          right: -2px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--el-color-danger, #f56c6c);
          display: block;
        }
      }

      // 排序图标激活态（主色高亮 asc/desc 激活按钮）
      &.is--sort-active {
        .vxe-sort--asc-btn.is--active,
        .vxe-sort--desc-btn.is--active {
          color: var(--el-color-primary, #409eff) !important;
        }
      }
    }
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary, #303133);
    margin-right: 8px;
    white-space: nowrap;
  }

  &__search {
    width: 200px;
  }

  // 工具栏内 element-plus 组件与 vxe 工具栏间距对齐
  :deep(.vxe-toolbar) {
    // 工具栏左右内边距 = 按钮间距，让工具栏内容与表格右边框形成与按钮间距等大的间距
    padding-left: $table-toolbar-gap;
    padding-right: $table-toolbar-gap;

    .table-pro__title {
      align-self: center;
    }

    // 内置「重置过滤」按钮与刷新等内置工具按钮间距保持一致
    .table-pro__reset-filter-btn {
      margin-right: var(--vxe-ui-button-current-margin-left, 0.8em);
    }
  }

  :deep(.el-dropdown-menu__item.is-active) {
    color: var(--el-color-primary, #409eff);
    font-weight: 600;
  }
}
</style>

<!--
  全局样式（非 scoped）
  ===============
  vxe-table filter popover 在 filterConfig.transfer=true 时被 Teleport 到 body，
  scoped 样式无法选中，必须用独立的非 scoped <style> 块来约束其宽度与溢出行为。
-->
<style lang="scss">
// ======= 变量定义 =======
$vxe-filter-arrow-size: 8px;
$vxe-filter-arrow-gap: 2px; // 箭头底部与面板顶部边框之间的视觉安全间距
// 弹出框相对于触发点的向下偏移 = 箭头高度 + 额外间隔（给 `transform: translate(-50%,-100%)` 留出绘制箭头的空间）
$vxe-filter-panel-offset: $vxe-filter-arrow-size + $vxe-filter-arrow-gap;

// ======= 面板主样式 =======
// !important 提升优先级，确保在 vxe 自带的 .vxe-table--filter-wrapper 之上生效
.vxe-table--filter-wrapper.is--active {
  max-width: min(92vw, 420px) !important;
  box-sizing: border-box;
  overflow-wrap: anywhere;

  // 面板本体背景/边框/阴影（覆盖 vxe 自带的 base-popup 色）
  background-color: #ffffff !important;
  border: 1px solid var(--el-border-color-lighter, #dcdfe6) !important;
  border-radius: 6px !important;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08) !important;
  // 给本体上边缘留白，让箭头能"露"在面板外面之上；
  // 同时避免 padding-top 导致内部内容下移：改用 top-offset 的伪元素单独绘制箭头
}

// ======= 三角形箭头（指向触发列）=======
// 使用两个伪元素叠加形成「带边框、实心底色」的三角形效果
.vxe-table--filter-wrapper.is--active::before,
.vxe-table--filter-wrapper.is--active::after {
  content: "";
  position: absolute;
  top: 0;
  left: var(--vxe-filter-arrow-left, 50%);
  transform: translate(-50%, -100%); // 把三角形整个挪到面板上边缘"上方"
  width: 0;
  height: 0;
  pointer-events: none;
  display: block !important; // 确保一定渲染（防止任何全局样式把 ::before/::after 设为 none）
  visibility: visible !important;
}

// 外层：灰色边框三角（比内层大 1px）
.vxe-table--filter-wrapper.is--active::before {
  border-left: #{$vxe-filter-arrow-size + 1px} solid transparent !important;
  border-right: #{$vxe-filter-arrow-size + 1px} solid transparent !important;
  border-bottom: #{$vxe-filter-arrow-size + 1px} solid
    var(--el-border-color-lighter, #dcdfe6) !important;
  z-index: 0;
}

// 内层：白色实心三角（比外层小 1px，叠在上面，只让外层底部露出 1px "边"）
.vxe-table--filter-wrapper.is--active::after {
  border-left: #{$vxe-filter-arrow-size} solid transparent !important;
  border-right: #{$vxe-filter-arrow-size} solid transparent !important;
  // 把内层往下 1px，刚好嵌入边框三角的内部
  margin-top: 1px;
  border-bottom: #{$vxe-filter-arrow-size} solid #ffffff !important;
  z-index: 1;
}

// ======= 箭头正下方的 border 遮罩：让三角形底边"接"到面板顶边，不留缝隙 =======
// 利用一条 2px 高的白色块盖住箭头正下方的面板 top-border
.vxe-table--filter-wrapper.is--active {
  // 借助自定义属性计算遮罩位置
  --vxe-filter-cover-left: calc(
    var(--vxe-filter-arrow-left, 50%) - #{$vxe-filter-arrow-size}
  );
}
.vxe-table--filter-wrapper.is--active
  > .vxe-table--filter-wrapper--arrow-cover {
  position: absolute;
  top: -1px;
  left: var(--vxe-filter-cover-left);
  width: #{$vxe-filter-arrow-size * 2};
  height: 3px;
  background: #ffffff;
  z-index: 2;
  pointer-events: none;
}

// 面板内的 FilterPanel 容器
.vxe-table--filter-wrapper.is--active .filter-panel {
  max-width: 100%;
  box-sizing: border-box;
}

// el-date-picker（daterange 类型）在 element-plus 中的类名组合较复杂，
// 需要覆盖 .el-range-editor 的 width 与 min-width，否则有值时出现的清空按钮会撑宽输入框
.vxe-table--filter-wrapper.is--active {
  .el-date-editor.el-input,
  .el-date-editor.el-range-editor,
  .el-date-editor {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box;
  }

  // 两个日期 input 使用 flex 自适应，不超出容器
  .el-range-editor {
    .el-range-input-wrapper {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
    }

    .el-range-input {
      min-width: 0;
      width: 100%;
    }
  }
}

// ======= 编辑态：约束 Element Plus 输入类组件不超出单元格宽度 =======
// vxe-table 编辑激活时，单元格 td.vxe-body--column 会带 col--active class，
// 内部 .vxe-cell 内渲染 Element Plus 编辑组件。
// Element Plus 默认宽度（如 .el-input-number 150px、.el-date-editor 220px）会超出窄列单元格，
// 这里统一覆盖为 100%，并保证 box-sizing 一致。
.vxe-table {
  .vxe-body--column.col--active {
    // 让 .vxe-cell 在编辑态下成为定宽容器，使内部 100% 子元素能正确收缩
    > .vxe-cell {
      width: 100%;
      box-sizing: border-box;

      // 1) 所有 Element Plus 输入类组件本体宽度统一 100%
      .el-input,
      .el-input-number,
      .el-input__wrapper,
      .el-select,
      .el-select-v2,
      .el-date-editor,
      .el-time-editor,
      .el-time-picker,
      .el-time-select {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box;
      }

      // 2) InputNumber 内部输入框自适应（+/- 按钮采用绝对定位，不影响布局）
      .el-input-number {
        .el-input__wrapper {
          padding-left: 8px;
          padding-right: 8px;
        }
      }

      // 3) DatePicker / TimePicker 范围选择器内部 input 自适应（避免清空按钮撑宽）
      .el-range-editor {
        .el-range-input-wrapper {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
        }
        .el-range-input {
          min-width: 0;
          width: 100%;
        }
      }
    }
  }
}

// body 级兜底：即使任何 popover 计算位置出错，也不要出现页面级横向滚动条
body {
  overflow-x: hidden;
}
</style>
