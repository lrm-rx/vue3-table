/**
 * 列配置构建器（纯函数）：由原始 columns（可含 filterType/render/editRender/headerRender 等
 * 自定义简写）产出 vxe-grid 可直接消费的合并列配置。
 *
 * 原为 tablePro/index.vue 中 mergedColumns computed 的全部逻辑，抽离为模块后：
 *  - 不直接读写组件 props / emit / 响应式状态，一律通过 config 入参传入；
 *  - 便于单元测试覆盖列转换规则（简写注入 / 对齐 / render→slots / editRender 分流等）。
 *
 * 组件侧用法：
 *   const mergedColumns = computed(() =>
 *     buildColumns({
 *       columns: props.columns,
 *       defaultColumnConfig: props.defaultColumnConfig,
 *       initParam: props.initParam,
 *       slots,                 // useSlots() 结果，支持 render 字符串引用具名插槽
 *       editable: props.editable,
 *       editOptions: props.editOptions,
 *       cellEditProps: props.cellEditProps,
 *       editLocalState,        // 编辑态本地值容器（reactive 对象，单元格编辑期间读写）
 *       resolveEditStateKey,   // (row, field) => 稳定 key
 *       getAlwaysEditValue,    // (row, field) => 值 常驻编辑（alwaysEdit）取展示值（本地输入优先）
 *       onAlwaysEditInput,     // (payload) => void 常驻编辑值变更（每次输入，仅更新本地值）
 *       onAlwaysEditCommit,    // (payload) => void 常驻编辑落盘（失焦/卸载时写回 row）
 *       emit,                  // 组件 emit（textarea-* 三按钮事件透传）
 *     }),
 *   );
 */
import { h, markRaw, cloneVNode, isVNode, Fragment } from "vue";
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
  ElCascader,
  ElColorPicker,
  ElSwitch,
  ElRate,
} from "element-plus";
// 自定义编辑控件（在 EL_EDIT_MAP 中注册后即可通过 editRender: { name: 'XxxEdit' } 使用）
import TextareaPopoverEdit from "../editors/TextareaPopoverEdit.vue";
import { FILTER_DEFAULTS, isFilterActive } from "../filters/filter-config.js";
import { cloneFilterData, buildFilterDataFromDefault } from "./filterState.js";

// ========== Element Plus 组件映射（editRender.name -> 组件 + 选项包裹配置）==========
// 模块作用域常量：每次构建复用时避免重建
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
  // defaultProps：合并进编辑控件的兜底 props（优先级低于 editRender.props / cellEditProps）
  // ElTimePicker 必须带 valueFormat：EP parseDate 对无法解析的字符串返回 undefined
  // （如 "09:30:00" 非 ISO 格式），parsedValue=undefined 会导致面板渲染崩溃（spinnerDate undefined）
  ElTimePicker:   { comp: ElTimePicker,   defaultProps: { valueFormat: 'HH:mm:ss' } },
  // 弹出面板类：cascader 下拉面板 / color-picker 取色面板（popperClass 保护见 POPUP_EDIT_NAMES）
  ElCascader:     { comp: ElCascader },
  ElColorPicker:  { comp: ElColorPicker },
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

// 读取某列的编辑选项数组：editRender.props.options 优先于 editOptions[field]
const resolveEditOptions = (field, editRender, editOptions) => {
  if (editRender && Array.isArray(editRender.options)) return editRender.options
  const eo = editOptions || {}
  return Array.isArray(eo[field]) ? eo[field] : []
}
// 合并编辑控件 props：baseProps（EL_EDIT_MAP.defaultProps 兜底）+ editRender.props
// + editRender.props.props + cellEditProps[field] + v-model
const mergeEditCompProps = (field, editRender, cellEditProps, extra = {}, baseProps = {}) => {
  const erProps = (editRender && editRender.props) || {}
  const innerProps = erProps.props || {}
  const cep = cellEditProps || {}
  const commonProps = cep[field] || {}
  return {
    ...baseProps,            // 组件级兜底 props（如 ElTimePicker 的 valueFormat，优先级最低）
    ...erProps,              // editRender.props 顶层（如 activeValue / type）
    ...innerProps,           // editRender.props.props（标准 props 容器）
    ...commonProps,          // 外部 :cell-edit-props 注入（优先级更高）
    ...extra,                // v-model 等基础绑定（优先级最高）
  }
}

