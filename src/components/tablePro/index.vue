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
  onBeforeUnmount,
  watch,
  h,
  markRaw,
  toHandlerKey,
  camelize,
  mergeProps,
} from "vue";
import { useEventListener } from "@vueuse/core";
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
import "./renderers/renderers.js";
// 自定义编辑控件（在 EL_EDIT_MAP 中注册后即可通过 editRender: { name: 'XxxEdit' } 使用）
import TextareaPopoverEdit from "./editors/TextareaPopoverEdit.vue";
import { FILTER_DEFAULTS, isFilterActive } from "./filters/filter-config.js";
// 事件清单（vxe-grid 透传事件 + TablePro 自身事件），用于 defineEmits 与原生事件转发
import { FORWARD_GRID_EVENTS, TABLE_PRO_EVENTS } from "./utils/events.js";
import { useTable } from "@/hooks/useTable";
import { useSelection } from "@/hooks/useSelection";
// 抽离的分页组件
import Pagination from "./pagination/Pagination.vue";

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
});

// 声明组件 emits：vxe-grid 透传事件 + TablePro 自身事件
const emit = defineEmits([...FORWARD_GRID_EVENTS, ...TABLE_PRO_EVENTS]);

const slots = useSlots();
const attrs = useAttrs();
const gridRef = ref();
// 根元素 .table-pro 的 ref（用于 onMounted 时检测父容器是否有明确高度）
const rootRef = ref();

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
// 进入编辑态后自动聚焦/展开的组件集合（仅对象配置式 editRender 生效）
//   · 文字输入类：ElInput/ElInputNumber → 聚焦 input（高亮光标，直接打字即可）
//   · 面板弹出类：ElSelect/ElDatePicker/ElTimePicker/ElCascader/ElColorPicker → 展开面板
//   · TextareaPopoverEdit：组件内部 onMounted 已处理 popover 打开+聚焦，这里仅占位避免重复逻辑
const AUTO_FOCUS_EDIT_NAMES = new Set(['ElInput', 'ElInputNumber'])
const AUTO_POPUP_EDIT_NAMES = new Set(['ElSelect', 'ElDatePicker', 'ElTimePicker', 'ElCascader', 'ElColorPicker'])
const AUTO_OPEN_EDIT_NAMES = new Set([...AUTO_FOCUS_EDIT_NAMES, ...AUTO_POPUP_EDIT_NAMES, 'TextareaPopoverEdit'])

// 自动聚焦 Element Plus 文字输入类组件的 input
//   · ElInput/ElInputNumber：组件实例 focus() → input.focus() + dispatchEvent(FocusEvent)
//   · TextareaPopoverEdit：组件内部 onMounted 自行处理（此处 no-op 返回即可）
const autoFocusTextInput = (erName, el, proxy) => {
  // TextareaPopoverEdit 已在内部 onMounted 处理，直接跳过
  if (erName === 'TextareaPopoverEdit') return
  // 优先通过组件实例 focus()（如 ElInput.proxy.focus → 聚焦内部 input）
  if (proxy && typeof proxy.focus === 'function') {
    proxy.focus()
    return
  }
  // 兜底：DOM 查询到 input/textarea 再 focus
  if (!el || !el.querySelector) return
  const inputEl = el.querySelector('input') || el.querySelector('textarea')
  if (inputEl && typeof inputEl.focus === 'function') {
    inputEl.focus()
    inputEl.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
  }
}

