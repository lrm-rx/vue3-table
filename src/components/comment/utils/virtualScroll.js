/**
 * 动态高度虚拟滚动 —— 纯数学工具
 *
 * 背景：与 FilterCheckbox 的定高列表不同，评论项高度不固定
 * （正文长短不一、楼中楼回复数量不同、回复展开/收起都会改变高度）。
 * 策略：
 *  - 已渲染过的项：ResizeObserver 测量真实高度，按 key 缓存（measuredHeights）
 *  - 未渲染的项：使用估计高度 estimateHeight
 *  - 基于每项高度计算前缀和 offsets，滚动位置通过二分查找定位窗口
 *
 * 本文件只提供无副作用纯函数，DOM 测量与滚动补偿在 VirtualList.vue 中完成。
 */

/**
 * 取某项高度：优先实测值，缺失时使用估计高度
 * @param {string|number} key 项唯一 key
 * @param {Map<string|number, number>} measuredHeights 已测量高度缓存
 * @param {number} estimateHeight 估计高度
 */
export const getItemHeight = (key, measuredHeights, estimateHeight) => {
  const h = measuredHeights.get(key);
  return h != null && h > 0 ? h : estimateHeight;
};

/**
 * 构建前缀和 offsets：
 *  offsets[i]   = 第 i 项顶部的 y 坐标
 *  offsets[n]   = 全部内容的总高度
 * 高度差（offsets[i+1] - offsets[i]）即第 i 项高度。
 * @param {Array<string|number>} keys 按展示顺序排列的 key 数组
 * @param {Map<string|number, number>} measuredHeights
 * @param {number} estimateHeight
 * @returns {number[]} 长度为 keys.length + 1
 */
export const buildOffsets = (keys, measuredHeights, estimateHeight) => {
  const offsets = new Array(keys.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < keys.length; i++) {
    offsets[i + 1] =
      offsets[i] + getItemHeight(keys[i], measuredHeights, estimateHeight);
  }
  return offsets;
};

/**
 * 二分查找：y 坐标落在哪一项
 * 找到满足 offsets[i] <= y 的最大 i（offsets 单调非递减）。
 * @param {number[]} offsets 前缀和
 * @param {number} y 目标 y 坐标
 * @returns {number} 项 index，范围 [0, n-1]；空数组时为 0
 */
export const findIndexAtOffset = (offsets, y) => {
  const n = offsets.length - 1;
  if (n <= 0) return 0;
  if (y <= 0) return 0;
  if (y >= offsets[n]) return Math.max(0, n - 1);
  // 右边界二分：在 [0, n] 中找 offsets[mid] <= y 的最大 mid
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, n - 1);
};

/**
 * 计算当前应渲染的窗口 [start, end)
 * @param {number[]} offsets 前缀和
 * @param {number} scrollTop 容器当前滚动位置
 * @param {number} viewportHeight 容器可视高度
 * @param {number} overscan 上下额外渲染的项数（按项计，快速滚动防白屏）
 * @returns {{start:number, end:number}} 半开区间
 */
export const getVisibleRange = (
  offsets,
  scrollTop = 0,
  viewportHeight = 0,
  overscan = 3,
) => {
  const n = offsets.length - 1;
  if (n <= 0) return { start: 0, end: 0 };
  // 容器尚未测量（首帧 / jsdom）→ 全量渲染兜底，避免「列表消失」
  if (!(viewportHeight > 0)) return { start: 0, end: n };
  const top = Math.max(0, scrollTop);
  const bottom = top + viewportHeight;
  const startIndex = findIndexAtOffset(offsets, top);
  // bottom 落在 end 项的顶部之前 → 用 bottom 查找后 +1 保证覆盖
  const endIndex = Math.min(n, findIndexAtOffset(offsets, bottom) + 2);
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(n, endIndex + overscan);
  return { start, end };
};

/**
 * 判断是否已接近列表底部（用于触发 load-more 增量加载）
 * @param {number[]} offsets 前缀和
 * @param {number} scrollTop
 * @param {number} viewportHeight
 * @param {number} threshold 距底部阈值 px
 */
export const isNearBottom = (
  offsets,
  scrollTop,
  viewportHeight,
  threshold = 80,
) => {
  const total = offsets.length ? offsets[offsets.length - 1] : 0;
  return scrollTop + viewportHeight >= total - threshold;
};
