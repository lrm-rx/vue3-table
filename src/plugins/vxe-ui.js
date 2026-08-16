// vxe-pc-ui 与 vxe-table 按需引入注册
// 统一在此文件管理，便于 main.js 维护

// vxe-pc-ui：按需引入工具栏与列个性化面板所需的 UI 组件（不全量引入）
import {
  VxeButton,
  VxeButtonGroup,
  VxeTooltip,
  VxeModal,
  VxeInput,
  VxeCheckbox,
  VxeIcon,
} from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'

// vxe-table：按需引入表格相关组件
import {
  VxeTable,
  VxeColumn,
  VxeColgroup,
  VxeGrid,
  VxeToolbar,
} from 'vxe-table'
import 'vxe-table/lib/style.css'

export function setupVxeUI(app) {
  // 注册 vxe-pc-ui 所需组件（按需）
  app.use(VxeButton)
  app.use(VxeButtonGroup)
  app.use(VxeTooltip)
  app.use(VxeModal)
  app.use(VxeInput)
  app.use(VxeCheckbox)
  app.use(VxeIcon)

  // 注册 vxe-table 组件（按需）
  app.use(VxeTable)
  app.use(VxeColumn)
  app.use(VxeColgroup)
  app.use(VxeGrid)
  app.use(VxeToolbar)
}