// ========== 列查找/遍历工具（支持表头分组 children 递归）==========
export const findColumnByField = (cols, field) => {
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
export const forEachLeafColumn = (cols, fn) => {
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

// 省略号前置处理：将函数式 render 返回 vnode 树中「数组子级里的裸文本」包一层
// .table-pro__cell-text。原因：flex 容器内的裸文本是匿名 flex 项，
// CSS text-overflow 无法对其生效；包一层具名元素后由组件省略样式统一裁剪省略。
// 注意：只处理 vnode（不触碰真实 DOM），避免与 Vue 的 patch 机制冲突。
export const wrapBareTextVNodes = (node) => {
  if (Array.isArray(node)) return node.map(wrapBareTextVNodes)
  if (typeof node === 'number') {
    return h('span', { class: 'table-pro__cell-text' }, String(node))
  }
  if (typeof node === 'string') {
    // 保留纯空白（JSX 格式化产生的缩进/换行）
    if (!node.trim()) return node
    return h('span', { class: 'table-pro__cell-text' }, node)
  }
  if (
    isVNode(node) &&
    Array.isArray(node.children) &&
    (typeof node.type === 'string' || node.type === Fragment)
  ) {
    // 不用 cloneVNode：Vue 3.5 的 cloneVNode 第三参 children 不生效，用 h 重建
    return h(
      node.type,
      { ...node.props, key: node.key, ref: node.ref },
      wrapBareTextVNodes(node.children),
    )
  }
  return node
}

// 操作列标记类：params.isAction === true 的列注入该类，
// 组件样式据此把该列排除在「插槽/JSX 内容超宽省略」之外（按钮等操作内容应完整显示）
export const NO_ELLIPSIS_CLASS = "table-pro__col--no-ellipsis";

// 读取列自定义参数 key：取 col.params.defParamKey，兜底 field
export const resolveParamKey = (col, fallbackField) => {
  if (!col) return fallbackField
  return (col.params && col.params.defParamKey) || col.field || fallbackField
}

// ========== 单元格编辑：自动聚焦 / 自动弹出面板 ==========
// 进入编辑态后自动聚焦/展开的组件集合（对象配置式按 name 命中；插槽式经 attachSlotAutoOpen 按能力探测）
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
  // ElColorPicker 暴露的是 show()/hide()（无 handleOpen）
  if (proxy && typeof proxy.show === 'function') proxy.show()
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
    const comp = vnode && vnode.component
    // 注意：expose() 的方法挂在 component.exposed 上（instance.proxy 拿不到），
    // 如 ElTimePicker.handleOpen / ElColorPicker.show，必须优先从 exposed 取
    const api = (comp && (comp.exposed || comp.proxy)) || undefined
    const proxy = comp && comp.proxy
    const rawEl = (proxy && proxy.$el) || (vnode && vnode.el)
    // 若是 Text/Comment 节点，向上找最近的 Element（Fragment 组件如 ElDatePicker）
    const el = rawEl && rawEl.nodeType === 1 ? rawEl : (rawEl && rawEl.parentElement)
    const trigger = () => {
      try {
        if (AUTO_FOCUS_EDIT_NAMES.has(erName) || erName === 'TextareaPopoverEdit') {
          autoFocusTextInput(erName, el, api)
        } else if (AUTO_POPUP_EDIT_NAMES.has(erName)) {
          autoOpenPopupComp(erName, el, api)
        }
      } catch (e) {
        /* ignore */
      }
    }
    setTimeout(trigger, 0)
  }
}

// 插槽式编辑（函数式/字符串式 editRender、slots.edit 字符串）的自动弹出：
// 用户插槽渲染的组件 tablePro 未知，按能力探测（点击单元格进入编辑后立刻弹出面板）。
// 普通输入类无需处理：vxe 依据 editRender.autofocus 自动聚焦 cell 内第一个 input/textarea

// 1) 组件实例能力：expose() 的方法挂在 component.exposed 上，instance.proxy 拿不到
//    （ElDatePicker/ElTimePicker/ElCascader/ElColorPicker 等暴露 handleOpen()/show()）
const tryOpenSlotByApi = (api) => {
  if (api && typeof api.handleOpen === 'function') { api.handleOpen(); return true }
  if (api && typeof api.show === 'function') { api.show(); return true }
  return false
}

