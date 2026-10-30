// vxe-pc-ui 与 vxe-table 按需引入注册
// 统一在此文件管理，便于 main.js 维护

// vxe-pc-ui：按需引入工具栏与列个性化面板所需的 UI 组件（不全量引入）
import {
  VxeUI,
  VxeButton,
  VxeButtonGroup,
  VxeTooltip,
  VxeModal,
  VxeInput,
  VxeCheckbox,
  VxeIcon,
} from 'vxe-pc-ui'

// vxe-pc-ui 样式按需引入（不再全量引入 lib/style.css，约 422KB）
// 主题变量必须保留：VxeUI 初始化时会执行 setTheme()，在 <html> 上设置
// data-vxe-ui-theme="light"，因此这里引入 theme/light.scss（其内部已 @use theme/base.scss
// 提供 :root 基础变量），否则组件样式中的 var(--vxe-ui-*) 会全部失效
import 'vxe-pc-ui/styles/base.scss'
import 'vxe-pc-ui/styles/theme/light.scss'
// 仅引入下方已注册组件对应的样式；图标字体（vxe-icon-*）来自 icon 组件样式
import 'vxe-pc-ui/lib/icon/style/style.css'
import 'vxe-pc-ui/lib/button/style/style.css'
import 'vxe-pc-ui/lib/button-group/style/style.css'
import 'vxe-pc-ui/lib/tooltip/style/style.css'
import 'vxe-pc-ui/lib/modal/style/style.css'
import 'vxe-pc-ui/lib/input/style/style.css'
import 'vxe-pc-ui/lib/checkbox/style/style.css'

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
  // 全局 zIndex 基数：vxe 浮层（校验提示/下拉/弹窗等）zIndex 取自 dom-zindex
  // 计数器（默认基数 999，tooltip ~1012），低于 element-plus 弹层（初始 2000+
  // 递增）—— 与 el-dialog 混用时 vxe 校验浮层会被遮罩遮挡；基数提升至 3000
  // 保证 vxe 浮层始终浮在 element-plus 弹层之上
  VxeUI.setConfig({ zIndex: 3000 })

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
