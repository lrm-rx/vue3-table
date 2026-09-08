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
 *       emit,                  // 组件 emit（textarea-* 三按钮事件透传）
 *     }),
 *   );
 */
import { h, markRaw } from "vue";
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

// 读取某列的编辑选项数组：editRender.props.options 优先于 editOptions[field]
const resolveEditOptions = (field, editRender, editOptions) => {
  if (editRender && Array.isArray(editRender.options)) return editRender.options
  const eo = editOptions || {}
  return Array.isArray(eo[field]) ? eo[field] : []
}
// 合并编辑控件 props：editRender.props + editRender.props.props + cellEditProps[field] + v-model
const mergeEditCompProps = (field, editRender, cellEditProps, extra = {}) => {
  const erProps = (editRender && editRender.props) || {}
  const innerProps = erProps.props || {}
  const cep = cellEditProps || {}
  const commonProps = cep[field] || {}
  return {
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

// 读取列自定义参数 key：取 col.params.defParamKey，兜底 field
export const resolveParamKey = (col, fallbackField) => {
  if (!col) return fallbackField
  return (col.params && col.params.defParamKey) || col.field || fallbackField
}

// ========== 单元格编辑：自动聚焦 / 自动弹出面板 ==========
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

/**
 * 构建合并列配置（原 mergedColumns computed 逻辑）
 * @param {Object} config 见文件头注释
 * @returns {Array} 可直接传给 vxe-grid columns 的列数组（hideColumn 列已被过滤）
 */
export const buildColumns = (config) => {
  const {
    columns,
    defaultColumnConfig,
    initParam,
    slots,
    editable,
    editOptions,
    cellEditProps,
    editLocalState,
    resolveEditStateKey,
    emit,
  } = config || {}

  const defCfg = defaultColumnConfig || {}
  const { filterDefaults: defFilterDefaults, ...defColumnCommon } = defCfg

  const filterDefaults = { ...DEFAULT_FILTER_CONFIG, ...(defFilterDefaults || {}) }

  const ip = initParam || {}
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
    const bindProps = mergeEditCompProps(field, col.editRender, cellEditProps, extra)
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
    const options = resolveEditOptions(field, colEditRender, editOptions)
    const children = buildWrapOptionChildren(options, field, wrapName)
    return h(Comp, bindProps, { default: () => children })
  })

  // 4c-3) 对象配置式 editRender 时，为非编辑态构建 label 回退（基于 editOptions 映射）
  // 注：editEnabled=false 时也生效，确保不可编辑状态下仍按 options 显示 label
  const buildEditLabelFallback = (col, field) => markRaw((scope) => {
    const raw = field != null && scope.row ? scope.row[field] : undefined
    const colEditRender = col.editRender || {}
    const options = resolveEditOptions(field, colEditRender, editOptions)
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
  // editable=false 时（权限控制）：不设置 col.editable / 不构建 slots.edit，
  //   点击不进入编辑态、表头无编辑图标；对象式的 slots.default label 回退仍生效（仅显示）
  const applyEditRenderSlot = (col, field) => {
    if (!col.editRender) return
    const editEnabled = editable !== false
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

  return (columns || []).map(transformColumn).filter(Boolean)
}