// 自动弹出面板类组件（ElSelect/ElDatePicker/ElTimePicker 等）
const autoOpenPopupComp = (erName, el, proxy) => {
  if (erName === 'ElSelect') {
    // ElSelect：触发 .el-select__wrapper 的 click → 内部 toggleMenu
    if (el && el.querySelector) {
      const wrapper = el.querySelector('.el-select__wrapper') || el
      wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    return
  }
  // ElDatePicker/ElTimePicker/ElCascader/ElColorPicker
  // 组件实例方法（部分版本可能不暴露，跳过即可）
  if (proxy && typeof proxy.handleOpen === 'function') proxy.handleOpen()
  if (proxy && typeof proxy.focus === 'function') proxy.focus()
  // DOM 事件：在 .el-input__wrapper 上 mousedown + click 触发 ElDatePicker 内部 handleFocus
  //   · 直接在 input 上触发不生效（ElDatePicker 监听 wrapper 而非 input）
  //   · 兜底用 document.querySelector 查找当前激活编辑 cell 内的元素
  let wrapperEl = el && el.querySelector ? el.querySelector('.el-input__wrapper') : null
  if (!wrapperEl) {
    const editCell = document.querySelector('.vxe-cell--edit') || document.querySelector('.is--edit')
    wrapperEl = editCell && editCell.querySelector('.el-input__wrapper')
  }
  if (!wrapperEl) return
  wrapperEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  // input 获得焦点 + 触发 focus 事件（ElDatePicker 监听 @focus → handleFocus → 显示面板）
  const inputEl = wrapperEl.querySelector('input')
  if (inputEl) {
    if (typeof inputEl.focus === 'function') inputEl.focus()
    inputEl.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
  }
  wrapperEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

// onVnodeMounted 钩子：组件挂载后自动 focus 输入/弹出面板
//   · ElDatePicker 是 Fragment 组件，vnode.el/vnode.$el 可能是 #text，需向上找 parentElement
//   · setTimeout(0) 等 Element Plus 内部初始化（popper/input 等）完成
const autoOpenOnMounted = (erName) => {
  if (!AUTO_OPEN_EDIT_NAMES.has(erName)) return null
  return (vnode) => {
    const proxy = vnode && vnode.component && vnode.component.proxy
    const rawEl = (proxy && proxy.$el) || (vnode && vnode.el)
    // 若是 Text/Comment 节点，向上找最近的 Element（Fragment 组件如 ElDatePicker）
    const el = rawEl && rawEl.nodeType === 1 ? rawEl : (rawEl && rawEl.parentElement)
    const trigger = () => {
      try {
        if (AUTO_FOCUS_EDIT_NAMES.has(erName) || erName === 'TextareaPopoverEdit') {
          autoFocusTextInput(erName, el, proxy)
        } else if (AUTO_POPUP_EDIT_NAMES.has(erName)) {
          autoOpenPopupComp(erName, el, proxy)
        }
      } catch (e) {
        /* ignore */
      }
    }
    setTimeout(trigger, 0)
  }
}

// 进入编辑态：用 row[field] 初始化本地值
// 自动弹出由 buildObjectEditSlotFn 中的 onVnodeMounted 钩子处理（更可靠）
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
const pendingFilterSnapshots = reactive({});
// 深拷贝过滤 data（处理 FilterCheckbox.values 等数组类型属性）
const cloneFilterData = (data) => {
  if (!data || typeof data !== "object") return data;
  const clone = { ...data };
  Object.keys(clone).forEach((k) => {
    if (Array.isArray(clone[k])) clone[k] = [...clone[k]];
  });
  return clone;
};
const saveFilterSnapshot = (column) => {
  if (!column || !column.id) return;
  pendingFilterSnapshots[column.id] = (column.filters || []).map((opt) => ({
    data: cloneFilterData(opt.data),
    checked: opt.checked,
  }));
};
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
const updateFilterSnapshot = (column) => {
  saveFilterSnapshot(column);
};
const clearFilterSnapshot = (column) => {
  if (!column || !column.id) return;
  delete pendingFilterSnapshots[column.id];
};

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

// ========== 过滤默认值构建工具 ==========
// 将 initParam.filters 中的默认值转换为对应过滤类型的 data 结构，供各处复用
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
      // 区间类默认值：数组 [first, second] 或旧对象格式 { start, end } / { min, max }
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

// 获取指定列的默认过滤 data：优先用 initParam.filters，否则回退 FILTER_DEFAULTS
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
// 模块作用域常量：mergedColumns computed 内复用，避免每次 recompute 重建
const DEFAULT_FILTER_CONFIG = {
  FilterInput:       { filters: [{ data: { value: '' } }],                 filterRender: { name: 'FilterInput' } },
  FilterCheckbox:    { filters: [{ data: { values: [], search: '' } }],   filterRender: { name: 'FilterCheckbox' } },
  FilterDateRange:   { filters: [{ data: { values: [null, null] } }],    filterRender: { name: 'FilterDateRange' } },
  FilterNumberRange: { filters: [{ data: { values: [null, null] } }],    filterRender: { name: 'FilterNumberRange' } },
}

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
  // 自定义编辑控件（非 Element Plus 原生）
  TextareaPopoverEdit: { comp: TextareaPopoverEdit },
}
const WRAP_COMPONENTS = { ElOption, ElRadio, ElRadioButton, ElCheckbox, ElCheckboxButton }

// 读取某列的编辑选项数组：editRender.props.options 优先于 props.editOptions[field]
const resolveEditOptions = (field, editRender) => {
  if (editRender && Array.isArray(editRender.options)) return editRender.options
  const eo = props.editOptions || {}
  return Array.isArray(eo[field]) ? eo[field] : []
}
// 合并编辑控件 props：editRender.props + editRender.props.props + cellEditProps[field] + v-model
const mergeEditCompProps = (field, editRender, extra = {}) => {
  const erProps = (editRender && editRender.props) || {}
  const innerProps = erProps.props || {}
  const cep = props.cellEditProps || {}
  const commonProps = cep[field] || {}
  return {
    ...erProps,              // editRender.props 顶层（如 activeValue / type）
    ...innerProps,           // editRender.props.props（标准 props 容器）
    ...commonProps,          // 外部 :cell-edit-props 注入（优先级更高）
    ...extra,                // v-model 等基础绑定（优先级最高）
  }
}

// ========== 列查找/遍历工具（支持表头分组 children 递归）==========
const findColumnByField = (cols, field) => {
  if (!Array.isArray(cols) || !field) return undefined
  for (const col of cols) {
    if (!col || typeof col !== 'object') continue
    if (col.field === field) return col
    if (Array.isArray(col.children) && col.children.length) {
      const hit = findColumnByField(col.children, field)
      if (hit) return hit
    }
  }
  return undefined
}
const forEachLeafColumn = (cols, fn) => {
  ;(cols || []).forEach((col) => {
    if (!col || typeof col !== 'object') return
    if (Array.isArray(col.children) && col.children.length) {
      forEachLeafColumn(col.children, fn)
    } else {
      fn(col)
    }
  })
}

// slots 渲染错误兜底：捕获用户 render/headerRender/editRender 内部异常，避免整表崩塌
const renderSlotError = (e) =>
  h('span', { style: 'color:#f56c6c' }, String(e && e.message ? e.message : e))

// 读取列自定义参数 key：取 col.params.defParamKey，兜底 field
const resolveParamKey = (col, fallbackField) => {
  if (!col) return fallbackField
  return (col.params && col.params.defParamKey) || col.field || fallbackField
}

// 构建 field → paramKey 映射（vxe-grid getColumns() 不保留自定义 params 属性，需从 props.columns 查找）
// 复用于 getFilterSortState / collectCheckboxFilterParams，避免重复遍历
const buildFieldToParamKeyMap = () => {
  const m = new Map();
  forEachLeafColumn(props.columns || [], (col) => {
    if (col.field) m.set(col.field, resolveParamKey(col));
  });
  return m;
};

const mergedColumns = computed(() => {
  const defCfg = props.defaultColumnConfig || {}
  const { filterDefaults: defFilterDefaults, ...defColumnCommon } = defCfg

  const filterDefaults = { ...DEFAULT_FILTER_CONFIG, ...(defFilterDefaults || {}) }

  const ip = props.initParam || {}
  const initFilters = ip.filters && typeof ip.filters === 'object' ? ip.filters : {}

  // 外部插槽集合，用于支持 render/headerRender 字符串引用具名插槽
  const externalSlots = slots || {}

  // 应用 headerRender → slots.header（叶子列与父分组列共用）
  // 优先级：用户显式 slots.header > col.headerRender。支持函数式 JSX 或字符串引用具名插槽
  const applyHeaderRender = (col, field) => {
    if (col.slots.header) return
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
          return renderSlotError(e)
        }
      })
    } else if (typeof col.headerRender === 'string') {
      const slotName = col.headerRender
      if (typeof externalSlots[slotName] === 'function') {
        col.slots.header = slotName
      }
    }
  }

  // ---------- 叶子列处理：步骤拆分辅助函数 ----------
  // 1) 公共列属性合并（仅对非特殊列生效，避免 checkbox/seq 的居中、showOverflow 干扰）
  const applyCommonColumnProps = (col, rawCol, isSpecialCol) => {
    if (!isSpecialCol && Object.keys(defColumnCommon).length) {
      const merged = { ...defColumnCommon, ...col }
      // 列 slots 在展开 defColumnCommon 时可能被覆盖，重新恢复
      merged.slots = rawCol.slots ? { ...rawCol.slots } : {}
      return merged
    }
    return col
  }

  // 1a) 对齐默认值与一致性：列显式配置 > defaultColumnConfig > 组件默认 'left'
  const applyColumnAlign = (col, colType) => {
    if (colType === 'checkbox' || colType === 'seq') {
      if (col.align == null) col.align = 'center'
      if (col.headerAlign == null) col.headerAlign = 'center'
    } else if (col.headerAlign != null && col.align == null) {
      col.align = col.headerAlign
    } else if (col.align == null && col.headerAlign == null) {
      col.align = 'left'
      col.headerAlign = 'left'
    }
  }

  // 2) 过滤配置自动注入：支持两种等价写法
  //    · filterType: 'FilterCheckbox'（简写，自动注入 filters + filterRender）
  //    · filterRender: { name: 'FilterCheckbox' }（已有 name 时可省略 filterType，
  //      按 name 自动注入 filters，filterRender 保留用户配置）
  const applyFilterTypeConfig = (col) => {
    const typeKey = col.filterType || (col.filterRender && col.filterRender.name)
    if (!typeKey || !filterDefaults[typeKey]) return
    const autoCfg = filterDefaults[typeKey] || {}
    if (col.filters == null && autoCfg.filters) {
      col.filters = autoCfg.filters.map((o) => ({ ...o, data: o.data ? { ...o.data } : {} }))
    }
    if (col.filterRender == null && autoCfg.filterRender) {
      col.filterRender = { ...autoCfg.filterRender }
    }
  }

  // 3) render → slots.default（支持函数式 JSX 或字符串引用外部具名插槽）
  const applyRenderSlot = (col, field) => {
    if (col.slots.default) return
    if (typeof col.render === 'function') {
      const userRender = col.render
      col.slots.default = markRaw((scope) => {
        try {
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
          return renderSlotError(e)
        }
      })
    } else if (typeof col.render === 'string') {
      const slotName = col.render
      if (typeof externalSlots[slotName] === 'function') {
        col.slots.default = slotName
      }
    }
  }

  // 4a) 函数式 editRender → slots.edit（JSX 渲染）
  const applyFunctionEditRender = (col, field, editEnabled) => {
    if (editEnabled) {
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
            return renderSlotError(e)
          }
        })
      }
    }
    // 函数式非 vxe 标准对象，已被 slots.edit 接管渲染，删除以避免 vxe 校验警告
    delete col.editRender
  }

  // 4b) 字符串式 editRender → 引用外部具名插槽
  const applyStringEditRender = (col, editEnabled) => {
    if (editEnabled) {
      if (col.editable == null) col.editable = true
      if (!col.slots.edit) {
        const slotName = col.editRender
        if (typeof externalSlots[slotName] === 'function') {
          col.slots.edit = slotName
        }
      }
    }
    // 字符串式非 vxe 标准对象，已被 slots.edit 接管渲染，删除以避免 vxe 校验警告
    delete col.editRender
  }

  // 4c-1) 构建 Select/Radio/Checkbox 子项（options → VNode 数组）
  const buildWrapOptionChildren = (options, field, wrapName) => {
    const WrapComp = WRAP_COMPONENTS[wrapName]
    return options.map((opt, idx) => {
      const labelText = opt.label != null ? opt.label : opt.value
      const optValue = opt.value != null ? opt.value : opt.label
      const key = `${field}-opt-${idx}-${String(optValue)}`
      const wrapProps = { key }
      if (wrapName === 'ElOption') {
        // ElOption：value + label
        wrapProps.label = labelText
        wrapProps.value = optValue
      } else {
        // ElRadio/ElCheckbox 子项：label 是 group 的选中绑定值
        wrapProps.label = optValue
        wrapProps.value = optValue
      }
      if (opt.disabled != null) wrapProps.disabled = !!opt.disabled
      return h(WrapComp, wrapProps, () => labelText)
    })
  }

  // 弹出面板类编辑控件（下拉/日期/时间面板 teleport 到 body，点击面板时 vxe 会判定为"编辑单元格外部"而退出编辑态）
  // 给 popper 加上 vxe-table--ignore-clear 类，vxe 全局 mousedown 处理器检测到该类会跳过清除编辑态
  const POPUP_EDIT_NAMES = new Set(['ElSelect', 'ElDatePicker', 'ElTimePicker'])
  const IGNORE_CLEAR_CLASS = 'vxe-table--ignore-clear'
  // 合并 popperClass：用户自定义 + ignore-clear（确保点击下拉/日期面板选项时编辑态不被清除）
  const resolvePopperClass = (erName, existing) => {
    if (!POPUP_EDIT_NAMES.has(erName)) return existing
    const parts = [IGNORE_CLEAR_CLASS]
    if (existing) parts.push(existing)
    return parts.join(' ')
  }

  // 4c-2) 对象配置式 editRender：构建 slots.edit 渲染函数（Input 类无子项 / Select·Radio·Checkbox 渲染 options）
  const buildObjectEditSlotFn = (col, field, Comp, wrapName) => markRaw((scope) => {
    const row = scope.row
    const originalVal = field != null && row ? row[field] : undefined
    const currentVal = scope.cellValue != null ? scope.cellValue : originalVal
    // 从全局编辑态取本地值（edit-actived 初始化），避免在 slots 函数里新建 ref/watch
    const stateKey = resolveEditStateKey(row, field)
    if (!(stateKey in editLocalState)) editLocalState[stateKey] = currentVal
    const erName = col.editRender && col.editRender.name
    const extra = {
      modelValue: editLocalState[stateKey],
      'onUpdate:modelValue': (v) => { editLocalState[stateKey] = v },
      // 透传列标题，供自定义编辑组件（如 TextareaPopoverEdit）在头部显示
      title: col.title,
      // 透传 vxe 表格实例（scope.$table），供自定义编辑组件调用 clearActive 等方法退出编辑态
      table: markRaw(scope.$table),
    }
    // 弹出面板类控件：给 popper 加 vxe-table--ignore-clear，防止点击面板选项时退出编辑态
    const popperCls = resolvePopperClass(erName, col.editRender && col.editRender.props && col.editRender.props.popperClass)
    if (popperCls != null) extra.popperClass = popperCls
    // TextareaPopoverEdit 三按钮事件透传：携带 { row, column, field, value } 抛给 tablePro
    if (erName === 'TextareaPopoverEdit') {
      const buildPayload = (val) => ({ row, column: scope.column, field, value: val })
      extra.onClear = (e) => emit('textarea-clear', buildPayload(e?.value ?? editLocalState[stateKey]))
      extra.onCancel = (e) => emit('textarea-cancel', buildPayload(e?.value ?? editLocalState[stateKey]))
      extra.onConfirm = (e) => emit('textarea-confirm', buildPayload(e?.value ?? editLocalState[stateKey]))
    }
    const bindProps = mergeEditCompProps(field, col.editRender, extra)
    // 注：onBlur/onChange 不主动 commit，统一在 edit-closed 提交，避免 vxe 状态机混乱

    // 自动弹出面板（ElSelect/ElDatePicker/ElTimePicker）：组件挂载后调用 focus()
    const onMountedHook = autoOpenOnMounted(erName)
    if (onMountedHook) bindProps.onVnodeMounted = onMountedHook

    if (!wrapName) {
      // Input/InputNumber/DatePicker/TimePicker/Switch/Rate：无子项
      return h(Comp, bindProps)
    }
    // Select/Radio/Checkbox：渲染 options
    const colEditRender = col.editRender || {}
    const options = resolveEditOptions(field, colEditRender)
    const children = buildWrapOptionChildren(options, field, wrapName)
    return h(Comp, bindProps, { default: () => children })
  })

  // 4c-3) 对象配置式 editRender 时，为非编辑态构建 label 回退（基于 editOptions 映射）
  // 注：editEnabled=false 时也生效，确保不可编辑状态下仍按 options 显示 label
  const buildEditLabelFallback = (col, field) => markRaw((scope) => {
    const raw = field != null && scope.row ? scope.row[field] : undefined
    const colEditRender = col.editRender || {}
    const options = resolveEditOptions(field, colEditRender)
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

  // 4c) 对象配置式 editRender → editable + slots.edit + label 回退
  const applyObjectEditRender = (col, field, editEnabled) => {
    if (editEnabled && col.editable == null) col.editable = true
    const erName = col.editRender.name
    const mapEntry = EL_EDIT_MAP[erName]
    if (!mapEntry) return

    const Comp = mapEntry.comp
    const wrapName = mapEntry.wrap
    if (editEnabled && !col.slots.edit) {
      // markRaw 避免 Vue 深度劫持造成渲染循环或状态丢失
      col.slots.edit = buildObjectEditSlotFn(col, field, Comp, wrapName)
    } else if (editEnabled && typeof col.slots.edit === 'string') {
      // 用户写 slots.edit: 'edit_xxx' 字符串时直接交给外部具名插槽
    }
    // 未提供 render/slots.default 时，自动给非编辑态渲染 label 文本（基于 editOptions 映射）
    if (!col.slots.default) {
      col.slots.default = buildEditLabelFallback(col, field)
    }
  }

  // 4) editRender → editable:true + slots.edit（分流：函数式 / 字符串式 / 对象配置式）
  // 优先级：用户显式 slots.edit > editRender（详见 README）
  // props.editable=false 时（权限控制）：不设置 col.editable / 不构建 slots.edit，
  //   点击不进入编辑态、表头无编辑图标；对象式的 slots.default label 回退仍生效（仅显示）
  const applyEditRenderSlot = (col, field) => {
    if (!col.editRender) return
    const editEnabled = props.editable !== false
    if (typeof col.editRender === 'function') {
      applyFunctionEditRender(col, field, editEnabled)
    } else if (typeof col.editRender === 'string') {
      applyStringEditRender(col, editEnabled)
    } else if (col.editRender.name) {
      applyObjectEditRender(col, field, editEnabled)
    }
  }

  // 5) 默认过滤值注入（initParam.filters → col.filters[0].data）
  const applyDefaultFilterValue = (col, field) => {
    if (!col.filters || !col.filters.length || !col.filterRender) return
    const fName = col.filterRender.name
    if (!fName || !FILTER_DEFAULTS[fName]) return
    const defaultVal = initFilters[field]
    if (defaultVal == null) return
    const data = buildFilterDataFromDefault(fName, defaultVal)
    if (!data) return
    col.filters = col.filters.map((opt, i) =>
      i === 0 ? { ...opt, data: { ...data }, checked: isFilterActive(fName, data) } : { ...opt },
    )
  }

  // 叶子列处理总入口：按步骤调用各辅助函数
  const transformLeafColumn = (rawCol) => {
    if (!rawCol || typeof rawCol !== 'object') return rawCol
    const colType = rawCol.type
    const isSpecialCol = !!(colType && /^(checkbox|seq|radio|expand)$/.test(colType))

    let col = { ...rawCol }
    // slots 深拷贝一层，避免污染 rawCol
    col.slots = rawCol.slots ? { ...rawCol.slots } : {}

    // 1) 公共列属性
    col = applyCommonColumnProps(col, rawCol, isSpecialCol)
    // 1a) 对齐默认值与一致性
    applyColumnAlign(col, colType)
    // 2) filterType 自动注入过滤配置
    applyFilterTypeConfig(col)
    // 3) render → slots.default
    const field = col.field || ''
    applyRenderSlot(col, field)
    // 3a) headerRender → slots.header
    applyHeaderRender(col, field)
    // 4) editRender → editable:true + slots.edit
    applyEditRenderSlot(col, field)
    // 5) 默认过滤值注入
    applyDefaultFilterValue(col, field)

    return col
  }

  // 父分组列：只递归子列 + 应用 headerRender，跳过数据列专属逻辑避免错误注入
  // params.hideColumn === true 的列完全不渲染（区别于 visible:false 可在个性化配置中开启）
  const transformColumn = (rawCol) => {
    if (!rawCol || typeof rawCol !== 'object') return rawCol
    // hideColumn=true：直接过滤，不进入 vxe-grid columns，个性化配置也无法开启
    if (rawCol.params && rawCol.params.hideColumn === true) return null
    if (Array.isArray(rawCol.children) && rawCol.children.length) {
      const col = { ...rawCol }
      col.slots = rawCol.slots ? { ...rawCol.slots } : {}
      col.children = rawCol.children.map(transformColumn).filter(Boolean)
      // 父分组列：所有子列都被 hideColumn 隐藏时，父列也不渲染
      if (col.children.length === 0) return null
      // 父分组列也支持 headerRender（自定义表头渲染）
      applyHeaderRender(col, col.field || '')
      return col
    }
    return transformLeafColumn(rawCol)
  }

  return (props.columns || []).map(transformColumn).filter(Boolean)
})

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