// 2) DOM 兜底：ElSelect 点击 .el-select__wrapper 触发内部 toggleMenu（部分版本未暴露 handleOpen）；
//    通用 .el-input__wrapper：mousedown + focus + click（ElDatePicker 系监听 wrapper 而非 input）
const openSlotByDomFallback = (el) => {
  const selectWrapper = el.querySelector('.el-select__wrapper')
  if (selectWrapper) {
    selectWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return
  }
  const inputWrapper = el.querySelector('.el-input__wrapper')
  if (!inputWrapper) return
  inputWrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  const inputEl = inputWrapper.querySelector('input')
  if (inputEl && typeof inputEl.focus === 'function') {
    inputEl.focus()
    inputEl.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
  }
  inputWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

const autoOpenSlotVnode = (vnode) => {
  const comp = vnode && vnode.component
  const api = (comp && (comp.exposed || comp.proxy)) || undefined
  if (tryOpenSlotByApi(api)) return
  const proxy = comp && comp.proxy
  const rawEl = (proxy && proxy.$el) || (vnode && vnode.el)
  // Fragment 组件的 vnode.el 可能是 Text/Comment 节点，向上找最近的 Element
  const el = rawEl && rawEl.nodeType === 1 ? rawEl : (rawEl && rawEl.parentElement)
  if (!el || !el.querySelector) return
  openSlotByDomFallback(el)
}

// 给插槽式编辑渲染结果附加 onVnodeMounted（挂载后下一拍自动弹出，与对象式 autoOpenOnMounted 对齐）。
// 仅包裹组件 vnode（元素/文本/Fragment 不处理）；setTimeout(0) 等 Element Plus 内部初始化完成
const attachSlotAutoOpen = (vnodes) => {
  const attach = (vn) => {
    const type = vn && vn.type
    if (!type || typeof type === 'string' || typeof type === 'symbol') return vn
    return cloneVNode(vn, {
      onVnodeMounted: (mountedVn) => {
        try { setTimeout(() => autoOpenSlotVnode(mountedVn), 0) } catch (e) { /* ignore */ }
      },
    })
  }
  if (Array.isArray(vnodes)) return vnodes.map(attach)
  return attach(vnodes)
}

// 弹出面板类编辑控件（下拉/日期/时间/级联/取色面板 teleport 到 body，点击面板时 vxe 会判定为"编辑单元格外部"而退出编辑态）
// 给 popper 加上 vxe-table--ignore-clear 类，vxe 全局 mousedown 处理器检测到该类会跳过清除编辑态
// 注：插槽式（editRender: 'edit_xxx'）/函数式 editRender 的弹出组件与过滤面板内弹层
// 无法在此注入 popperClass，由 index.vue 的「弹出面板编辑保护」（捕获阶段补类）统一兜底
const POPUP_EDIT_NAMES = new Set([
  'ElSelect',
  'ElDatePicker',
  'ElTimePicker',
  'ElCascader',
  'ElColorPicker',
])
const IGNORE_CLEAR_CLASS = 'vxe-table--ignore-clear'
// 合并 popperClass：用户自定义 + ignore-clear（确保点击下拉/日期面板选项时编辑态不被清除）
const resolvePopperClass = (erName, existing) => {
  if (!POPUP_EDIT_NAMES.has(erName)) return existing
  const parts = [IGNORE_CLEAR_CLASS]
  if (existing) parts.push(existing)
  return parts.join(' ')
}

// 应用 headerRender → slots.header（叶子列与父分组列共用）
// 优先级：用户显式 slots.header > col.headerRender。支持函数式 JSX 或字符串引用具名插槽
const applyHeaderRender = (ctx, col, field) => {
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
    if (typeof ctx.externalSlots[slotName] === 'function') {
      col.slots.header = slotName
    }
  }
}

// ---------- 叶子列处理：步骤拆分辅助函数（共享上下文 ctx 由 buildColumns 注入）----------
// 1) 公共列属性合并（仅对非特殊列生效，避免 checkbox/seq 的居中、showOverflow 干扰）
const applyCommonColumnProps = (ctx, col, rawCol, isSpecialCol) => {
  if (!isSpecialCol && Object.keys(ctx.defColumnCommon).length) {
    const merged = { ...ctx.defColumnCommon, ...col }
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
const applyFilterTypeConfig = (ctx, col) => {
  const typeKey = col.filterType || (col.filterRender && col.filterRender.name)
  if (!typeKey || !ctx.filterDefaults[typeKey]) return
  const autoCfg = ctx.filterDefaults[typeKey] || {}
  if (col.filters == null && autoCfg.filters) {
    // 逐列深拷贝默认 data（含 values 数组）：filterDefaults 的 data 字面量是模块级
    // 共享的，浅拷贝会让多列引用同一数组，导致一列的默认值/重置影响其他列
    col.filters = autoCfg.filters.map((o) => ({
      ...o,
      data: o.data ? cloneFilterData(o.data) : {},
    }))
  }
  if (col.filterRender == null && autoCfg.filterRender) {
    col.filterRender = { ...autoCfg.filterRender }
  }
}

// 3) render → slots.default（支持函数式 JSX 或字符串引用外部具名插槽）
const applyRenderSlot = (ctx, col, field) => {
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
        return wrapBareTextVNodes(userRender(params, h))
      } catch (e) {
        return renderSlotError(e)
      }
    })
  } else if (typeof col.render === 'string') {
    const slotName = col.render
    if (typeof ctx.externalSlots[slotName] === 'function') {
      col.slots.default = slotName
    }
  }
}

