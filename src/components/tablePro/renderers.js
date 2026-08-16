/**
 * vxe-table 表头过滤渲染器（高阶复用）
 *
 * 通过 VxeUI.renderer.add 注册 4 种过滤渲染器：
 *   FilterInput / FilterCheckbox / FilterDateRange / FilterNumberRange
 * 它们共用同一个面板组件 FilterPanel，仅名称不同；
 * 列上配置 filterRender: { name: 'FilterXxx' } 即可生效。
 *
 * 关键点：
 * - showFilterFooter: false 关闭 vxe 默认底部按钮，改由 FilterPanel 自行渲染 el-button（重置 / 确定）
 * - renderFilter 返回面板内容（body + footer），vxe 会将其放入筛选 popover
 */
import { h } from 'vue'
import { VxeUI } from 'vxe-pc-ui'
import FilterPanel from './components/FilterPanel.vue'

const FILTER_NAMES = [
  'FilterInput',
  'FilterCheckbox',
  'FilterDateRange',
  'FilterNumberRange',
]

FILTER_NAMES.forEach((name) => {
  VxeUI.renderer.add(name, {
    // 关闭 vxe 默认底部按钮，使用 FilterPanel 内自定义的 el-button footer
    showFilterFooter: false,
    // renderFilter(renderOpts, params)：renderOpts 为列上的 filterRender 配置，params 含 { column, option, $table, $panel }
    renderFilter(renderOpts, params) {
      return h(FilterPanel, { params, renderOpts })
    },
  })
})
