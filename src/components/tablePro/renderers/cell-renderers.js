/**
 * tablePro 单元格渲染器（只读 JSX 渲染 + 可编辑渲染）
 *
 * 1. 只读 JSX 渲染（列配置 render: (h, params) => VNode）：
 *    通过注册名为 "CellJsxRender" 的 vxe renderer，使用 cellRender 渲染列单元格。
 *
 * 2. 可编辑单元格渲染（列配置 editRender: { name: 'ElInput' | 'ElSelect' | 'ElRadio' | 'ElDatePicker' | ..., props?: {} }）
 *    结合 vxe 的 editable + editRenderer 机制，使用 Element Plus 组件作为编辑控件。
 *    编辑控件的下拉/单选选项数据从 tablePro 组件的 provide("tableProEditContext") 中读取，
 *    由外部通过 :edit-options="{ fieldName: optionsArray }" 独立传入（避免放在 columns 配置中）。
 */
import { h, ref, inject, computed, watch } from 'vue'
import { VxeUI } from 'vxe-pc-ui'
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
} from 'element-plus'

// ========== 可编辑单元格：上下文（从 tablePro provide 注入）==========
// editOptions: { [field]: [{ label, value }, ...] }  各列编辑控件的预置选项数组
// cellEditProps: { [field]: { ... } }                 各列编辑控件的额外 props（公共/覆盖）
// onCellEditChange: (params) => void                  单元格编辑完成回调
const getEditContext = () =>
  inject('tableProEditContext', {
    editOptions: {},
    cellEditProps: {},
    onCellEditChange: null,
  })

// 根据 editRender.name 获取对应的 Element Plus 组件
const EL_EDIT_COMPONENTS = {
  ElInput,
  ElInputNumber,
  ElSelect,
  ElSelectV2: ElSelect,
  ElRadioGroup,
  ElCheckboxGroup,
  ElDatePicker,
  ElTimePicker,
  ElSwitch,
  ElRate,
}

// 只读 JSX 渲染器：列配置 cellRender: { name: 'CellJsxRender' }
// 实际 render 函数从列配置的顶层 render 属性读取（mergedColumns 时注入到 cellRender.props.render）
VxeUI.renderer.add('CellJsxRender', {
  renderDefault(renderOpts, params) {
    // renderOpts.props.render 即 columns[i].render: (h, params) => VNode
    const renderFn = renderOpts.props && renderOpts.props.render
    if (typeof renderFn === 'function') {
      try {
        return renderFn(h, params)
      } catch (e) {
        return h('span', { style: 'color:#f56c6c' }, String(e && e.message ? e.message : e))
      }
    }
    // 无 render 函数时回退为默认 cellValue 文本
    const val = params.cellValue
    return h('span', val == null ? '' : String(val))
  },
})

// ========== 可编辑单元格渲染器基础方法 ==========
/**
 * 从上下文中取指定列的选项数组
 * 优先级：
 *   1) editRender.props.options（列配置内直接写，不推荐但兼容）
 *   2) provide 注入的 editOptions[field]（推荐：外部单独传入）
 */
const resolveOptions = (field, renderOpts) => {
  const ctx = getEditContext()
  const optsFromProps = renderOpts.props && renderOpts.props.options
  if (Array.isArray(optsFromProps)) return optsFromProps
  const fromCtx = ctx.editOptions && ctx.editOptions[field]
  return Array.isArray(fromCtx) ? fromCtx : []
}

/**
 * 合并编辑控件的 props：
 *   - 基础 v-model / disabled 等
 *   - 列配置 editRender.props
 *   - 公共 cellEditProps[field]（外部单独传入，优先级最高，便于统一配置）
 */
const mergeEditProps = (field, renderOpts, cellValueRef, extra = {}) => {
  const ctx = getEditContext()
  const colProps = (renderOpts.props && renderOpts.props.props) || {}
  const commonProps = (ctx.cellEditProps && ctx.cellEditProps[field]) || {}
  return {
    ...extra,
    ...colProps,
    ...commonProps,
    modelValue: cellValueRef.value,
    'onUpdate:modelValue': (val) => {
      cellValueRef.value = val
    },
  }
}

/**
 * 注册统一的可编辑渲染器工厂
 * @param {string} rendererName  vxe renderer 注册名（editRender.name 中使用）
 * @param {object} opts
 *   elName: string          Element Plus 组件名（对应 EL_EDIT_COMPONENTS 的 key）
 *   wrapper?: boolean       是否需要用 ElOption/ElRadio/ElCheckbox 等包裹 options
 *   wrapperTag?: string     包裹 option 的子组件 tag（ElOption / ElRadio / ElCheckbox / ElRadioButton / ElCheckboxButton）
 *   valueKey?: string       从 editRender.props 读取组件值的对应字段（默认不传，使用 modelValue）
 */