// 函数式/字符串式 editRender 的标记渲染器名：
// vxe 仅凭 isEnableConf(column.editRender)（truthy 且 enabled!==false）判定列可编辑
//   —— 点击激活（edit/hook.js handleEditActive）、编辑态渲染（cell.js runRenderer）、
//      表头编辑图标（cell.js renderEditHeader）全部以此为开关；
// 而 columnInfo 初始化对「truthy 但非对象」的 editRender 会抛 errProp 警告。
// 因此函数/字符串既不能原样保留，也不能直接删除（删除=列不可编辑：点击无反应、无图标），
// 统一替换为该标记对象：实际渲染完全由 col.slots.edit 接管
// （runRenderer 优先调用 edit 插槽，不会查 renderer 表）。
const SLOT_EDIT_RENDER_NAME = 'TableProSlotEdit'
// autofocus: true → vxe 编辑激活后（handleFocus，默认 editConfig.autoFocus=true）
// 自动匹配 cell 内第一个 input/textarea 并聚焦；
// 函数式/字符串式的 slots.edit 是用户自定义控件、无注册 renderer 可提供
// tableAutoFocus，必须显式声明 autofocus 才能点击后自动聚焦
const buildSlotEditRender = () => ({ name: SLOT_EDIT_RENDER_NAME, autofocus: true })

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
          return attachSlotAutoOpen(userEdit(params, h))
        } catch (e) {
          return renderSlotError(e)
        }
      })
    }
    // 保留 vxe 合法的对象式 editRender 标记，列才可点击编辑 / 显示表头编辑图标
    col.editRender = buildSlotEditRender()
  } else {
    // 不可编辑（权限控制）：彻底移除，避免 vxe 非对象配置警告
    delete col.editRender
  }
}

