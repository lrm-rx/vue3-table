// ========== vxe-grid 原生事件透传清单 ==========
// 覆盖 tableEmits + gridEmits，排除模板内显式绑定的事件、page-change（与 element-plus 冲突）、update:data 与已废弃事件
// filter-visible / edit-activated / edit-closed 既由内部 handler 处理业务逻辑，也在此透传
export const FORWARD_GRID_EVENTS = [
  // 生命周期
  "ready", "init-rendered", "data-rendered",
  // 键盘 / 剪贴板
  "keydown-start", "keydown", "keydown-end",
  "paste", "copy", "cut", "undo", "redo", "context-menu",
  // 数据 / 列变化
  "columns-change", "data-change", "footer-data-change",
  // 当前行 / 列
  "current-row-change", "current-row-disabled",
  "current-column-change", "current-column-disabled",
  // 复选框区间选择
  "checkbox-range-start", "checkbox-range-change", "checkbox-range-end", "checkbox-range-select",
  // 单元格交互
  "cell-menu", "cell-mouseenter", "cell-mouseleave", "cell-selected",
  "cell-delete-value", "cell-backspace-value",
  // 表头 / 表尾
  "header-cell-click", "header-cell-dblclick", "header-cell-menu",
  "footer-cell-click", "footer-cell-dblclick", "footer-cell-menu",
  // 合并 / 排序 / 过滤
  "clear-merge",
  "clear-sort", "clear-all-sort",
  "filter-change", "filter-visible",
  "clear-filter", "clear-all-filter",
  // 列 / 行拖拽缩放
  "column-resizable-change", "row-resizable-change",
  // 展开 / 树
  "toggle-row-group-expand", "toggle-row-expand", "toggle-tree-expand",
  // 右键菜单
  "menu-click",
  // 编辑
  "edit-closed", "edit-activated", "edit-disabled", "valid-error",
  // 行 / 列拖拽
  "row-dragstart", "row-dragover", "row-dragend",
  "row-remove-dragend", "row-insert-dragend",
  "column-dragstart", "column-dragover", "column-dragend",
  // 追加行
  "enter-append-row", "tab-append-row",
  // 滚动
  "scroll", "scroll-boundary",
  // 列个性化面板
  "custom", "custom-open", "custom-close", "custom-cancel",
  "custom-reset", "custom-confirm",
  "custom-visible-change", "custom-visible-all",
  "custom-fixed-change", "custom-sort-change",
  "custom-align-change", "custom-header-align-change", "custom-footer-align-change",
  // 查找 / 替换
  "open-fnr", "show-fnr", "hide-fnr",
  "fnr-change", "fnr-find", "fnr-find-all", "fnr-replace", "fnr-replace-all",
  // 单元格区域选择（电子表格模式）
  "cell-area-copy", "cell-area-cut", "cell-area-paste", "cell-area-merge",
  "clear-cell-area-selection", "clear-cell-area-merge",
  "header-cell-area-selection",
  "cell-area-selection-invalid",
  "cell-area-selection-start", "cell-area-selection-drag", "cell-area-selection-end",
  "cell-area-extension-start", "cell-area-extension-drag", "cell-area-extension-end", "cell-area-extension-fill",
  "cell-area-selection-all-start", "cell-area-selection-all-end",
  "cell-area-arrows-start", "cell-area-arrows-end",
  "cell-area-fill-copy",
  "active-cell-change-start", "active-cell-change-end",
  // grid 级（工具栏 / 表单 / 代理 / 缩放）
  "form-submit", "form-submit-invalid", "form-reset",
  "form-collapse", "form-toggle-collapse",
  "proxy-query", "proxy-delete", "proxy-save",
  "toolbar-tool-click", "zoom",
];

// TablePro 自身事件
export const TABLE_PRO_EVENTS = [
  "refresh", "export", "search", "density-change",
  "toolbar-button-click", "update:pagerConfig", "page-change",
  "sort-change", "checkbox-change", "checkbox-all", "radio-change",
  "cell-click", "cell-dblclick", "row-click", "row-dblclick",
  "filter-confirm", "filter-reset", "filter-reset-all", "reset-filter",
  "cell-edit-change",
];
