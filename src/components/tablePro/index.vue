<script setup>
/**
 * TablePro 基于 vxe-grid 二次封装的通用表格组件（详细使用说明见 README.md）。
 * 工具栏所需的 vxe-pc-ui 组件在 main.js 中按需引入，分页与加载遮罩使用 element-plus。
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
  toHandlerKey,
  camelize,
  mergeProps,
} from "vue";
// 注册表头过滤渲染器（高阶复用），作为模块副作用执行一次
import "./renderers/renderers.js";
import { FILTER_DEFAULTS, isFilterActive } from "./filters/filter-config.js";
// 事件清单（vxe-grid 透传事件 + TablePro 自身事件），用于 defineEmits 与原生事件转发
import { FORWARD_GRID_EVENTS, TABLE_PRO_EVENTS } from "./utils/events.js";
import { useTable } from "@/hooks/useTable";
import { useSelection } from "@/hooks/useSelection";
// 抽离的分页组件
import Pagination from "./pagination/Pagination.vue";
// 本地过滤 + 排序（localFilterSort=true 时对当前数据生效，与是否传 requestApi 无关）
import { applyLocalFilterSort } from "./utils/localFilterSort.js";
// 列配置构建（mergedColumns 纯逻辑：render/headerRender/editRender/filterType 简写注入等）
import {
  buildColumns,
  findColumnByField,
  forEachLeafColumn,
  resolveParamKey,
} from "./utils/columns.js";
// 过滤/排序状态 → 请求参数（纯函数）
import { filterStateToParams, sortStateToParams } from "./utils/params.js";
// 过滤面板草稿快照 + 默认过滤值构建（纯函数）
import {
  buildFilterDataFromDefault,
  saveFilterSnapshot,
  restoreFilterSnapshot,
  updateFilterSnapshot,
  clearFilterSnapshot,
  getColumnDefaultData,
} from "./utils/filterState.js";
// 过滤 popover 二次定位 + 滚动跟随
import { useFilterPanelPosition } from "./composables/useFilterPanelPosition.js";

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
  rowConfig: { type: Object, default: () => ({ keyField: "id" }) },
  checkboxConfig: { type: Object, default: () => ({}) },
  radioConfig: { type: Object, default: () => ({}) },
  // 收集复选数据所使用的 key：未传时回退到 rowConfig.keyField（与 vxe-grid 行主键一致）
  selectionKey: { type: String, default: "" },
  sortConfig: {
    type: Object,
    default: () => ({ remote: true, multiple: false, trigger: "button" }),
  },
  // ========== 排序参数 key 自定义配置 ==========
  // 远程排序时控制发送到后端的参数 key 与格式（详细参数说明见 README）
  sortParamConfig: { type: Object, default: () => ({}) },
  // 过滤配置：remote=true（外部根据 filter-confirm 自行过滤），transfer=true 避免面板越界
  filterConfig: {
    type: Object,
    default: () => ({ remote: true, transfer: true }),
  },
  // ========== 本地过滤 + 排序开关（与是否传 requestApi 无关，独立布尔控制）==========
  // true（开启）：后端不参与列过滤/排序 —— 组件对当前数据全量本地过滤 + 排序后再渲染，
  //   FilterCheckbox 面板打开时也不会调用 requestFilterAPI（回退列配置的静态 options）；
  // false（关闭，默认）：后端参与 —— 过滤/排序参数随 requestApi 远程检索，
  //   FilterCheckbox 选项由 requestFilterAPI 远程提供（未传则仍回退静态 options）。
  localFilterSort: { type: Boolean, default: false },
  treeConfig: { type: Object, default: () => ({}) },
  expandConfig: { type: Object, default: () => ({}) },
  columnConfig: { type: Object, default: () => ({}) },
  // 单元格编辑配置（vxe editConfig）：keepSource=true 保留源数据用于编辑对比脏数据
  editConfig: {
    type: Object,
    default: () => ({
      trigger: "click",
      mode: "cell",
      showStatus: true,
      keepSource: true,
    }),
  },
  // 全局可编辑开关（权限控制）：false 时所有列均不可编辑
  //   - 不设置 col.editable → 表头不显示编辑图标
  //   - 不传 editConfig → 点击单元格不会进入编辑态（即使组件配置了 editRender）
  //   - 对象式 editRender 的 slots.default label 回退仍生效（仅显示，不可编辑）
  editable: { type: Boolean, default: false },
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
  // 是否需要分页组件（默认 true ）
  pagination: { type: Boolean, default: true },
  pagerConfig: {
    type: Object,
    default: () => ({ currentPage: 1, pageSize: 10, total: 0 }),
  },
  // 分页切换前置拦截（透传内部分页组件，见 Pagination.vue）：
  // 返回 false 或 Promise reject（含 resolve 为 false）时阻止切换页码/分页大小并回滚 UI
  beforePageChange: { type: Function, default: null },

  // ========== 远程数据模式相关 props ==========
  // 请求表格数据的 api（传入即进入远程模式，由 useTable 接管数据与分页）
  requestApi: { type: Function, default: null },
  // 是否自动执行请求 api（默认 true，挂载后自动发起首次请求）
  requestAuto: { type: Boolean, default: true },
  // 表格 api 请求错误监听
  requestError: { type: Function, default: null },
  // 返回数据的回调函数，可以对数据进行处理
  dataCallback: { type: Function, default: null },
  // 过滤选项远程接口（FilterCheckbox 列在面板打开时自动拉取）
  // 接收组合参数 { field, filters }，返回选项数组（Promise）
  requestFilterAPI: { type: Function, default: null },
  // 过滤选项远程接口返回数据的回调函数，可以对数据进行处理
  filterDataCallback: { type: Function, default: null },
  // 过滤选项 label/value 自定义键名，默认 { label: "label", value: "value" }
  filterOptionKeys: {
    type: Object,
    default: () => ({ label: "label", value: "value" }),
  },

  // ========== 默认参数（初始化时应用并同步到表格 UI）==========
  // 形如：{ pageNum, pageSize, sortField, sortOrder, filters: { [field]: ... } }
  initParam: { type: Object, default: () => ({}) },

  // ========== 列公共配置（减少 columns 中重复配置）==========
  // 对所有数据列自动合并，列自身配置优先级更高。内置默认 { showOverflow:'tooltip', minWidth:120 }
  // 注：filterDefaults 由组件内部 DEFAULT_FILTER_CONFIG 提供，无需在此重复配置
  defaultColumnConfig: {
    type: Object,
    default: () => ({ showOverflow: "tooltip", minWidth: 120 }),
  },

  // ========== 单元格编辑：预置选项数组 ==========
  // 按列 field 索引，用于 ElSelect/ElRadio/ElCheckbox 等需要 options 的编辑控件
  editOptions: { type: Object, default: () => ({}) },

  // ========== 单元格编辑：各列编辑控件的额外公共 props（按 field 索引）==========
  cellEditProps: { type: Object, default: () => ({}) },

  // ========== 单元格编辑校验规则（透传 vxe-grid editRules）==========
  // 形如：{ remark: [{ required: true, message: '请输入备注', trigger: 'change' }] }
  // 配合暴露的 validate / fullValidate / clearValidate 方法在提交时触发
  editRules: { type: Object, default: () => ({}) },
});

// 声明组件 emits：vxe-grid 透传事件 + TablePro 自身事件
const emit = defineEmits([...FORWARD_GRID_EVENTS, ...TABLE_PRO_EVENTS]);

const slots = useSlots();
const attrs = useAttrs();
const gridRef = ref();

// ========== 单选/多选数据收集（useSelection）==========
// 收集 checkbox-change / radio-change 事件抛出的选中行，按 selectionKey 提取 id
// selectionKey 未传时回退到 rowConfig.keyField（响应式：随 prop 变化更新）
const effectiveSelectionKey = computed(
  () => props.selectionKey || props.rowConfig?.keyField || "id",
);
const {
  // 多选
  isSelected,
  selectedList,
  selectedListIds,
  selectionChange,
  // 单选
  selectedRow,
  selectedId,
  isRadioSelected,
  radioChange,
  // 通用
  clearSelection,
} = useSelection(effectiveSelectionKey);

// ========== 单元格编辑上下文 ==========
// 给 mergedColumns 内部使用，同时 provide 供 inject 扩展
const editContextRef = {
  onCellEditChange: (params) => emit("cell-edit-change", params),
};
const getEditContext_ = () => editContextRef;
provide("tableProEditContext", {
  editOptions: computed(() => props.editOptions || {}),
  cellEditProps: computed(() => props.cellEditProps || {}),
  onCellEditChange: editContextRef.onCellEditChange,
});

// ========== 单元格编辑态本地值管理 ==========
// 进入编辑时复制原始值到 editLocalState[key]，退出编辑（edit-closed）时统一提交，
// 避免 slots 函数内创建 ref/watch 副作用导致 vxe 状态机混乱
const editLocalState = reactive({});
let _rowAutoIdSeq = 0;
const ROW_ID_KEY = Symbol("__tblRowId");
const resolveEditStateKey = (row, field) => {
  if (!row) return `__no_row__:${String(field)}`
  // 优先用稳定 ID，无则自动分配
  const stableId = row.id != null ? `id:${row.id}` : (row[ROW_ID_KEY] != null ? `auto:${row[ROW_ID_KEY]}` : null)
  const prefix = stableId != null
    ? stableId
    : `auto:${(row[ROW_ID_KEY] = ++_rowAutoIdSeq)}`
  return `${prefix}:${String(field)}`
}
// 进入编辑态：用 row[field] 初始化本地值
// 自动弹出由 utils/columns.js 中 buildObjectEditSlotFn 的 onVnodeMounted 钩子处理（更可靠）
const onEditActivated = (params) => {
  const row = params && params.row
  const field = params && params.column && params.column.field
  if (!row || !field) return
  const key = resolveEditStateKey(row, field)
  editLocalState[key] = row[field]
}
// 退出编辑态：写回 row + 发射 cell-edit-change + 清理本地态
// 分流：对象式 editLocalState 存新值 → 写回 row；
//   函数式/字符串式用户已直接绑 row[field] → 不覆盖 row，以 row[field] 为新值发射
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
    // 函数式/字符串式：row[field] 已是新值，editLocalState 是旧值快照，不覆盖 row
    newValue = row[field]
    oldValue = editLocalState[key]
  } else {
    // 对象式：editLocalState 是新值，row[field] 是旧值
    newValue = editLocalState[key]
    oldValue = row[field]
    // 注：直接赋值 row[field]，不调用 $table.setCellValue，避免触发 vxe 重新进入编辑态
    try {
      row[field] = newValue
    } catch (e) { /* noop */ }
  }

  try { delete editLocalState[key] } catch (e) { editLocalState[key] = undefined }

  // 仅值变化才发射 cell-edit-change
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