// 4b) 字符串式 editRender → 引用外部具名插槽
const applyStringEditRender = (ctx, col, editEnabled) => {
  if (editEnabled) {
    if (col.editable == null) col.editable = true
    const slotName = col.editRender
    if (!col.slots.edit && typeof ctx.externalSlots[slotName] === 'function') {
      // 包一层以附加自动弹出钩子（直接赋 slotName 字符串则无法注入 onVnodeMounted）；
      // vxe 对 slots.edit 函数与字符串的处理等价（callSlot），行为不变
      col.slots.edit = markRaw((scope) => attachSlotAutoOpen(ctx.externalSlots[slotName](scope)))
    }
    // 仅当插槽命中（slots.edit 已就绪）时保留可编辑标记；
    // 插槽缺失时移除配置，避免出现「有编辑图标但点击无控件」的坏列
    if (col.slots.edit) {
      col.editRender = buildSlotEditRender()
    } else {
      delete col.editRender
    }
  } else {
    // 不可编辑（权限控制）：彻底移除，避免 vxe 非对象配置警告
    delete col.editRender
  }
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

// 4c-2) 对象配置式 editRender：构建 slots.edit 渲染函数（Input 类无子项 / Select·Radio·Checkbox 渲染 options）
const buildObjectEditSlotFn = (ctx, col, field, Comp, wrapName) => markRaw((scope) => {
  const row = scope.row
  const originalVal = field != null && row ? row[field] : undefined
  const currentVal = scope.cellValue != null ? scope.cellValue : originalVal
  // 从全局编辑态取本地值（edit-actived 初始化），避免在 slots 函数里新建 ref/watch
  const stateKey = ctx.resolveEditStateKey(row, field)
  if (!(stateKey in ctx.editLocalState)) ctx.editLocalState[stateKey] = currentVal
  const erName = col.editRender && col.editRender.name
  const extra = {
    modelValue: ctx.editLocalState[stateKey],
    'onUpdate:modelValue': (v) => { ctx.editLocalState[stateKey] = v },
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
    // 透传当前行/列/字段上下文，供函数式属性（如 placeholder: ({ row }) => ...）按行求值
    extra.row = row
    extra.column = scope.column
    extra.field = field
    const buildPayload = (val) => ({ row, column: scope.column, field, value: val })
    extra.onClear = (e) => ctx.emit('textarea-clear', buildPayload(e?.value ?? ctx.editLocalState[stateKey]))
    extra.onCancel = (e) => ctx.emit('textarea-cancel', buildPayload(e?.value ?? ctx.editLocalState[stateKey]))
    extra.onConfirm = (e) => ctx.emit('textarea-confirm', buildPayload(e?.value ?? ctx.editLocalState[stateKey]))
  }
  const bindProps = mergeEditCompProps(
    field,
    col.editRender,
    ctx.cellEditProps,
    extra,
    (EL_EDIT_MAP[erName] && EL_EDIT_MAP[erName].defaultProps) || {},
  )
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
  const options = resolveEditOptions(field, colEditRender, ctx.editOptions)
  const children = buildWrapOptionChildren(options, field, wrapName)
  return h(Comp, bindProps, { default: () => children })
})

// 4c-3) 对象配置式 editRender 时，为非编辑态构建 label 回退（基于 editOptions 映射）
// 注：editEnabled=false 时也生效，确保不可编辑状态下仍按 options 显示 label
const buildEditLabelFallback = (ctx, col, field) => markRaw((scope) => {
  const raw = field != null && scope.row ? scope.row[field] : undefined
  const colEditRender = col.editRender || {}
  const options = resolveEditOptions(field, colEditRender, ctx.editOptions)
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

// ========== 常驻编辑器（列 alwaysEdit: true）==========
// 语义：编辑器不由 vxe 编辑态渲染，而是直接填充单元格默认插槽 —— 始终显示输入类组件；
// 输入只更新组件本地值（防抖 300ms / 失焦 / 卸载时写回 row[field]），
// 点击单元格不再切换「显示态 / 编辑态」（因此也不设置 col.editable）。
// 约束：
//   · 仅支持对象式（EL_EDIT_MAP）/ 函数式 / 字符串式 editRender；
//   · TextareaPopoverEdit 依赖编辑态生命周期（clearEdit 关闭 popover），不参与常驻模式；
//   · 用户显式配置 slots.default 时以用户配置为准（不接管）；
//   · 用户显式配置 slots.edit 时复用到常驻位置（值由用户自行绑 row[field]）。
const ALWAYS_EDIT_CLASS = 'table-pro__col--always-edit'
// 「输入框外观」标记类，两种用法：
//   1. 配置了 alwaysEdit 但编辑器无法常驻（如 TextareaPopoverEdit 依赖编辑态生命周期）时
//      由组件自动追加到列上；实际点击仍走普通编辑流程；
//   2. 行级可编辑：列 className 传函数（或 JSX 渲染内容）按行数据判断后自行返回该类
const INPUT_LOOK_CLASS = 'table-pro__col--input-look'
const PLACEHOLDER_CLASS = 'table-pro__cell-placeholder'
const ALWAYS_EDIT_EXCLUDED_NAMES = new Set(['TextareaPopoverEdit'])

// 给列追加标记类（className / headerClassName 均支持字符串或返回字符串的函数）
const appendClassField = (col, key, cls) => {
  const append = (base) => (base ? `${base} ${cls}` : cls)
  if (typeof col[key] === 'function') {
    const userCls = col[key]
    col[key] = (params) => append(userCls(params))
    return
  }
  col[key] = append(col[key])
}
const appendColumnClass = (col, cls) => appendClassField(col, 'className', cls)
const appendHeaderClass = (col, cls) => appendClassField(col, 'headerClassName', cls)

// 常驻编辑列标记类：组件样式据此让编辑器撑满单元格、不被省略号裁剪
const applyAlwaysEditClass = (col) => appendColumnClass(col, ALWAYS_EDIT_CLASS)

// 窄列查看优化：文本型常驻编辑器在内容溢出（scrollWidth > clientWidth）时，
// 悬停用原生 title 显示完整值；未溢出则移除 title，避免无意义提示
const OVERFLOW_TITLE_NAMES = new Set(['ElInput'])
const bindOverflowTitle = (bindProps, erName) => {
  if (!OVERFLOW_TITLE_NAMES.has(erName)) return
  // 用 mouseover 而非 mouseenter：ElInput 声明了 mouseenter emit（监听器不会落到 DOM 上），
  // mouseover 未声明，会作为原生事件透传到根元素/输入框
  const userOver = bindProps.onMouseover
  bindProps.onMouseover = (e) => {
    if (typeof userOver === 'function') userOver(e)
    const root = (e && (e.currentTarget || e.target)) || null
    const el = (root && root.querySelector && root.querySelector('input, textarea')) || root
    if (!el || typeof el.scrollWidth !== 'number') return
    const value = el.value != null ? el.value : el.textContent
    if (value && el.scrollWidth > el.clientWidth + 1) {
      el.setAttribute('title', String(value))
    } else {
      el.removeAttribute('title')
    }
  }
}

// 仅对象式编辑器配置（有 name）才加外观提示：
// 字符串插槽未注册等「无编辑器可用」的情况不加，避免误导
const isAlwaysEditLookFallback = (er) =>
  !!er && typeof er === 'object' && !!er.name

// 对象配置式常驻编辑器：输入只更新本地值（组件侧防抖写回 row），不做逐键行写回
// 注意：er 必须在构建期传入 —— 常驻模式会删除 col.editRender，渲染期再读会丢失配置
const buildAlwaysEditSlotFn = (ctx, col, field, Comp, wrapName, er) => markRaw((scope) => {
  const row = scope.row
  const column = scope.column || col
  const erName = er && er.name
  const extra = {
    modelValue: typeof ctx.getAlwaysEditValue === 'function'
      ? ctx.getAlwaysEditValue(row, field)
      : (field != null && row ? row[field] : undefined),
    // 每次输入：仅记入组件本地值（防抖/失焦/卸载时才写回 row）
    'onUpdate:modelValue': (v) => {
      if (typeof ctx.onAlwaysEditInput === 'function') {
        ctx.onAlwaysEditInput({ row, column, field, value: v })
      }
    },
    // 透传表格实例（scope.$table）；不再透传列标题 —— 常驻模式下 title 会成为
    // ElInput 等控件的原生 title（悬停显示「账号」而非内容），且会覆盖溢出提示
    table: markRaw(scope.$table),
  }
  const popperCls = resolvePopperClass(erName, er && er.props && er.props.popperClass)
  if (popperCls != null) extra.popperClass = popperCls
  const bindProps = mergeEditCompProps(
    field,
    er,
    ctx.cellEditProps,
    extra,
    (EL_EDIT_MAP[erName] && EL_EDIT_MAP[erName].defaultProps) || {},
  )
  // 失焦 / 单元格卸载（虚拟滚动回收、切页）立即写回，避免防抖窗口内丢输入；
  // 保留用户自带的 onBlur，先落盘再透传
  const commitAlwaysEdit = () => {
    if (typeof ctx.onAlwaysEditCommit === 'function') {
      ctx.onAlwaysEditCommit({ row, column, field })
    }
  }
  const userOnBlur = bindProps.onBlur
  bindProps.onBlur = (e) => {
    commitAlwaysEdit()
    if (typeof userOnBlur === 'function') userOnBlur(e)
  }
  bindProps.onVnodeUnmounted = commitAlwaysEdit
  // 窄列：内容被截断时悬停显示完整值（原生 title，不改布局）
  bindOverflowTitle(bindProps, erName)
  if (!wrapName) return h(Comp, bindProps)
  const options = resolveEditOptions(field, er, ctx.editOptions)
  return h(Comp, bindProps, { default: () => buildWrapOptionChildren(options, field, wrapName) })
})

// ========== alwaysEdit 各接管分支（拆分为独立小函数，控制圈复杂度）==========

// 包装"用户自绑 row[field]"的编辑器渲染：附加即时脏态监听登记
const wrapWithRawWatch = (registerRawWatch, renderFn) =>
  markRaw((scope) => {
    if (registerRawWatch) registerRawWatch(scope)
    return renderFn(scope)
  })

// 分支1：slots.edit 为函数（用户自定义编辑器渲染）
const buildAlwaysEditUserSlot = (userEditSlot, registerRawWatch) =>
  wrapWithRawWatch(registerRawWatch, (scope) => userEditSlot(scope))

// 分支2：slots.edit / editRender 为字符串（外部具名插槽）
const buildAlwaysEditNamedSlot = (ctx, slotName, registerRawWatch) => {
  if (typeof ctx.externalSlots[slotName] !== 'function') return null
  return wrapWithRawWatch(registerRawWatch, (scope) => ctx.externalSlots[slotName](scope))
}

// 分支3：editRender 为函数（用户自定义渲染函数）
const buildAlwaysEditUserRender = (ctx, col, field, userEdit, registerRawWatch) =>
  wrapWithRawWatch(registerRawWatch, (scope) => {
    try {
      const row = scope.row
      const params = {
        row,
        column: scope.column || col,
        field,
        cellValue: field != null && row ? row[field] : undefined,
        rowIndex: scope.$rowIndex,
        columnIndex: scope.$columnIndex,
        $table: scope.$table,
      }
      return userEdit(params, h)
    } catch (e) {
      return renderSlotError(e)
    }
  })

// 分支4：对象式 editRender（内置 EL 组件映射）
const buildAlwaysEditObjectRender = (ctx, col, field, er) => {
  const erName = er && er.name
  if (!erName || !EL_EDIT_MAP[erName] || ALWAYS_EDIT_EXCLUDED_NAMES.has(erName)) return null
  return buildAlwaysEditSlotFn(
    ctx,
    col,
    field,
    EL_EDIT_MAP[erName].comp,
    EL_EDIT_MAP[erName].wrap,
    er,
  )
}

// 解析 placeholder（支持字符串 / 函数式 ({ row, column, field }) => string），
// 优先级与 mergeEditCompProps 一致：cellEditProps 注入 > editRender.props.props > editRender.props
const resolveEditPlaceholder = (ctx, col, field, scope) => {
  const erProps = (col.editRender && col.editRender.props) || {}
  const innerProps = erProps.props || {}
  const cellProps = (ctx.cellEditProps && ctx.cellEditProps[field]) || {}
  const raw = cellProps.placeholder ?? innerProps.placeholder ?? erProps.placeholder
  if (typeof raw === 'function') {
    try {
      return raw({ row: scope.row, column: scope.column || col, field })
    } catch (e) {
      return ''
    }
  }
  return raw
}

// 无法常驻的编辑器：非编辑态展示「值 / placeholder」，
// 让模拟输入框在空值时也能看到占位提示（与真实输入框一致）
const buildAlwaysEditLookSlot = (ctx, col, field) => markRaw((scope) => {
  const row = scope.row
  const value = field != null && row ? row[field] : scope.cellValue
  if (value != null && value !== '') return h('span', String(value))
  const placeholder = resolveEditPlaceholder(ctx, col, field, scope)
  return h('span', { class: PLACEHOLDER_CLASS }, placeholder == null ? '' : String(placeholder))
})

// 常驻编辑总入口：成功接管返回 true；不支持时返回 false（回退普通点击编辑）
const applyAlwaysEdit = (ctx, col, field, rawCol) => {
  // 显式 slots.default（用户自定义展示内容）优先，不接管
  if (rawCol && rawCol.slots && rawCol.slots.default) return false
  const userEditSlot = col.slots && col.slots.edit
  const er = col.editRender
  // 函数式 / 字符串式 / 用户自定义 edit 插槽：编辑器由用户自行绑定 row[field]，
  // 不经过 onAlwaysEditInput，需登记响应式监听才能产生即时脏态（cellChanged）
  const registerRawWatch =
    typeof ctx.registerAlwaysEditRawWatch === 'function'
      ? (scope) =>
          ctx.registerAlwaysEditRawWatch({
            row: scope.row,
            column: scope.column || col,
            field,
          })
      : null
  let slotFn = null
  if (typeof userEditSlot === 'function') {
    slotFn = buildAlwaysEditUserSlot(userEditSlot, registerRawWatch)
  } else if (typeof userEditSlot === 'string') {
    slotFn = buildAlwaysEditNamedSlot(ctx, userEditSlot, registerRawWatch)
  }
  // edit 插槽不可用（如字符串插槽名未注册）时回退按 editRender 接管
  if (!slotFn) {
    if (typeof er === 'function') slotFn = buildAlwaysEditUserRender(ctx, col, field, er, registerRawWatch)
    else if (typeof er === 'string') slotFn = buildAlwaysEditNamedSlot(ctx, er, registerRawWatch)
    else slotFn = buildAlwaysEditObjectRender(ctx, col, field, er)
  }
  if (!slotFn) {
    // 编辑器无法常驻：保留普通点击编辑，同时给单元格加输入框外观；
    // 空值时在模拟输入框内显示 placeholder（用户已配置 render/slots.default 时不接管展示）
    if (isAlwaysEditLookFallback(er)) {
      appendColumnClass(col, INPUT_LOOK_CLASS)
      // 仅外观列：表头同步标记，样式隐藏编辑图标（常驻列已移除 editRender，本就不显示）
      appendHeaderClass(col, INPUT_LOOK_CLASS)
      if (!col.slots.default) {
        col.slots.default = buildAlwaysEditLookSlot(ctx, col, field)
      }
    }
    return false
  }
  col.slots.default = slotFn
  // 常驻模式不经过 vxe 编辑态：移除编辑插槽与编辑配置
  delete col.slots.edit
  delete col.editRender
  applyAlwaysEditClass(col)
  return true
}

// 4c) 对象配置式 editRender → editable + slots.edit + label 回退
const applyObjectEditRender = (ctx, col, field, editEnabled) => {
  if (editEnabled && col.editable == null) col.editable = true
  const erName = col.editRender.name
  const mapEntry = EL_EDIT_MAP[erName]
  if (!mapEntry) return

  const Comp = mapEntry.comp
  const wrapName = mapEntry.wrap
  if (editEnabled && !col.slots.edit) {
    // markRaw 避免 Vue 深度劫持造成渲染循环或状态丢失
    col.slots.edit = buildObjectEditSlotFn(ctx, col, field, Comp, wrapName)
  } else if (editEnabled && typeof col.slots.edit === 'string') {
    // 用户写 slots.edit: 'edit_xxx' 字符串：包一层以附加自动弹出钩子，内部仍交给外部具名插槽
    const slotName = col.slots.edit
    if (typeof ctx.externalSlots[slotName] === 'function') {
      col.slots.edit = markRaw((scope) => attachSlotAutoOpen(ctx.externalSlots[slotName](scope)))
    }
  }
  // 未提供 render/slots.default 时，自动给非编辑态渲染 label 文本（基于 editOptions 映射）
  if (!col.slots.default) {
    col.slots.default = buildEditLabelFallback(ctx, col, field)
  }
}

// 4) editRender → editable:true + slots.edit（分流：函数式 / 字符串式 / 对象配置式）
// 优先级：用户显式 slots.edit > editRender（详见 README）
// editable=false 时（权限控制）：不设置 col.editable / 不构建 slots.edit，
//   点击不进入编辑态、表头无编辑图标；对象式的 slots.default label 回退仍生效（仅显示）
// alwaysEdit 列（常驻编辑器）：接管为 slots.default 后直接返回 —— 不参与 vxe 编辑态
const applyEditRenderSlot = (ctx, col, field, rawCol) => {
  const editEnabled = ctx.editable !== false
  // alwaysEdit 先于 editRender 存在性判断：允许「仅配置 slots.edit」的列启用常驻渲染
  if (editEnabled && col.alwaysEdit === true && applyAlwaysEdit(ctx, col, field, rawCol)) return
  if (!col.editRender) return
  if (typeof col.editRender === 'function') {
    applyFunctionEditRender(col, field, editEnabled)
  } else if (typeof col.editRender === 'string') {
    applyStringEditRender(ctx, col, editEnabled)
  } else if (col.editRender.name) {
    applyObjectEditRender(ctx, col, field, editEnabled)
  }
}

// 5) 默认过滤值注入（initParam.filters → col.filters[0].data）
const applyDefaultFilterValue = (ctx, col, field) => {
  if (!col.filters || !col.filters.length || !col.filterRender) return
  const fName = col.filterRender.name
  if (!fName || !FILTER_DEFAULTS[fName]) return
  const defaultVal = ctx.initFilters[field]
  if (defaultVal == null) return
  const data = buildFilterDataFromDefault(fName, defaultVal)
  if (!data) return
  col.filters = col.filters.map((opt, i) =>
    i === 0 ? { ...opt, data: { ...data }, checked: isFilterActive(fName, data) } : { ...opt },
  )
}

// 6) 操作列标记：params.isAction === true 的列注入 NO_ELLIPSIS_CLASS，
// 组件样式据此把该列排除在省略号裁剪之外（按钮等操作内容应完整显示）；
// 用户已配置 className 时追加（函数式 className 包一层）
const applyNoEllipsisClass = (col) => {
  if (!(col.params && col.params.isAction === true)) return
  if (typeof col.className === 'function') {
    const userClassName = col.className
    col.className = (params) => {
      const cls = userClassName(params)
      return cls ? `${cls} ${NO_ELLIPSIS_CLASS}` : NO_ELLIPSIS_CLASS
    }
    return
  }
  col.className = col.className ? `${col.className} ${NO_ELLIPSIS_CLASS}` : NO_ELLIPSIS_CLASS
}

// 叶子列处理总入口：按步骤调用各辅助函数
const transformLeafColumn = (ctx, rawCol) => {
  if (!rawCol || typeof rawCol !== 'object') return rawCol
  const colType = rawCol.type
  const isSpecialCol = !!(colType && /^(checkbox|seq|radio|expand)$/.test(colType))

  let col = { ...rawCol }
  // slots 深拷贝一层，避免污染 rawCol
  col.slots = rawCol.slots ? { ...rawCol.slots } : {}

  // 1) 公共列属性
  col = applyCommonColumnProps(ctx, col, rawCol, isSpecialCol)
  // 1a) 对齐默认值与一致性
  applyColumnAlign(col, colType)
  // 2) filterType 自动注入过滤配置
  applyFilterTypeConfig(ctx, col)
  // 3) render → slots.default
  const field = col.field || ''
  applyRenderSlot(ctx, col, field)
  // 3a) headerRender → slots.header
  applyHeaderRender(ctx, col, field)
  // 4) editRender → editable:true + slots.edit（alwaysEdit 列 → 常驻编辑器）
  applyEditRenderSlot(ctx, col, field, rawCol)
  // 5) 默认过滤值注入
  applyDefaultFilterValue(ctx, col, field)
  // 6) 操作列：params.isAction === true 注入排除省略标记类
  applyNoEllipsisClass(col)

  return col
}

// 父分组列：只递归子列 + 应用 headerRender，跳过数据列专属逻辑避免错误注入
// params.hideColumn === true 的列完全不渲染（区别于 visible:false 可在个性化配置中开启）
const transformColumn = (ctx, rawCol) => {
  if (!rawCol || typeof rawCol !== 'object') return rawCol
  // hideColumn=true：直接过滤，不进入 vxe-grid columns，个性化配置也无法开启
  if (rawCol.params && rawCol.params.hideColumn === true) return null
  if (Array.isArray(rawCol.children) && rawCol.children.length) {
    const col = { ...rawCol }
    col.slots = rawCol.slots ? { ...rawCol.slots } : {}
    col.children = rawCol.children.map((c) => transformColumn(ctx, c)).filter(Boolean)
    // 父分组列：所有子列都被 hideColumn 隐藏时，父列也不渲染
    if (col.children.length === 0) return null
    // 父分组列也支持 headerRender（自定义表头渲染）
    applyHeaderRender(ctx, col, col.field || '')
    return col
  }
  return transformLeafColumn(ctx, rawCol)
}

/**
 * 构建合并列配置（原 mergedColumns computed 逻辑）
 * @param {Object} config 见文件头注释
 * @returns {Array} 可直接传给 vxe-grid columns 的列数组（hideColumn 列已被过滤）
 */
export const buildColumns = (config) => {
  const cfg = config || {}
  const defCfg = cfg.defaultColumnConfig || {}
  const { filterDefaults: defFilterDefaults, ...defColumnCommon } = defCfg
  const ip = cfg.initParam || {}

  // 各辅助函数的共享上下文（原 buildColumns 闭包变量）
  const ctx = {
    externalSlots: cfg.slots || {}, // 外部插槽集合，支持 render/headerRender 字符串引用具名插槽
    defColumnCommon,
    filterDefaults: { ...DEFAULT_FILTER_CONFIG, ...(defFilterDefaults || {}) },
    initFilters: ip.filters && typeof ip.filters === 'object' ? ip.filters : {},
    editable: cfg.editable,
    editOptions: cfg.editOptions,
    cellEditProps: cfg.cellEditProps,
    editLocalState: cfg.editLocalState,
    resolveEditStateKey: cfg.resolveEditStateKey,
    getAlwaysEditValue: cfg.getAlwaysEditValue,
    onAlwaysEditInput: cfg.onAlwaysEditInput,
    onAlwaysEditCommit: cfg.onAlwaysEditCommit,
    registerAlwaysEditRawWatch: cfg.registerAlwaysEditRawWatch,
    emit: cfg.emit,
  }

  return (cfg.columns || []).map((c) => transformColumn(ctx, c)).filter(Boolean)
}
