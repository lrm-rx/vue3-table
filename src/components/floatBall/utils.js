/**
 * FloatBall 纯函数工具集
 *  - 环形/扇形角度分布计算（n 个按钮均分 360°，整体呈圆形）
 *  - 视口边界钳制
 *  - 就近边缘吸附判定（按到四边的距离选择最近边）
 *  - 初始位置解析
 * 所有函数不依赖 DOM，可独立单测。
 */

/**
 * 计算第 index 个子按钮在圆环上的目标位置（相对中心的偏移）与角度。
 * 按钮沿圆周均分 360°，默认从正上方（-90°）起顺时针排列，整体构成圆形。
 *
 * @param {number} index 子按钮序号
 * @param {number} count 子按钮总数
 * @param {number} radius 展开半径（中心到子按钮中心的距离，px）
 * @param {number} [startAngle=-90] 起始角（度），默认正上方
 * @returns {{ dx:number, dy:number, angle:number }} angle 为弧度
 */
export function computeItemPosition(index, count, radius, startAngle = -90) {
  const safeCount = Math.max(1, count || 1)
  const step = 360 / safeCount
  const deg = startAngle + index * step
  const rad = (deg * Math.PI) / 180
  return {
    dx: radius * Math.cos(rad),
    dy: radius * Math.sin(rad),
    angle: rad,
  }
}

/**
 * 极坐标 → 直角坐标（角度制，0°=正右，顺时针为正，适配屏幕/SVG 的 y 向下坐标系）。
 */
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/**
 * 生成第 index 个「环形扇区切片」的 SVG path（外弧 + 内弧，中心镂空）。
 * n 个切片均分 360° 拼成一个完整圆盘（甜甜圈），中心留空放置中心球。
 *
 * @param {number} index 切片序号
 * @param {number} count 切片总数
 * @param {number} outerR 外半径（圆盘半径）
 * @param {number} innerR 内半径（中心镂空半径，需 < outerR）
 * @param {number} [startAngle=-90] 起始角（度），默认正上方
 * @param {number} [cx=outerR] 圆心 x
 * @param {number} [cy=outerR] 圆心 y
 * @returns {string} SVG path d 字符串（配合 fill-rule="evenodd" 使用）
 */
export function computeSlicePath(index, count, outerR, innerR, startAngle = -90, cx = outerR, cy = outerR) {
  const safeCount = Math.max(1, count || 1)

  // 仅 1 片时退化为完整圆环（外圆顺时针 + 内圆逆时针，evenodd 镂空）
  if (safeCount <= 1) {
    return [
      `M ${cx} ${cy - outerR}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx} ${cy + outerR}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx} ${cy - outerR}`,
      `M ${cx} ${cy - innerR}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx} ${cy + innerR}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR}`,
      'Z',
    ].join(' ')
  }

  const step = 360 / safeCount
  const a1 = startAngle + index * step
  const a2 = a1 + step
  const largeArc = step > 180 ? 1 : 0
  const p1 = polar(cx, cy, outerR, a1)
  const p2 = polar(cx, cy, outerR, a2)
  const q2 = polar(cx, cy, innerR, a2)
  const q1 = polar(cx, cy, innerR, a1)
  // 外弧顺时针(sweep=1) → 连到内弧终点 → 内弧逆时针(sweep=0)回到起点 → 闭合
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${q2.x} ${q2.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${q1.x} ${q1.y}`,
    'Z',
  ].join(' ')
}

/**
 * 计算第 index 个切片的「径向中点」坐标，用于放置图标与文字。
 */
export function computeSliceMidpoint(index, count, outerR, innerR, startAngle = -90, cx = outerR, cy = outerR) {
  const safeCount = Math.max(1, count || 1)
  const step = 360 / safeCount
  const midA = startAngle + index * step + step / 2
  const rMid = (innerR + outerR) / 2
  return polar(cx, cy, rMid, midA)
}

/**
 * 将位置钳制到视口范围内（保证元素完整可见，不超出四边）。
 *
 * @param {number} x 元素左上角 x
 * @param {number} y 元素左上角 y
 * @param {number} w 元素宽
 * @param {number} h 元素高
 * @param {number} vw 视口宽
 * @param {number} vh 视口高
 * @returns {{ x:number, y:number }}
 */
export function clampPosition(x, y, w, h, vw, vh) {
  const maxX = Math.max(0, vw - w)
  const maxY = Math.max(0, vh - h)
  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  }
}

/**
 * 边缘吸附：仅吸附到左 / 右边缘，取元素中心水平方向更近的一边，
 * 垂直位置（y）保持不变。悬浮球惯例只贴左右，避免遮挡顶部导航与底部操作区。
 *
 * @param {number} x 元素左上角 x
 * @param {number} y 元素左上角 y
 * @param {number} w 元素宽
 * @param {number} h 元素高
 * @param {number} vw 视口宽
 * @param {number} vh 视口高
 * @param {object} [opts]
 * @param {number} [opts.threshold=0] 吸附阈值（px）：仅当最近水平边距离 <= 该值时才吸附；
 *   0 表示总是吸附到最近的左 / 右边。
 * @param {boolean} [opts.hideHalf=false] 吸附后是否半隐藏（半个球在视口外）。
 * @returns {{ x:number, y:number, edge:'left'|'right', distance:number } | null}
 *   不满足阈值时返回 null（保持原位）。
 */
export function resolveSnap(x, y, w, h, vw, vh, opts = {}) {
  const { threshold = 0, hideHalf = false } = opts
  const cx = x + w / 2
  const distLeft = cx
  const distRight = vw - cx
  // 仅比较左 / 右：取水平最近边，等距时偏左
  const edge = distLeft <= distRight ? 'left' : 'right'
  const min = Math.min(distLeft, distRight)
  // 阈值控制：最近水平边仍太远则不吸附
  if (threshold > 0 && min > threshold) return null
  let tx = x
  if (edge === 'left') {
    tx = hideHalf ? -w / 2 : 0
  } else {
    tx = hideHalf ? vw - w / 2 : vw - w
  }
  return { x: tx, y, edge, distance: min }
}

/**
 * 解析初始位置：支持预设方位字符串或 {x, y} 坐标。
 * 预设：'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' |
 *   'left'（左侧垂直居中）| 'right'（右侧垂直居中）。
 *
 * @param {string|{x:number,y:number}} position
 * @param {number} w 元素宽
 * @param {number} h 元素高
 * @param {number} vw 视口宽
 * @param {number} vh 视口高
 * @param {number} [margin=16] 预设方位距边的留白
 * @returns {{ x:number, y:number }}
 */
export function resolveInitialPosition(position, w, h, vw, vh, margin = 16) {
  if (position && typeof position === 'object') {
    return clampPosition(position.x, position.y, w, h, vw, vh)
  }
  const m = margin
  const centerY = Math.max(m, Math.round((vh - h) / 2))
  switch (position) {
    case 'top-left':
      return { x: m, y: m }
    case 'top-right':
      return { x: vw - w - m, y: m }
    case 'bottom-left':
      return { x: m, y: vh - h - m }
    case 'left':
      return { x: m, y: centerY }
    case 'right':
      return { x: Math.max(m, vw - w - m), y: centerY }
    case 'bottom-right':
    default:
      return { x: Math.max(m, vw - w - m), y: Math.max(m, vh - h - m) }
  }
}