// ========== 静态模式前端分页 ==========
// 本地分页状态来自 props.pagerConfig；total 由 data.length 自动计算
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

// 数据长度变化时夹紧 currentPage（避免停留在不存在的页码）
watch(
  () => (props.data || []).length,
  (len) => {
    if (isRemoteMode.value || !props.pagination) return;
    const size = localPager.value.pageSize || 10;
    const maxPage = Math.max(1, Math.ceil(len / size));
    if (localPager.value.currentPage > maxPage) {
      localPager.value.currentPage = maxPage;
    }
  },
);

// 实际渲染数据：远程用 useTable；静态+分页切片 data；静态不分页原样返回
const renderData = computed(() => {
  if (isRemoteMode.value) return tableHook.tableData.value;
  if (!props.pagination) return props.data;
  const all = props.data || [];
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
      total: (props.data || []).length,
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
  const { params: sortParams, paramKeys } = sortStateToParams(initSorts);
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
    const col = findColumnByField(props.columns || [], field);
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
  if (isRemoteMode.value && props.requestAuto) {
    // 注：updatedTotalParam 把 searchParam（含默认 filter/sort）同步到 totalParam，
    // 否则 getTableList 只发 pageParam 会丢失 filter/sort 默认值
    tableHook.updatedTotalParam();
    tableHook.getTableList();
  }
  // 检测父容器链是否有明确高度（快速预判），并启动 ResizeObserver 反馈循环兜底检测
  parentHasDefiniteHeight.value = detectParentDefiniteHeight(rootRef.value);
  // 仅在预判为"有明确高度"时启动兜底（预判为 content-driven 时已不传 height，无循环风险）
  if (parentHasDefiniteHeight.value) {
    startFeedbackDetection(rootRef.value);
  }
});