// FilterCheckbox 列的重新拉取计数器：面板每次打开 bump 一次，强制重新 fetch 避免数据串列
const filterRefetchCounter = reactive({});
const bumpFilterRefetchCounter = (field) => {
  if (!field) return;
  filterRefetchCounter[field] = (filterRefetchCounter[field] || 0) + 1;
};

// ========== 过滤面板草稿快照 ==========
// vxe-grid 面板关闭时可能自动设置 opt.checked=true，导致未确认草稿被标记为已激活
// 快照机制：打开→保存；确认→清除；重置→更新基线；关闭且未确认→恢复
// 快照读写逻辑见 utils/filterState.js（纯函数，以 pendingFilterSnapshots 为 store）
const pendingFilterSnapshots = reactive({});

const currentDensity = ref("small");

// ========== 远程数据模式：集成 useTable hook ==========
const isRemoteMode = computed(() => typeof props.requestApi === "function");

// 包装 requestApi / dataCallback / requestError 为函数形式读取最新 props，
// 兼容 useTable 内部 `let { data } = await api(...)` 解构约定（包一层 { data: result }）
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
  (...args) =>
    typeof props.dataCallback === "function"
      ? props.dataCallback(...args)
      : args[0],
  (...args) =>
    typeof props.requestError === "function" && props.requestError(...args),
);

// 构建 field → paramKey 映射（vxe-grid getColumns() 不保留自定义 params 属性，需从 props.columns 查找）
// 复用于 getFilterSortState / collectCheckboxFilterParams，避免重复遍历
const buildFieldToParamKeyMap = () => {
  const m = new Map();
  forEachLeafColumn(props.columns || [], (col) => {
    if (col.field) m.set(col.field, resolveParamKey(col));
  });
  return m;
};

// ========== 合并列配置（逻辑见 utils/columns.js）==========
// 列转换纯函数封装在 buildColumns：render/headerRender/editRender/filterType 简写
// 等均在构建期展开；hideColumn 列在此过滤。响应式输入（props/插槽/编辑态）每次
// recompute 时作为 config 传入，依赖追踪与原先在 computed 内直接读 props 等价。
const mergedColumns = computed(() =>
  buildColumns({
    columns: props.columns,
    defaultColumnConfig: props.defaultColumnConfig,
    initParam: props.initParam,
    slots,
    editable: props.editable,
    editOptions: props.editOptions,
    cellEditProps: props.cellEditProps,
    editLocalState,
    resolveEditStateKey,
    emit,
  }),
);

// ========== 函数式/字符串式 editRender 标记 ==========
// 这两种形式直接绑 row[field]，onEditClosed 不能再用 editLocalState 覆盖（会回滚 + cell-edit-change 参数颠倒）
// 从 props.columns 收集这类列（mergedColumns 已删除 editRender）供 onEditClosed 分流
const customEditFields = computed(() => {
  const m = {}
  const visit = (cols) => {
    ;(cols || []).forEach((col) => {
      if (!col || typeof col !== 'object') return
      const er = col.editRender
      if ((typeof er === 'function' || typeof er === 'string') && col.field) {
        m[col.field] = true
      }
      if (Array.isArray(col.children) && col.children.length) {
        visit(col.children)
      }
    })
  }
  visit(props.columns || [])
  return m
})

