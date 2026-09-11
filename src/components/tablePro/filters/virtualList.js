/**
 * 定高虚拟列表工具（供 FilterCheckbox 面板承载超高基数选项使用）
 *
 * 背景：当勾选项来自全量数据提取（或远程接口）且基数极高（数万唯一值）时，
 * 全量渲染 el-checkbox 会产生数万个 DOM 节点，面板打开卡顿/滚动掉帧。
 * 定高虚拟滚动只渲染「可视窗口 + 上下 overscan」内的节点（通常 20~40 个），
 * 通过占位容器撑开滚动条、transform 定位已渲染节点。
 *
 * 行高固定（22px，与 SCSS 中 .el-checkbox height 一致），
 * 因此窗口计算是 O(1) 的除法，不需要 offsets 数组 / DOM 测量 / 二分查找，
 * 也不存在不定高虚拟列表的滚动抖动问题。
 */

// 单个选项行高（px），必须与 FilterCheckbox.vue 样式保持一致
export const ITEM_HEIGHT = 22;
// 可视窗口上下额外渲染的行数（快速滚动时避免边缘白屏）
export const OVERSCAN = 8;
// 吸顶「全选」行的占位高度（px）= checkbox 22px + 2px 间距
export const HEADER_HEIGHT = 24;

/**
 * 计算当前应渲染的行窗口 [start, end)
 * @param {Object} p
 * @param {number} p.total          选项总数
 * @param {number} p.scrollTop      滚动容器 scrollTop（已扣除吸顶头部高度时直接传原始值亦可，内部只做除法）
 * @param {number} p.viewportHeight 可视区域高度（px）；<=0 表示尚未测量（首帧/jsdom），此时全量渲染兜底
 * @param {number} p.itemHeight     行高（px）
 * @param {number} p.overscan       上下缓冲行数
 * @returns {{start:number, end:number}} 半开区间，slice(start, end) 使用
 */
export const getVisibleRange = ({
  total,
  scrollTop = 0,
  viewportHeight = 0,
  itemHeight = ITEM_HEIGHT,
  overscan = OVERSCAN,
}) => {
  const n = Math.max(0, Number(total) || 0);
  if (n === 0) return { start: 0, end: 0 };
  const h = Number(itemHeight) > 0 ? Number(itemHeight) : ITEM_HEIGHT;
  const buffer = Math.max(0, Number(overscan) || 0);
  // 未测量（首帧 ResizeObserver 尚未回调 / jsdom）或容器可容纳全部 → 全量渲染
  if (!(viewportHeight > 0) || viewportHeight >= n * h) {
    return { start: 0, end: n };
  }
  const visibleCount = Math.ceil(viewportHeight / h);
  let start = Math.floor(Math.max(0, scrollTop) / h) - buffer;
  if (start < 0) start = 0;
  let end = start + visibleCount + buffer * 2;
  if (end > n) end = n;
  // 边界保护：start 不应超过末尾（数据收缩但滚动位置未复位的极端帧）
  if (start > end) start = Math.max(0, end - visibleCount - buffer * 2);
  return { start, end };
};