const registerEditableRenderer = (rendererName, { elName, wrapper = false, wrapperTag = '', useButtonVariant = false }) => {
  VxeUI.renderer.add(rendererName, {
    // 表单项渲染（编辑模式下渲染输入控件）
    renderItemContent(renderOpts, params) {
      const ctx = getEditContext()
      const { column } = params
      const field = column.field || ''
      // 使用本地 ref 作为编辑中值，v-model 绑定；编辑完成后 commit
      const editValue = ref(params.cellValue)
      // 同步外部 cellValue 变更（如远程刷新等）
      watch(
        () => params.cellValue,
        (nv) => {
          editValue.value = nv
        },
      )

      const elComp = EL_EDIT_COMPONENTS[elName] || ElInput

      // 1) 不需要选项包裹的组件：Input / InputNumber / DatePicker / TimePicker / Switch / Rate
      if (!wrapper) {
        const mergedProps = mergeEditProps(field, renderOpts, editValue)
        return h(elComp, {
          ...mergedProps,
          // 编辑完成（回车或失焦）时 commit 到 vxe table 数据
          onChange: (val) => {
            params.$table.updateStatus(params, { type: 'edit' })
            mergedProps.onChange && mergedProps.onChange(val)
            if (typeof ctx.onCellEditChange === 'function') {
              ctx.onCellEditChange({ ...params, value: val })
            }
          },
          onBlur: () => {
            try {
              params.$table.setCellValue(params.row, field, editValue.value)
            } catch (e) {}
            mergedProps.onBlur && mergedProps.onBlur()
          },
        })
      }

      // 2) 需要选项包裹的组件：Select / RadioGroup / CheckboxGroup
      const options = resolveOptions(field, renderOpts)
      // 包裹子组件：ElOption / ElRadio / ElRadioButton / ElCheckbox / ElCheckboxButton
      let wrapperComp
      let buttonComp = false
      if (wrapperTag === 'ElOption') wrapperComp = ElOption
      else if (wrapperTag === 'ElRadio') {
        wrapperComp = useButtonVariant ? ElRadioButton : ElRadio
        buttonComp = useButtonVariant
      } else if (wrapperTag === 'ElCheckbox') {
        wrapperComp = useButtonVariant ? ElCheckboxButton : ElCheckbox
        buttonComp = useButtonVariant
      } else {
        wrapperComp = ElOption
      }

      const children = options.map((opt, idx) => {
        const label = opt.label != null ? opt.label : opt.value
        const value = opt.value != null ? opt.value : opt.label
        const key = `${field}-opt-${idx}-${String(value)}`
        const extraOptProps = {}
        if (wrapperTag === 'ElOption') {
          extraOptProps.label = value // ElOption label 实际是绑定值，label 作为显示文本
          extraOptProps.value = value
        } else {
          // ElRadio / ElCheckbox label 属性是选中绑定值
          extraOptProps.label = value
          extraOptProps.value = value
        }
        if (opt.disabled != null) extraOptProps.disabled = !!opt.disabled
        return h(wrapperComp, { key, ...extraOptProps }, { default: () => label })
      })

      const mergedProps = mergeEditProps(field, renderOpts, editValue)
      return h(
        elComp,
        {
          ...mergedProps,
          onChange: (val) => {
            try {
              params.$table.setCellValue(params.row, field, val)
            } catch (e) {}
            mergedProps.onChange && mergedProps.onChange(val)
            if (typeof ctx.onCellEditChange === 'function') {
              ctx.onCellEditChange({ ...params, value: val })
            }
          },
          onBlur: () => {
            try {
              params.$table.setCellValue(params.row, field, editValue.value)
            } catch (e) {}
            mergedProps.onBlur && mergedProps.onBlur()
          },
        },
        buttonComp
          ? { default: () => children } // RadioButton/CheckboxButton 不需要额外包裹
          : { default: () => children },
      )
    },
    // 单元格默认显示（非编辑态，仍回退 vxe 原生显示；若列配置了 render 则由 CellJsxRender 先行渲染）
    renderDefault(renderOpts, params) {
      const val = params.cellValue
      // 对有选项类的控件（select/radio/checkbox）在非编辑态显示 label 文本
      const { column } = params
      const field = column.field || ''
      const options = resolveOptions(field, renderOpts)
      if (options.length) {
        const findLabel = (v) => {
          const hit = options.find((o) => o.value === v || String(o.value) === String(v))
          return hit ? hit.label : (v == null ? '' : String(v))
        }
        if (Array.isArray(val)) {
          return h(
            'span',
            val.map((v, i) => h('span', { key: i, style: i ? 'margin-left:6px' : '' }, findLabel(v))),
          )
        }
        return h('span', findLabel(val))
      }
      return h('span', val == null ? '' : String(val))
    },
  })
}

// 注册各类可编辑渲染器
registerEditableRenderer('ElInput', { elName: 'ElInput' })
registerEditableRenderer('ElInputNumber', { elName: 'ElInputNumber' })
registerEditableRenderer('ElSelect', { elName: 'ElSelect', wrapper: true, wrapperTag: 'ElOption' })
registerEditableRenderer('ElRadio', { elName: 'ElRadioGroup', wrapper: true, wrapperTag: 'ElRadio' })
registerEditableRenderer('ElRadioButton', { elName: 'ElRadioGroup', wrapper: true, wrapperTag: 'ElRadio', useButtonVariant: true })
registerEditableRenderer('ElCheckbox', { elName: 'ElCheckboxGroup', wrapper: true, wrapperTag: 'ElCheckbox' })
registerEditableRenderer('ElCheckboxButton', { elName: 'ElCheckboxGroup', wrapper: true, wrapperTag: 'ElCheckbox', useButtonVariant: true })
registerEditableRenderer('ElDatePicker', { elName: 'ElDatePicker' })
registerEditableRenderer('ElTimePicker', { elName: 'ElTimePicker' })
registerEditableRenderer('ElSwitch', { elName: 'ElSwitch' })
registerEditableRenderer('ElRate', { elName: 'ElRate' })