// ========== 表头过滤 & 排序状态收集（渲染器高阶复用）==========
// 关键：active 用 opt.checked（仅「确认」后生效），非 isFilterActive(data)（避免草稿被收集）
// 注：必须定义在 localProcessedData 之前 —— 静态模式本地过滤/排序的 computed 与
//     watch getter 会在 setup 阶段立即执行，const 箭头函数声明顺序不能形成 TDZ
const getFilterSortState = () => {
  const $table = gridRef.value;
  if (!$table) return { filters: [], sorts: [] };
  const cols = $table.getColumns ? $table.getColumns() : [];
  // vxe-grid getColumns() 不保留自定义 params 扩展属性，
  // 需从原始 props.columns 按 field 查找。forEachLeafColumn 递归 children
  const fieldToParamKey = buildFieldToParamKeyMap();
  const fieldToRenderProps = new Map();
  forEachLeafColumn(props.columns || [], (col) => {
    if (col.field && col.filterRender && col.filterRender.props) {
      fieldToRenderProps.set(col.field, col.filterRender.props);
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
        paramKey,
        title: col.title,
        type: fName,
        data: opt.data,
        // 透传 filterRender.props，供 filterStateToParams 读取区间类的 emptyValue 等
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

// ========== 本地过滤 + 排序（由 localFilterSort 布尔开关控制，与 requestApi 无关）==========
// localFilterSort=true（开启）时后端不参与：列过滤（filterType）与列排序的确认动作
// 不产生请求，由组件对当前数据（静态模式为 props.data，远程模式为当前页接口数据）
// 本地过滤 + 排序后再传给 vxe-grid。
// 多字段排序是否启用由 sortConfig.multiple 决定（vxe 控制单/多列状态，本地按状态透传）；
// sortConfig.remote=false 时排序交给 vxe 原生处理，本地仅做过滤。
//
// 注意：过滤/排序状态必须在「事件上下文」中收集（bumpLocalFilterSort），
// 不能在 computed/watcher 内直接调用 getFilterSortState() —— vxe 的 getSortColumns
// 内部读取其 props 派生的 computeSortOpts，而 gridProps 每次重算都会生成新的
// sortConfig 对象，computed 内读取会形成
// 「gridProps → vxe computeSortOpts → localProcessedData → renderData → gridProps」
// 的响应式循环（Maximum recursive updates exceeded）。
const localFilterSortState = ref({ filters: [], sorts: [] });
const bumpLocalFilterSort = () => {
  // 事件上下文（非响应式）中收集最新过滤/排序状态，驱动 localProcessedData 重算
  localFilterSortState.value = getFilterSortState();
};
// 本地处理的数据源：静态数据模式取 props.data，远程数据模式取接口返回的当前页数据
const localSourceData = computed(() =>
  isRemoteMode.value ? tableHook.tableData.value || [] : props.data || [],
);
const localProcessedData = computed(() => {
  const all = localSourceData.value;
  // 开关关闭（后端参与）：不做本地过滤/排序，原样返回数据源
  if (!props.localFilterSort) return all;
  const { filters, sorts } = localFilterSortState.value;
  const localSorts =
    props.sortConfig && props.sortConfig.remote === false ? [] : sorts;
  return applyLocalFilterSort(all, filters, localSorts);
});
// localFilterSort 运行时动态开启：立即收集一次当前过滤/排序状态驱动本地重算
watch(
  () => props.localFilterSort,
  (enabled) => {
    if (enabled) bumpLocalFilterSort();
  },
);

// ========== 静态模式前端分页 ==========
// 本地分页状态来自 props.pagerConfig；total 由 localProcessedData.length 自动计算
const localPager = ref({
  currentPage: props.pagerConfig?.currentPage ?? 1,
  pageSize: props.pagerConfig?.pageSize ?? 10,
  pageSizes: props.pagerConfig?.pageSizes,
});

// 父组件 pagerConfig 变化时同步到 localPager（仅静态模式 + pagination=true）
watch(
  () => props.pagerConfig,
  (newPager) => {
    if (isRemoteMode.value || !props.pagination || !newPager) return;
    if (newPager.currentPage != null)
      localPager.value.currentPage = newPager.currentPage;
    if (newPager.pageSize != null)
      localPager.value.pageSize = newPager.pageSize;
    if (newPager.pageSizes) localPager.value.pageSizes = newPager.pageSizes;
  },
  { deep: true },
);

// 数据长度变化时夹紧 currentPage（避免停留在不存在的页码；含本地过滤后总数变化）
watch(
  () => localProcessedData.value.length,
  (len) => {
    if (isRemoteMode.value || !props.pagination) return;
    const size = localPager.value.pageSize || 10;
    const maxPage = Math.max(1, Math.ceil(len / size));
    if (localPager.value.currentPage > maxPage) {
      localPager.value.currentPage = maxPage;
    }
  },
);

// 实际渲染数据：
//   · 远程数据 + 后端过滤排序（开关关闭）→ useTable 接口数据；
//   · 远程数据 + 本地过滤排序（开关开启）→ 对接口当前页数据本地处理（分页仍由后端负责）；
//   · 静态数据 → localProcessedData（开关开启时本地过滤+排序，关闭时即原始 data），再按分页切片
const renderData = computed(() => {
  if (isRemoteMode.value) {
    return props.localFilterSort
      ? localProcessedData.value
      : tableHook.tableData.value;
  }
  const all = localProcessedData.value;
  if (!props.pagination) return all;
  const size = localPager.value.pageSize || 10;
  const page = localPager.value.currentPage || 1;
  const start = (page - 1) * size;
  return all.slice(start, start + size);
});

// 数据刷新时清空选中：vxe-grid reserve:false 会清除选中 UI，同步清空对外暴露的选中数据
watch(renderData, () => clearSelection());

// 实际分页配置：远程用 useTable.pageable；静态+分页用 localPager（total 同步 data.length）；否则原样
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
  if (props.pagination) {
    return {
      currentPage: localPager.value.currentPage,
      pageSize: localPager.value.pageSize,
      // total 基于本地过滤+排序后的数据（过滤后总数随之变化）
      total: localProcessedData.value.length,
      pageSizes: localPager.value.pageSizes || [10, 20, 50, 100],
    };
  }
  return props.pagerConfig;
});

// ========== 默认参数同步 ==========
// 把 initParam 默认值同步到 useTable 与 vxe-grid UI（分页/排序/过滤），首屏请求前调用
// 按步骤拆分（步骤1~4），保持原有逻辑不变

// 解析 initParam 排序参数：sortField/sortOrder 字符串 → 字段数组 + 顺序数组
const parseInitSort = (ip) => {
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
  return { sortFields, sortOrders };
};

// 1) 分页默认值 → tableHook.pageable
const applyInitPager = (ip) => {
  if (!props.pagination || !tableHook.pageable.value) return;
  if (ip.pageNum != null)
    tableHook.pageable.value.pageNum = Number(ip.pageNum) || 1;
  if (ip.pageSize != null)
    tableHook.pageable.value.pageSize = Number(ip.pageSize) || 10;
};

// 2) 排序默认值 → 写入 searchParam（复用 sortStateToParams，遵循 sortParamConfig）
const applyInitSortDefault = (sortFields, sortOrders) => {
  if (!sortFields.length) return;
  const sp = tableHook.searchParam.value;
  const initSorts = sortFields.map((f, i) => ({
    field: f,
    order: sortOrders[i] || "asc",
  }));
  const { params: sortParams, paramKeys } = sortStateToParams(
    initSorts,
    props.sortParamConfig,
  );
  Object.keys(sortParams).forEach((k) => {
    sp[k] = sortParams[k];
  });
  paramKeys.forEach((k) => lastSortParamKeys.add(k));
};

// 3) 列过滤默认值 → 写入 searchParam（基于 initParam.filters 构造 fakeFilters，再走 filterStateToParams）
const applyInitFiltersDefault = (ip) => {
  if (!ip.filters || typeof ip.filters !== "object") return;
  const sp = tableHook.searchParam.value;
  const fakeFilters = [];
  Object.keys(ip.filters).forEach((field) => {
    // 从 mergedColumns 查找列：原始 props.columns 中 filterType 简写列尚未注入
    // filterRender，直接按 field 查找会漏掉它们的默认过滤参数（首屏请求缺失）
    const col = findColumnByField(mergedColumns.value || [], field);
    const fName = col && col.filterRender && col.filterRender.name;
    if (!fName || !FILTER_DEFAULTS[fName]) return;
    const defaultVal = ip.filters[field];
    const data = buildFilterDataFromDefault(fName, defaultVal);
    if (!data) return;
    fakeFilters.push({
      field,
      // paramKey 默认取 field，可通过列 params.defParamKey 自定义
      paramKey: resolveParamKey(col, field),
      title: (col && col.title) || field,
      type: fName,
      data,
      // 透传 filterRender.props，供 filterStateToParams 读取区间类的 emptyValue 等
      props: col && col.filterRender ? col.filterRender.props : undefined,
      active: isFilterActive(fName, data),
    });
  });
  const { params: filterParams, paramKeys } = filterStateToParams(fakeFilters);
  Object.keys(filterParams).forEach((k) => {
    sp[k] = filterParams[k];
  });
  paramKeys.forEach((k) => lastFilterParamKeys.add(k));
};

// 4) nextTick 中同步 vxe-grid UI 状态（sort 图标 + 过滤图标高亮）
const applyInitVxeUIState = (sortFields, sortOrders) => {
  nextTick(() => {
    try {
      const $table = gridRef.value;
      if (!$table) return;
      // 4a) 同步排序 UI（让 sort 图标高亮）
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
      // 4b) 列过滤 UI 已由 mergedColumns 注入默认 data+checked，仅需手动同步图标高亮
      //     （部分 vxe 版本不自动加 is--filter-active）
      syncFilterHeaderClass();
    } finally {
      // 4c) UI 同步完成，解除 guard（必须解除，避免后续 sort-change 被永久跳过）
      isApplyingDefaults.value = false;
    }
    // 4d) 本地过滤排序开关开启：默认过滤/排序已同步到 vxe UI 状态，触发本地重算
    // （开关关闭时数据由后端过滤排序，无需处理）
    if (props.localFilterSort) bumpLocalFilterSort();
  });
};

// applyInitParam 总入口：按步骤调用各步骤函数
const applyInitParam = () => {
  const ip = props.initParam || {};
  const hasInit = Object.keys(ip).length > 0;
  if (!hasInit) return;

  // 标记正在应用默认值，防止 vxe sort() 触发 sort-change → 重复请求
  isApplyingDefaults.value = true;

  const { sortFields, sortOrders } = parseInitSort(ip);

  // 1) 分页默认值
  applyInitPager(ip);
  // 2) 排序默认值 → 写入 searchParam
  applyInitSortDefault(sortFields, sortOrders);
  // 3) 列过滤默认值 → 写入 searchParam
  applyInitFiltersDefault(ip);
  // 4) nextTick 中同步 vxe-grid UI 状态
  applyInitVxeUIState(sortFields, sortOrders);
};

// 防止 applyInitParam 中的 vxe sort() 触发 sort-change → 重复请求
const isApplyingDefaults = ref(false);

// 挂载后自动发起首次请求（仅远程模式且 requestAuto=true）
onMounted(() => {
  applyInitParam();
  // 本地过滤排序开关开启：挂载完成后收集一次过滤/排序状态（覆盖 initParam 默认值与
  // sortConfig.defaultSort 等 vxe 挂载期应用的状态）
  if (props.localFilterSort) bumpLocalFilterSort();
  if (isRemoteMode.value && props.requestAuto) {
    // 注：updatedTotalParam 把 searchParam（含默认 filter/sort）同步到 totalParam，
    // 否则 getTableList 只发 pageParam 会丢失 filter/sort 默认值
    tableHook.updatedTotalParam();
    tableHook.getTableList();
  }
});

// requestApi 变化时（外部动态切换数据源）重新拉取数据
watch(
  () => props.requestApi,
  (api, oldApi) => {
    if (api !== oldApi && isRemoteMode.value && props.requestAuto) {
      if (tableHook.pageable.value) tableHook.pageable.value.pageNum = 1;
      tableHook.getTableList();
    }
  },
);

// ========== 过滤 popover 二次定位 + 滚动跟随 ==========
// vxe transfer=true 下面板 clamp 时 viewport/document 坐标混用，水平滚动时首尾列
// 弹窗会超出视口；且面板 absolute 定位到 body 后不随外层滚动容器滚动，需
// 「基准快照 + delta 增量」方式跟随。实现已抽离至 composables/useFilterPanelPosition.js
// （仅依赖 gridRef，内部注册 window / body wrapper 滚动监听）。
const { openFilterPanel, closeFilterPanel } = useFilterPanelPosition(gridRef);

// ========== 过滤面板 visible 处理 ==========
// 面板打开：恢复其他列草稿 + 保存当前列快照 + bump 计数器 + 二次定位面板
const handleFilterPanelOpen = (column) => {
  // 0) 恢复其他列的未确认快照（切换列时清除草稿，与 vxe-table 过滤逻辑一致）
  const $table = gridRef.value;
  if ($table && $table.getColumns) {
    $table.getColumns().forEach((col) => {
      if (col.id !== column.id && pendingFilterSnapshots[col.id]) {
        restoreFilterSnapshot(pendingFilterSnapshots, col);
      }
    });
  }
  // 1) 保存当前列快照（用于关闭未确认时恢复）
  saveFilterSnapshot(pendingFilterSnapshots, column);
  // 2) bump 计数器强制 FilterCheckbox 重新拉取（避免复用串列 / 级联数据陈旧）
  const field = column.field;
  if (field) bumpFilterRefetchCounter(field);
  // 3) 记录当前打开的列并二次 clamp 面板位置（滚动跟随由 composable 内部接管）
  openFilterPanel(column);
};

// 面板关闭：若快照仍存在（未点击确定），恢复到打开前状态
const handleFilterPanelClose = (column) => {
  // 停止滚动跟随追踪（面板已关闭，不再需要重定位）
  closeFilterPanel();
  if (!pendingFilterSnapshots[column.id]) return;
  // nextTick + setTimeout 确保 vxe 内部设置 opt.checked 之后再恢复（优先级最后）
  nextTick(() => {
    setTimeout(() => {
      restoreFilterSnapshot(pendingFilterSnapshots, column);
      syncFilterHeaderClass();
    }, 0);
  });
};

const onFilterVisible = (payload) => {
  if (!payload || !payload.column) return;
  const column = payload.column;
  if (payload.visible) {
    handleFilterPanelOpen(column);
  } else {
    handleFilterPanelClose(column);
  }
};

// 上一次过滤写入的 key，下次应用时用来清掉已失效的过滤参数（不影响外部 searchParam）
const lastFilterParamKeys = new Set();

// 手动同步列头过滤图标高亮 class（部分 vxe 版本不自动加 is--filter-active）
// 关键：用 opt.checked（仅「确认」后高亮），非 isFilterActive(data)（避免草稿导致高亮）
const FILTER_ACTIVE_CLASS = "is--filter-active";
const syncFilterHeaderClass = () => {
  const $table = gridRef.value;
  if (!$table || !$table.getColumns) return;
  const cols = $table.getColumns();
  cols.forEach((col) => {
    const fName = col.filterRender && col.filterRender.name;
    if (!fName || !FILTER_DEFAULTS[fName]) return;
    const isActive = (col.filters || []).some((opt) => opt.checked);
    // col.id 是 vxe 内部列标识（如 "col_17"，已含前缀），直接作为 class 选择器
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

// 同步参数到 searchParam：清掉上轮失效 key、写入本轮 key、更新 key 集合
// 复用于 applyFilterStateAndSearch / applySortStateAndSearch / handleToolbarRefresh
const syncParamsToSearchParam = (params, paramKeys, lastKeys) => {
  const sp = tableHook.searchParam.value;
  // 1) 清掉上一轮写入但本轮已失效的 key
  lastKeys.forEach((k) => {
    if (!paramKeys.has(k)) {
      delete sp[k];
    }
  });
  // 2) 写入本轮生效的 key
  Object.keys(params).forEach((k) => {
    sp[k] = params[k];
  });
  // 3) 同步本轮 key 集合
  lastKeys.clear();
  paramKeys.forEach((k) => lastKeys.add(k));
};

// 列过滤联动：localFilterSort=true 本地过滤；否则后端参与走 requestApi 远程检索
// （未传 requestApi 时仅抛 filter-confirm 事件由外部自行处理）
const applyFilterStateAndSearch = (filterSortPayload) => {
  // 始终先记录最新过滤 key（切换开关/数据源后参数状态仍能保持正确）
  const { params: filterParams, paramKeys } = filterStateToParams(
    filterSortPayload?.filters || [],
  );

  if (props.localFilterSort) {
    // 本地模式：后端不参与，bump 触发 localProcessedData 重新收集过滤状态并本地过滤
    bumpLocalFilterSort();
    return;
  }

  // 开关关闭但未传 requestApi：无后端可请求，仅抛事件，外部自行过滤
  if (!isRemoteMode.value) return;

  // 1~3) 同步过滤参数到 searchParam（清失效 key + 写本轮 key + 更新 key 集合）
  syncParamsToSearchParam(filterParams, paramKeys, lastFilterParamKeys);

  // 4) useTable.search：pageNum 重置为 1 → 更新 totalParam → getTableList
  tableHook.search();
};

// 获取当前表头过滤的扁平参数对象 { params, paramKeys }（不含排序），供外部读取
const getFilterParams = () => {
  const { filters } = getFilterSortState();
  return filterStateToParams(filters);
};

// 上一轮排序写入的 key（随 sortParamConfig 动态变化），与过滤 key 集合互不重叠
const lastSortParamKeys = new Set();

// 列排序联动：localFilterSort=true 本地排序；否则后端参与走 requestApi 远程排序
const applySortStateAndSearch = (sorts) => {
  const { params: sortParams, paramKeys } = sortStateToParams(sorts);
  if (props.localFilterSort) {
    // 本地模式：后端不参与，bump 触发 localProcessedData 重新收集排序状态并本地排序
    bumpLocalFilterSort();
    return;
  }

  // 开关关闭但未传 requestApi：无后端可请求（sortConfig.remote=false 时由 vxe 原生排序）
  if (!isRemoteMode.value) return;

  // 1~3) 同步排序参数到 searchParam（清失效 key + 写本轮 key + 更新 key 集合）
  syncParamsToSearchParam(sortParams, paramKeys, lastSortParamKeys);

  // 4) 排序变化通常意味着结果顺序完全改变，重置到第一页
  tableHook.search();
};

// vxe-grid @sort-change：远程模式联动 useTable，始终抛出 sort-change 事件
const onSortChange = (payload) => {
  // 多列排序时 vxe 逐列触发，统一通过 getSortColumns() 拿当前所有已排序列
  const $table = gridRef.value;
  const sorts = $table && $table.getSortColumns ? $table.getSortColumns() : [];
  // 初始化期间 vxe sort() 也会触发 sort-change，跳过联动避免重复请求
  if (!isApplyingDefaults.value) {
    applySortStateAndSearch(sorts);
  }
  emit("sort-change", payload);
};

// 重置单列过滤 data：恢复到 initParam.filters 默认值，无则回退 FILTER_DEFAULTS
// 复用于 resetColumnFilter（单列）与 resetAllFilter（遍历所有列）
const resetColumnFiltersData = (col) => {
  const fName = col.filterRender && col.filterRender.name;
  if (!fName || !FILTER_DEFAULTS[fName]) return;
  const defaultData = getColumnDefaultData(col.field, fName, props.initParam);
  (col.filters || []).forEach((opt) => {
    if (defaultData) {
      if (opt.data) Object.assign(opt.data, defaultData);
      else opt.data = { ...defaultData };
    } else {
      const fac = FILTER_DEFAULTS[fName];
      if (opt.data) Object.assign(opt.data, fac());
      else opt.data = fac();
    }
    // checked 基于 data 是否有值
    opt.checked = isFilterActive(fName, opt.data);
  });
};

// 重置指定列的过滤条件：恢复到 initParam.filters 中的默认值（而非清空），无则回退 FILTER_DEFAULTS
const resetColumnFilter = (params) => {
  const col = params && params.column;
  if (!col) return;
  resetColumnFiltersData(col);
};

// 重置所有列的过滤条件（恢复默认值，逻辑同上）
const resetAllFilter = () => {
  const $table = gridRef.value;
  if (!$table) return;
  const cols = $table.getColumns ? $table.getColumns() : [];
  cols.forEach((col) => resetColumnFiltersData(col));
};

// ========== 过滤选项远程拉取 ==========
// FilterCheckbox 面板打开时调用 requestFilterAPI 获取选项，按 filterOptionKeys 映射为 { label, value }
// requestFilterAPI 接收组合参数 { field, filters }（详细见 README）

// 收集所有 FilterCheckbox 列当前过滤值，形成组合参数（支持多列级联过滤）
const collectCheckboxFilterParams = () => {
  const $table = gridRef.value;
  if (!$table || !$table.getColumns) return {};
  const cols = $table.getColumns();
  // vxe-grid getColumns() 不保留自定义 params 扩展属性，从 props.columns 查找
  const fieldToParamKey = buildFieldToParamKeyMap();
  const params = {};
  cols.forEach((col) => {
    const fName = col.filterRender && col.filterRender.name;
    if (fName !== "FilterCheckbox") return;
    const paramKey = fieldToParamKey.get(col.field) || col.field;
    if (!paramKey) return;
    // 仅收集 opt.checked=true（已确认）的过滤值，避免草稿传到远程接口（级联场景）
    const vals = (col.filters || []).flatMap((opt) => {
      if (!opt.checked) return [];
      const v = opt.data && opt.data.values;
      return Array.isArray(v) ? v.filter((x) => x != null && x !== "") : [];
    });
    // 仅非空数组才写入参数
    if (vals.length > 0) {
      params[paramKey] = vals;
    }
  });
  return params;
};

const fetchFilterOptions = async (field) => {
  // 本地过滤排序模式：后端不参与，禁止调用 requestFilterAPI，
  // FilterCheckbox 自动回退到列配置 filterRender.props.options 静态选项
  if (props.localFilterSort) return null;
  if (typeof props.requestFilterAPI !== "function") return null;
  try {
    const filters = collectCheckboxFilterParams();
    let res = await props.requestFilterAPI({ field, filters });
    // filterDataCallback 对原始数据二次处理（提取 data / 重命名 / 过滤无效项等）
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

// 应用过滤状态并同步表头高亮 class：复用于 emitConfirm/emitReset/emitResetAll
const applyFilterAndSyncHeader = (payload) => {
  applyFilterStateAndSearch(payload);
  nextTick(() => syncFilterHeaderClass());
};

// 向过滤渲染器面板提供上下文（provide/inject 跨 vxe 的 Teleport 仍按组件树生效）
provide("tableProFilterContext", {
  gather: getFilterSortState,
  fetchFilterOptions,
  // 是否启用远程过滤选项（FilterCheckbox 据此决定远程/静态模式）：
  // 本地过滤排序开关开启时恒为 false（不触发 requestFilterAPI，回退静态 options）
  hasRemoteFilterAPI: () =>
    !props.localFilterSort && typeof props.requestFilterAPI === "function",
  // 每列重新拉取计数器：面板打开 bump 一次，FilterCheckbox 监听后强制重新 fetch
  filterRefetchCounter,
  clearCurrent: resetColumnFilter,
  clearAll: resetAllFilter,
  emitConfirm: (params) => {
    // 清除快照（确认的改动保留，面板关闭时不再恢复）
    const col = params && params.column;
    if (col) clearFilterSnapshot(pendingFilterSnapshots, col);
    const payload = getFilterSortState();
    applyFilterAndSyncHeader(payload);
    emit("filter-confirm", payload);
  },
  emitReset: (params) => {
    const col = params && params.column;
    // 更新快照为重置后的状态（重置立即生效，后续关闭面板不再恢复到重置前）
    if (col) updateFilterSnapshot(pendingFilterSnapshots, col);
    const info = col ? { field: col.field, title: col.title } : {};
    const payload = { column: info, ...getFilterSortState() };
    applyFilterAndSyncHeader(payload);
    emit("filter-reset", payload);
  },
  emitResetAll: () => {
    const payload = getFilterSortState();
    applyFilterAndSyncHeader(payload);
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
const handleToolbarRefresh = () => {
  const state = getFilterSortState();
  emit("refresh", state);
  if (isRemoteMode.value) {
    // 重新同步过滤参数到 searchParam（确保默认值/用户修改值不丢失）
    const { params: filterParams, paramKeys } = filterStateToParams(
      state.filters,
    );
    syncParamsToSearchParam(filterParams, paramKeys, lastFilterParamKeys);
    // updatedTotalParam 把 searchParam（含过滤/排序）同步到 totalParam
    tableHook.updatedTotalParam();
    return tableHook.getTableList();
  }
  return Promise.resolve();
};

// ========== 工具栏按钮点击（toolbarConfig.buttons 自定义按钮）==========
const onToolbarButtonClick = ({ code, button }) => {
  emit("toolbar-button-click", { code, button });
};

// ========== 单选/多选事件：收集选中数据 + 透传事件 ==========
const onCheckboxChange = (e) => {
  selectionChange(e?.records || []);
  emit("checkbox-change", e);
};
const onCheckboxAll = (e) => {
  selectionChange(e?.records || []);
  emit("checkbox-all", e);
};
const onRadioChange = (e) => {
  radioChange(e?.row || null);
  emit("radio-change", e);
};

// 内置「重置过滤」工具按钮：清空所有列过滤条件并触发重置事件
const onResetAllFilter = () => {
  resetAllFilter();
  // 清除所有待恢复的快照（工具栏重置优先于面板草稿）
  Object.keys(pendingFilterSnapshots).forEach((k) => {
    delete pendingFilterSnapshots[k];
  });
  const payload = getFilterSortState();
  applyFilterAndSyncHeader(payload);
  emit("filter-reset-all", payload);
  emit("reset-filter", payload);
};

// 是否存在列过滤配置（递归 children，让子列过滤也能触发「重置过滤」按钮显示）
const hasColumnFilter = computed(() => {
  let has = false
  const visit = (cols) => {
    ;(cols || []).forEach((col) => {
      if (!col || typeof col !== 'object') return
      if (col.filters && col.filters.length > 0 && col.filterRender) has = true
      if (Array.isArray(col.children) && col.children.length) visit(col.children)
    })
  }
  visit(mergedColumns.value || [])
  return has
})

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
  // 用户自定义按钮走 buttons，内置「重置过滤」走 toolSuffix 插槽（右侧工具区）
  cfg.buttons = [...(userCfg.buttons || [])];
  cfg.slots = {
    toolSuffix: "toolbarToolSuffix",
    ...(userCfg.slots || {}),
    buttons: "toolbarButtons",
  };
  Object.keys(cfg).forEach((k) => cfg[k] == null && delete cfg[k]);
  return cfg;
});

// ========== 列个性化配置 ==========
const customConfig = computed(() => ({
  mode: "popover", // 'modal' | 'drawer' | 'popover'
  allowVisible: true,
  storage: props.customStorage, // 记忆到 localStorage
  ...props.customConfig,
}));

// ========== 外部插槽透传 ==========
// 取并集：(1) 列配置 render/headerRender 字符串引用的插槽；(2) 外部 cell_/edit_/header_ 前缀插槽（详细见 README）
const passthroughSlotNames = computed(() => {
  const nameSet = new Set()

  // (1) 从列配置中收集字符串引用的 slot 名（递归 children）
  const visitCol = (cols) => {
    ;(cols || []).forEach((col) => {
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
      if (Array.isArray(col.children) && col.children.length) visitCol(col.children)
    })
  }
  visitCol(mergedColumns.value || [])

  // (2) 宽松透传 cell_/edit_/header_ 前缀的外部具名插槽
  if (slots && typeof slots === 'object') {
    Object.keys(slots).forEach((n) => {
      if (n.startsWith('cell_') || n.startsWith('edit_') || n.startsWith('header_')) {
        nameSet.add(n)
      }
    })
  }

  return Array.from(nameSet)
})

// ========== vxe-grid 原生事件透传 ==========
// FORWARD_GRID_EVENTS 中每个事件名 → onXxx 监听器，vxe-grid 触发时按同名 emit 抛给父组件
// 关键：必须先 camelize 再 toHandlerKey，否则 'filter-visible' 会生成 'onFilter-visible'（带连字符），
// Vue 的 emit 在查找处理函数时会优先匹配带连字符的形式，从而覆盖模板内显式绑定的 camelCase
// 处理函数（@filter-visible="onFilterVisible" → props.onFilterVisible），
// 导致本地 handler 不被调用。先 camelize 得到 'onFilterVisible' 后，
// Vue 编译器对 v-bind + @event 的 mergeProps 会将两个同 key 的 onXxx 合并为数组，两者都触发。
const gridListeners = computed(() => {
  const obj = {};
  FORWARD_GRID_EVENTS.forEach((name) => {
    obj[toHandlerKey(camelize(name))] = (e) => emit(name, e);
  });
  return obj;
});

// ========== vxe-grid 显式事件绑定（内部处理 + 转发）==========
// 用 v-bind 批量绑定替代模板里一行行 @xxx="..."，逻辑完全等价：
//   · 内部 handler 已 emit 转发的事件（toolbar-button-click/sort-change/checkbox-*/radio-change）→ 处理业务 + emit
//   · 仅 inline 转发的事件（cell-click/dblclick/row-click/dblclick）→ 直接 emit
//   · 仅内部处理的事件（filter-visible/edit-activated/edit-closed）→ 处理业务，转发由 gridListeners 负责
// 关键：key 必须是 onXxx 形式（camelCase + on 前缀），不能用 kebab-case
//   · v-on="obj" 对动态对象变量不会自动 camelize key（kebab-case 不会被识别为事件处理器）
//   · 用 v-bind 传递 onXxx 形式的 key，Vue 编译器把两个 v-bind 编译为 mergeProps
//   · 与 gridListeners 的同名 onXxx（forwarding 函数）合并为数组，两者都触发
const gridEventHandlers = {
  onToolbarButtonClick,
  onSortChange,
  onCheckboxChange,
  onCheckboxAll,
  onRadioChange,
  onCellClick: (e) => emit("cell-click", e),
  onCellDblclick: (e) => emit("cell-dblclick", e),
  onRowClick: (e) => emit("row-click", e),
  onRowDblclick: (e) => emit("row-dblclick", e),
  onFilterVisible,
  onEditActivated,
  onEditClosed,
};
// ========== vxe-grid 属性 ==========
// 展开 attrs 实现 vxe-grid 原生属性透传（class/style 排除，绑定到根元素 .table-pro）
// 合并 gridListeners（事件透传），显式声明的 props 写在后面优先级更高
const gridProps = computed(() => {
  // 剥离 class/style（绑定到根元素 .table-pro）
  // 剥离 virtualXConfig/virtualYConfig（camelCase + kebab-case）及已废弃的 scrollX/scrollY，
  // 统一由下方逻辑接管，避免 restAttrs 残留导致重复传参
  const {
    class: _class,
    style: _style,
    virtualXConfig: userVirtualXCamel,
    "virtual-x-config": userVirtualXKebab,
    virtualYConfig: userVirtualYCamel,
    "virtual-y-config": userVirtualYKebab,
    scrollX: userScrollXC,
    "scroll-x": userScrollXK,
    scrollY: userScrollYC,
    "scroll-y": userScrollYK,
    ...restAttrs
  } = attrs;
  // 用户显式传入的虚拟滚动配置优先级最高（同时兼容新版 virtualXConfig 与已废弃 scrollX）
  const finalVirtualX =
    userVirtualXCamel ?? userVirtualXKebab ?? userScrollXC ?? userScrollXK;
  const finalVirtualY =
    userVirtualYCamel ?? userVirtualYKebab ?? userScrollYC ?? userScrollYK;
  return mergeProps(
    {
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
      // 注：keepSource 是 vxe-table 根级 prop（非 editConfig 属性），必须放根级
      // 才能缓存源数据快照让 isUpdateByRow 判断 dirty + td 加 col--dirty 类
      keepSource: true,
      // editable=false（权限控制）：不传 editConfig，vxe 不会进入编辑态、不显示编辑图标
      ...(props.editable === false
        ? {}
        : {
            editConfig: {
              trigger: "click",
              mode: "cell",
              showStatus: true,
              ...props.editConfig,
            },
          }),
      sortConfig: { trigger: "button", ...props.sortConfig },
      filterConfig: { remote: true, ...props.filterConfig },
      treeConfig: props.treeConfig,
      expandConfig: props.expandConfig,
      columnConfig: { resizable: true, ...props.columnConfig },
      columns: mergedColumns.value,
      data: renderData.value,
      // 校验规则透传到 vxe-grid，配合暴露的 validate / fullValidate 方法
      editRules: props.editRules,
      toolbarConfig: toolbarConfig.value,
      customConfig: customConfig.value,
      // 虚拟滚动：仅使用用户显式传入的配置
      ...(finalVirtualX ? { virtualXConfig: finalVirtualX } : {}),
      ...(finalVirtualY ? { virtualYConfig: finalVirtualY } : {}),
    },
    gridListeners.value,
    gridEventHandlers
  );
});

// ========== 分页（element-plus，抽离到 ./pagination/Pagination.vue）==========
// 子 Pagination 组件 change 事件统一入口（已 emit 最新 pagerConfig）
// 远程模式 → useTable；静态+分页 → 更新 localPager；始终透传 update:pagerConfig + page-change
const onPagerChange = (newPager) => {
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
  // 静态+分页：先更新 localPager（驱动 renderData 切片）
  if (props.pagination) {
    localPager.value = {
      ...localPager.value,
      currentPage: newPager.currentPage,
      pageSize: newPager.pageSize,
    };
  }
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
  // ========== 单选/多选数据收集（useSelection）==========
  isSelected,
  selectedList,
  selectedListIds,
  selectedRow,
  selectedId,
  isRadioSelected,
  clearSelection,
  scrollTo: (x, y) => gridRef.value?.scrollTo?.(x, y),
  scrollToRow: (row) => gridRef.value?.scrollToRow?.(row),
  scrollToColumn: (col) => gridRef.value?.scrollToColumn?.(col),
  // 本地过滤排序开启时，清空排序/过滤后 bump 触发本地重算（不经过 confirm/reset 流程）
  clearSort: () => {
    const r = gridRef.value?.clearSort?.();
    if (props.localFilterSort) bumpLocalFilterSort();
    return r;
  },
  clearFilter: () => {
    const r = gridRef.value?.clearFilter?.();
    if (props.localFilterSort) bumpLocalFilterSort();
    return r;
  },
  exportData: (opts) => gridRef.value?.exportData?.(opts),
  resetAllFilter,
  resetColumnFilter,
  getFilterSortState,
  // ========== 表头过滤参数（对外可读）==========
  getFilterParams,
  lastFilterParamKeys,
  // ========== 分页参数（对外可读）==========
  currentPager,
  localPager,
  // ========== useTable 暴露（远程模式可用）==========
  getTableList: tableHook.getTableList,
  search: tableHook.search,
  reset: tableHook.reset,
  tableData: tableHook.tableData,
  pageable: tableHook.pageable,
  searchParam: tableHook.searchParam,
  // ========== 校验方法（透传 vxe-grid，配合 editRules 使用）==========
  // validate: 仅校验已编辑的单元格；fullValidate: 校验全表所有规则
  // 配合 validConfig.autoPos=false：校验不自动激活编辑态，避免 TextareaPopoverEdit 等弹层
  //       遮住校验错误语；提交后调用 scrollToRow 手动滚动到首个错误行
  validate: (...args) => gridRef.value?.validate?.(...args),
  fullValidate: (...args) => gridRef.value?.fullValidate?.(...args),
  clearValidate: (...args) => gridRef.value?.clearValidate?.(...args),
});
</script>

<template>
  <div class="table-pro" :class="attrs.class" :style="attrs.style">
    <div class="table-pro__body">
      <vxe-grid
        ref="gridRef"
        v-bind="gridProps"
      >
        <template #toolbarButtons="scope">
          <slot
            name="toolbarButtons"
            v-bind="{
              ...scope,
              // 单选/多选收集的数据（useSelection）
              isSelected,
              selectedList,
              selectedListIds,
              selectedRow,
              selectedId,
              isRadioSelected,
              clearSelection,
            }"
          />
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

        <!-- 外部 cell_xxx / edit_xxx / header_xxx 具名插槽透传（详细用法见 README） -->
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
      v-if="pagination"
      :pager-config="currentPager"
      :before-page-change="beforePageChange"
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

    // ========== 列头布局：统一 flex 布局，防止图标换行 ==========
    // 所有列（left/center/right）均使用 flex 布局，确保过滤图标和排序图标始终在一起，
    // 文字可被挤压省略，但图标不会被压缩或换行。
    :deep(.vxe-header--column) {
      .vxe-cell--wrapper.vxe-header-cell--wrapper {
        display: flex;
        align-items: center;
        width: 100%;
        // 默认不允许换行：图标和文字必须在同一行
        flex-wrap: nowrap;

        // 标题文字：可被挤压省略，但保留最小宽度避免完全消失
        .vxe-cell--title {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 0 1 auto;
        }

        // 排序、过滤、编辑、必填图标：不可压缩，始终完整显示
        // 必填星号也需 flex-shrink:0，否则长标题列会把星号挤压到与编辑图标堆叠重叠
        .vxe-cell--sort,
        .vxe-cell--filter,
        .vxe-cell--edit-icon,
        .vxe-cell--required-icon {
          flex-shrink: 0;
        }
      }

      // 按 headerAlign 差异化对齐
      // col--left：title 占剩余空间 + 图标靠右（两端对齐）
      &.col--left {
        .vxe-cell--wrapper.vxe-header-cell--wrapper {
          .vxe-cell--title {
            margin-right: auto;
          }
        }
      }
      // col--center：title + 图标作为整体居中
      &.col--center {
        .vxe-cell--wrapper.vxe-header-cell--wrapper {
          justify-content: center;
        }
      }
      // col--right：title 靠右 + 图标在左
      &.col--right {
        .vxe-cell--wrapper.vxe-header-cell--wrapper {
          .vxe-cell--title {
            margin-left: auto;
          }
        }
      }

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

  // 工具栏左右内边距 = 按钮间距
  :deep(.vxe-toolbar) {
    padding-left: $table-toolbar-gap;
    padding-right: $table-toolbar-gap;

    .table-pro__title {
      align-self: center;
    }

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
  全局样式（非 scoped）：vxe-table filter popover 在 transfer=true 时被 Teleport 到 body，
  scoped 样式无法选中，必须用独立的非 scoped <style> 块约束其宽度与溢出行为
-->
<style lang="scss">
// ======= 变量定义 =======
$vxe-filter-arrow-size: 8px;
$vxe-filter-arrow-gap: 2px; // 箭头底部与面板顶部边框之间的视觉安全间距
$vxe-filter-panel-offset: $vxe-filter-arrow-size + $vxe-filter-arrow-gap;

// ======= 面板主样式（!important 提升优先级覆盖 vxe 自带样式）=======
.vxe-table--filter-wrapper.is--active {
  max-width: min(92vw, 420px) !important;
  box-sizing: border-box;
  overflow-wrap: anywhere;

  background-color: #ffffff !important;
  border: 1px solid var(--el-border-color-lighter, #dcdfe6) !important;
  border-radius: 6px !important;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08) !important;
}

// ======= 三角形箭头：两个伪元素叠加形成带边框、实心底色的三角形 =======
.vxe-table--filter-wrapper.is--active::before,
.vxe-table--filter-wrapper.is--active::after {
  content: "";
  position: absolute;
  top: 0;
  left: var(--vxe-filter-arrow-left, 50%);
  transform: translate(-50%, -100%); // 把三角形挪到面板上边缘"上方"
  width: 0;
  height: 0;
  pointer-events: none;
  display: block !important; // 确保一定渲染
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

// 内层：白色实心三角（比外层小 1px，叠在上面只让外层底部露出 1px "边"）
.vxe-table--filter-wrapper.is--active::after {
  border-left: #{$vxe-filter-arrow-size} solid transparent !important;
  border-right: #{$vxe-filter-arrow-size} solid transparent !important;
  margin-top: 1px; // 往下 1px 嵌入边框三角内部
  border-bottom: #{$vxe-filter-arrow-size} solid #ffffff !important;
  z-index: 1;
}

// ======= 箭头正下方的 border 遮罩：让三角形底边接到面板顶边，不留缝隙 =======
.vxe-table--filter-wrapper.is--active {
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

.vxe-table--filter-wrapper.is--active .filter-panel {
  max-width: 100%;
  box-sizing: border-box;
}

// 覆盖 .el-range-editor 的 width/min-width，避免清空按钮撑宽输入框
.vxe-table--filter-wrapper.is--active {
  .el-date-editor.el-input,
  .el-date-editor.el-range-editor,
  .el-date-editor {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box;
  }

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
// Element Plus 默认宽度（如 InputNumber 150px、DatePicker 220px）会超出窄列单元格，统一覆盖为 100%
.vxe-table {
  .vxe-body--column.col--active {
    > .vxe-cell {
      width: 100%;
      box-sizing: border-box;

      // 所有 Element Plus 输入类组件本体宽度统一 100%
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

      // InputNumber 内部输入框自适应
      .el-input-number {
        .el-input__wrapper {
          padding-left: 8px;
          padding-right: 8px;
        }
      }

      // DatePicker/TimePicker 范围选择器内部 input 自适应
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

// body 级兜底：popover 计算位置出错时也不要出现页面级横向滚动条
body {
  overflow-x: hidden;
}
</style>