// 组件卸载前清理 ResizeObserver
onBeforeUnmount(() => {
  stopFeedbackDetection();
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

// ========== 过滤 popover 二次定位 ==========
// vxe transfer=true 下 filter 面板 clamp 时 viewport/document 坐标混用，水平滚动时首尾列弹窗会超出视口
// 每次 filter-visible 后基于视口尺寸二次 clamp，箭头始终指向触发列

// 1. 获取触发元素中心 X（document 坐标系），优先 .vxe-filter--btn，回退列中心
const getFilterTriggerCenterX = (column, fallbackX) => {
  if (!column || !column.id) return fallbackX;
  const colEl = document.querySelector(`.vxe-header--column.${column.id}`);
  if (!colEl) return fallbackX;
  const docScrollLeft =
    document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const filterBtnEl = colEl.querySelector(".vxe-filter--btn");
  const targetEl = filterBtnEl || colEl;
  const targetRect = targetEl.getBoundingClientRect();
  return docScrollLeft + targetRect.left + targetRect.width / 2;
};

// 3. 水平边界 clamp：保证弹窗整体在视口内（宽度溢出时设 maxWidth）
const clampFilterPanelHorizontal = (panel, left, vw, pw, margin) => {
  const docScrollLeft =
    document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const minLeft = docScrollLeft + margin;
  const maxLeft = docScrollLeft + vw - pw - margin;
  if (pw < vw - margin * 2) {
    if (left < minLeft) left = minLeft;
    else if (left > maxLeft) left = maxLeft;
  } else {
    left = minLeft;
    panel.style.maxWidth = `${vw - margin * 2}px`;
  }
  return left;
};

// 4. 垂直边界 clamp（含箭头空间）
const clampFilterPanelVertical = (top, vh, ph, margin) => {
  const docScrollTop =
    document.documentElement.scrollTop || document.body.scrollTop || 0;
  const minTop = docScrollTop + margin;
  const maxTop = docScrollTop + vh - ph - margin;
  if (ph < vh - margin * 2) {
    if (top < minTop) top = minTop;
    else if (top > maxTop) top = maxTop;
  }
  return top;
};

// 5. 计算箭头水平偏移（相对 panel 左上角），clamp 留 12px 防止露出圆角外
const setFilterArrowOffset = (panel, triggerCenterX, left, pw, arrowSize) => {
  const arrowHalf = arrowSize; // 三角形底边一半
  let arrowLeft = triggerCenterX - left;
  const arrowMin = 12 + arrowHalf;
  const arrowMax = pw - 12 - arrowHalf;
  if (arrowLeft < arrowMin) arrowLeft = arrowMin;
  else if (arrowLeft > arrowMax) arrowLeft = arrowMax;
  // 通过 CSS 变量传给 ::before / ::after 伪元素
  panel.style.setProperty("--vxe-filter-arrow-left", `${arrowLeft}px`);
};

// 同步执行面板定位的核心逻辑（供 clampFilterPanelToViewport 与滚动重定位复用）
// recalcFromTrigger=true 时基于触发元素当前位置重新计算 top（滚动场景），
// false 时仅基于面板已有 top 进行 clamp（初次打开场景，vxe 已定位过）
const doClampFilterPanel = (column, recalcFromTrigger = false) => {
  const panel = document.querySelector(
    ".vxe-table--filter-wrapper.is--active",
  );
  if (!panel) return;
  const margin = 16;
  // 箭头本身 8px + 与表头/面板之间 2px 安全间隙
  const ARROW_SIZE = 8;
  const ARROW_GAP = 2;
  const ARROW_EXTRA = ARROW_SIZE + ARROW_GAP;

  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  let left = parseFloat(panel.style.left) || 0;
  let top = parseFloat(panel.style.top) || 0;

  if (recalcFromTrigger) {
    // 滚动重定位：基于触发元素当前 viewport 位置重新计算 top（document 坐标系）
    // 确保面板始终紧跟触发元素，不会因外层滚动容器滚动而偏移
    const colEl =
      column && column.id
        ? document.querySelector(`.vxe-header--column.${column.id}`)
        : null;
    const filterBtnEl = colEl?.querySelector(".vxe-filter--btn");
    const triggerEl = filterBtnEl || colEl;
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      const docScrollTop =
        document.documentElement.scrollTop || document.body.scrollTop || 0;
      const docScrollLeft =
        document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      // 面板顶部 = 触发元素底部 + 箭头空间（document 坐标）
      top = docScrollTop + rect.bottom + ARROW_EXTRA;
      // 面板左对齐触发元素中心
      const triggerCenterX = docScrollLeft + rect.left + rect.width / 2;
      left = triggerCenterX - pw / 2;
      // 水平边界
      left = clampFilterPanelHorizontal(panel, left, vw, pw, margin);
      // 垂直边界
      top = clampFilterPanelVertical(top, vh, ph, margin);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      // 箭头水平偏移
      setFilterArrowOffset(
        panel,
        triggerCenterX,
        left,
        pw,
        ARROW_SIZE,
      );
      // 记录最新基准快照，后续滚动 reposition 用 delta 增量更新
      takeRepositionBaseline(panel);
      return;
    }
    // 触发元素找不到则回退到 clamp 逻辑
  }

  // 初次打开 clamp 逻辑：基于 vxe 已设置的 top/left 进行边界修正
  // 1. 获取触发元素中心 X
  const triggerCenterX = getFilterTriggerCenterX(column, left + pw / 2);
  // 2. 面板整体向下挪 ARROW_EXTRA，给箭头留出表头下方到面板上方的可见空间
  //    否则伪元素 translate(-100%) 会被表头白色背景挡住
  top += ARROW_EXTRA;
  // 3. 水平边界
  left = clampFilterPanelHorizontal(panel, left, vw, pw, margin);
  // 4. 垂直边界
  top = clampFilterPanelVertical(top, vh, ph, margin);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  // 5. 箭头水平偏移
  setFilterArrowOffset(panel, triggerCenterX, left, pw, ARROW_SIZE);
  // 记录最新基准快照，后续滚动 reposition 用 delta 增量更新
  takeRepositionBaseline(panel);
};

// clampFilterPanelToViewport 总入口：nextTick + setTimeout 内按步骤执行
const clampFilterPanelToViewport = async (column) => {
  await nextTick();
  // setTimeout 让 vxe 内部完成 filterStore.style 写入后再覆盖
  setTimeout(() => doClampFilterPanel(column, false), 0);
};

// ========== 滚动时重新定位过滤面板（不关闭面板）==========
// vxe transfer=true 下面板为 position:absolute 定位到 body；
// 当表格位于外层可滚动容器中、或页面发生滚动时，面板不会跟随触发元素，
// 造成视觉偏移。此处使用「基准快照 + delta 增量」方法：
//   - 面板打开 / clamp 后，记录当前 left/top 以及页面 scrollTop/scrollLeft。
//   - 之后的每一次外层滚动，按 scrollTop/Left 的 delta 平移 left/top。
//   - 这样垂直滚动时只改动 top（delta），不重算 left，避免因 viewport/面板宽度等
//     微小波动（滚动条 gutter 出现、clamp 边界浮点）造成水平方向的偏移。
//
// 内部 scroll 跳过：FilterCheckbox 列表的 scroll 不影响外层位置，直接 return。
let activeFilterColumn = null;
let repositionRafId = null;
// 基准快照：记录面板首次 clamp 完成 / 重算整量 时的 left/top 与页面滚动坐标
let filterReposBaseline = null;
const takeRepositionBaseline = (panel) => {
  if (!panel) return;
  filterReposBaseline = {
    left: parseFloat(panel.style.left) || 0,
    top: parseFloat(panel.style.top) || 0,
    docScrollLeft: document.documentElement.scrollLeft || document.body.scrollLeft || 0,
    docScrollTop: document.documentElement.scrollTop || document.body.scrollTop || 0,
  };
};
const repositionActiveFilterPanel = (evt) => {
  if (!activeFilterColumn) return;
  if (repositionRafId != null) return;
  // 若 scroll 事件目标在当前激活的 filter panel 内部（例如 FilterCheckbox 选项列表滚动），
  // 则跳过重定位：面板本身不需要移动。
  if (evt && evt.target instanceof Node) {
    const panelEl = document.querySelector(".vxe-table--filter-wrapper.is--active");
    if (panelEl && panelEl.contains(evt.target)) return;
  }
  repositionRafId = requestAnimationFrame(() => {
    repositionRafId = null;
    const panel = document.querySelector(".vxe-table--filter-wrapper.is--active");
    if (!panel) return;
    // 优先走「基准快照 + delta 增量」，只改需要改的方向，避免引入不必要的偏移
    if (filterReposBaseline) {
      const scrollLeftNow = document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      const scrollTopNow = document.documentElement.scrollTop || document.body.scrollTop || 0;
      const dLeft = scrollLeftNow - filterReposBaseline.docScrollLeft;
      const dTop = scrollTopNow - filterReposBaseline.docScrollTop;
      if (dLeft === 0 && dTop === 0) return;
      const margin = 16;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      // 只在对应方向有滚动时，才更新该方向坐标
      let left = filterReposBaseline.left;
      let top = filterReposBaseline.top;
      if (dLeft !== 0) {
        left = clampFilterPanelHorizontal(panel, filterReposBaseline.left + dLeft, vw, pw, margin);
      }
      if (dTop !== 0) {
        top = clampFilterPanelVertical(filterReposBaseline.top + dTop, vh, ph, margin);
      }
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      return;
    }
    // 无基准快照（极少出现）时回退到按触发元素整量重算
    doClampFilterPanel(activeFilterColumn, true);
  });
};

// 1) window capture 阶段捕获页面外层滚动 + 所有嵌套滚动容器的 scroll 事件
//    （scroll 事件不冒泡，需 capture 才能在 window 层捕获嵌套元素的滚动）
useEventListener(window, "scroll", repositionActiveFilterPanel, {
  capture: true,
});
// 2) 直接监听表格 body wrapper 的 scroll 事件（内层滚动，双保险）
//    bodyWrapperEl 在 gridRef 挂载后动态计算
const filterBodyWrapperEl = computed(() => {
  const el = gridRef.value?.$el;
  if (!el || !el.querySelector) return null;
  return (
    el.querySelector(".vxe-table--body-wrapper") ||
    el.querySelector(".vxe-table--body") ||
    null
  );
});
useEventListener(filterBodyWrapperEl, "scroll", repositionActiveFilterPanel);

// ========== 过滤面板 visible 处理 ==========
// 面板打开：恢复其他列草稿 + 保存当前列快照 + bump 计数器 + clamp 面板位置
const handleFilterPanelOpen = (column) => {
  // 0) 恢复其他列的未确认快照（切换列时清除草稿，与 vxe-table 过滤逻辑一致）
  const $table = gridRef.value;
  if ($table && $table.getColumns) {
    $table.getColumns().forEach((col) => {
      if (col.id !== column.id && pendingFilterSnapshots[col.id]) {
        restoreFilterSnapshot(col);
      }
    });
  }
  // 1) 保存当前列快照（用于关闭未确认时恢复）
  saveFilterSnapshot(column);
  // 2) bump 计数器强制 FilterCheckbox 重新拉取（避免复用串列 / 级联数据陈旧）
  const field = column.field;
  if (field) bumpFilterRefetchCounter(field);
  // 3) 记录当前打开的列，供滚动重定位使用
  activeFilterColumn = column;
  clampFilterPanelToViewport(column);
};

// 面板关闭：若快照仍存在（未点击确定），恢复到打开前状态
const handleFilterPanelClose = (column) => {
  // 清除当前打开列记录（面板已关闭，不再需要滚动重定位）
  activeFilterColumn = null;
  filterReposBaseline = null;
  if (repositionRafId != null) {
    cancelAnimationFrame(repositionRafId);
    repositionRafId = null;
  }
  if (!pendingFilterSnapshots[column.id]) return;
  // nextTick + setTimeout 确保 vxe 内部设置 opt.checked 之后再恢复（优先级最后）
  nextTick(() => {
    setTimeout(() => {
      restoreFilterSnapshot(column);
      syncFilterHeaderClass();
    }, 0);
  });
};

const onFilterVisible = (payload) => {
  ElMessage.success("过滤面板打开");
  if (!payload || !payload.column) return;
  const column = payload.column;
  if (payload.visible) {
    handleFilterPanelOpen(column);
  } else {
    handleFilterPanelClose(column);
  }
};

// ========== 表头过滤 & 排序（渲染器高阶复用）==========
// 关键：active 用 opt.checked（仅「确认」后生效），非 isFilterActive(data)（避免草稿被收集）
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

// 列过滤状态数组 → 扁平请求参数对象 + 涉及的 key 集合
// key 默认取 field，可通过 params.defParamKey 自定义；区间类支持 paramMode: array/split/both（详见 README）
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const filterStateToParams = (filters) => {
  const params = {};
  const paramKeys = new Set();
  (filters || []).forEach((f) => {
    if (!f || !f.active) return;
    const d = f.data || {};
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
          // 多个值始终用数组传递
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
        const ev =
          f.props && f.props.emptyValue !== undefined
            ? f.props.emptyValue
            : null;
        const normalized = raw.map((v) =>
          v == null || v === "" ? ev : v,
        );
        const mode =
          f.props && ["array", "split", "both"].includes(f.props.paramMode)
            ? f.props.paramMode
            : "array";
        // split 两端的 key 命名规则
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
          // 分开格式：按端独立判断
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

// 列过滤 → useTable.search() 联动（仅远程模式生效，静态模式仅抛事件由外部处理）
const applyFilterStateAndSearch = (filterSortPayload) => {
  // 无论是否远程模式，都先记录最新过滤 key（即便当前静态，切到远程也能正确）
  const { params: filterParams, paramKeys } = filterStateToParams(
    filterSortPayload?.filters || [],
  );

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

// 列排序状态数组 → 请求参数对象 + key 集合
// 参数 key 名与格式由 props.sortParamConfig 控制（合并/非合并模式，详细见 README）
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

// 上一轮排序写入的 key（随 sortParamConfig 动态变化），与过滤 key 集合互不重叠
const lastSortParamKeys = new Set();

// 列排序 → useTable.search() 联动（仅远程模式生效）
const applySortStateAndSearch = (sorts) => {
  const { params: sortParams, paramKeys } = sortStateToParams(sorts);
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
  // 是否启用远程过滤选项（FilterCheckbox 据此决定远程/静态模式）
  hasRemoteFilterAPI: () => typeof props.requestFilterAPI === "function",
  // 每列重新拉取计数器：面板打开 bump 一次，FilterCheckbox 监听后强制重新 fetch
  filterRefetchCounter,
  clearCurrent: resetColumnFilter,
  clearAll: resetAllFilter,
  emitConfirm: (params) => {
    // 清除快照（确认的改动保留，面板关闭时不再恢复）
    const col = params && params.column;
    if (col) clearFilterSnapshot(col);
    const payload = getFilterSortState();
    applyFilterAndSyncHeader(payload);
    emit("filter-confirm", payload);
  },
  emitReset: (params) => {
    const col = params && params.column;
    // 更新快照为重置后的状态（重置立即生效，后续关闭面板不再恢复到重置前）
    if (col) updateFilterSnapshot(col);
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
  ElMessage.success("多选");
  selectionChange(e?.records || []);
  emit("checkbox-change", e);
};
const onCheckboxAll = (e) => {
  ElMessage.success("全选");
  selectionChange(e?.records || []);
  emit("checkbox-all", e);
};
const onRadioChange = (e) => {
  ElMessage.success("单选");
  radioChange(e?.row || null);
  emit("radio-change", e);
};

// 内置「重置过滤」工具按钮：清空所有列过滤条件并触发重置事件
const onResetAllFilter = () => {  
  ElMessage.success("重置所有过滤");
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

// ========== 高度反馈循环检测（修复 table-height-grow）==========
// 根因：vxe-grid 在 height="auto"/"100%" 时会 inline style.height=100% 并让内部 vxe-table
//   通过 ResizeObserver 监听父容器，使用 parentHeight 计算 customHeight。当父容器链无明确高度
//   （content-driven，如 el-form-item > div[height:100%]、el-dialog > el-tabs）时，parentHeight
//   会随表格实际渲染高度变化，形成 ResizeObserver 反馈循环（高度持续增长，每轮 +10~12px）。
// 修复策略（双重防线）：
//   1) onMounted 时 detectParentDefiniteHeight 同步预判明显的 content-driven 场景（快速路径）。
//   2) ResizeObserver 持续监听 .vxe-table 高度，若短时间内累计增长超阈值则判定为反馈循环（兜底，
//      覆盖预判失效的场景，如 el-dialog 打开动画期间 / el-tabs 切换过渡期执行预判不准）。
//   任一防线判定为 content-driven → 不向 vxe-grid 传 height，让 vxe-table 进入 content-driven
//   模式（customHeight=0），打破循环。
//   （参见 node_modules/vxe-table/packages/grid/src/grid.ts computeStyles、
//    node_modules/vxe-table/packages/table/src/table.ts calcTableHeight）
const parentHasDefiniteHeight = ref(true);
const feedbackLoopDetected = ref(false);
let feedbackObserver = null;
let lastTableH = 0;
// 反馈循环检测：持续小幅增长（2-30px/轮）连续 3 次判定为循环。
// 数据加载的大幅跳变（>30px）不计数，避免误判。
const SMALL_GROWTH_MIN = 2;
const SMALL_GROWTH_MAX = 30;
const CONSECUTIVE_GROWTH_LIMIT = 3;

// 检测某元素的父容器链是否有明确高度（content-driven 检测，快速预判）
// 原理：遍历父链，检查是否有祖先的 computed height 为明确像素值（如 500px、695.2px）。
//   - 遇到明确像素高度 → 有明确高度 → 返回 true
//   - 整条链都是 auto/百分比（无法解析为固定值）→ content-driven → 返回 false
// 相比塌缩测试（临时置 0 高度比较 clientHeight），此方案不依赖布局时序，在 onMounted 时更可靠。
// ResizeObserver 兜底仍保留，覆盖动画期间父容器高度变化导致预判失效的场景。
const detectParentDefiniteHeight = (el) => {
  if (!el || !el.parentElement) return true;
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const computedHeight = getComputedStyle(parent).height;
    // computed height 为明确像素值（非 "auto"、非百分比、> 0）→ 父链有明确高度
    if (
      computedHeight &&
      computedHeight !== "auto" &&
      !computedHeight.endsWith("%") &&
      parseFloat(computedHeight) > 0
    ) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
};

// 启动 ResizeObserver 反馈循环兜底检测（监听 .vxe-table 高度持续小幅增长）
// 仅在预判为"有明确高度"时启动（预判为 content-driven 时已不传 height，无反馈循环风险）。
// 检测策略：区分"数据加载的正常跳变"与"反馈循环的持续小幅增长"。
//   - 数据加载：空表 → 有数据，delta 通常 > 30px（一次性大跳变），重置计数
//   - 反馈循环：每轮 delta ≈ 2-30px，连续多次，判定为循环
const startFeedbackDetection = (rootEl) => {
  const target = rootEl?.querySelector?.(".vxe-table");
  if (!target || feedbackObserver) return;
  lastTableH = target.clientHeight;
  let consecutiveSmallGrowth = 0;
  feedbackObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    const newH = entry.contentRect.height;
    const delta = newH - lastTableH;
    if (delta >= SMALL_GROWTH_MIN && delta <= SMALL_GROWTH_MAX) {
      consecutiveSmallGrowth++;
      if (consecutiveSmallGrowth >= CONSECUTIVE_GROWTH_LIMIT) {
        feedbackLoopDetected.value = true;
        stopFeedbackDetection();
      }
    } else {
      // 大幅增长（数据加载）或减少/不变 → 重置
      consecutiveSmallGrowth = 0;
    }
    lastTableH = newH;
  });
  feedbackObserver.observe(target);
};

const stopFeedbackDetection = () => {
  if (feedbackObserver) {
    feedbackObserver.disconnect();
    feedbackObserver = null;
  }
};

// 是否向 vxe-grid 透传 height prop
const shouldPassHeightToGrid = computed(() => {
  // 反馈循环兜底检测命中 → 不传 height
  if (feedbackLoopDetected.value) return false;
  const h = props.height;
  // 用户显式指定具体数值（非 auto/100%）→ 不会触发反馈循环，直接透传
  if (h != null && h !== "auto" && h !== "100%") return true;
  // height 为 auto/100%（默认值）→ 取决于父容器是否有明确高度
  return parentHasDefiniteHeight.value;
});

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
      // 父容器无明确高度时（content-driven）不传 height，避免 ResizeObserver 反馈循环
      // （见 shouldPassHeightToGrid 注释）
      height: shouldPassHeightToGrid.value ? props.height : undefined,
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
  clearSort: () => gridRef.value?.clearSort?.(),
  clearFilter: () => gridRef.value?.clearFilter?.(),
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
});
</script>

<template>
  <div ref="rootRef" class="table-pro" :class="attrs.class" :style="attrs.style">
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
      :visible="pagination"
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

        // 排序、过滤、编辑图标：不可压缩，始终完整显示
        .vxe-cell--sort,
        .vxe-cell--filter,
        .vxe-cell--edit-icon {
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
