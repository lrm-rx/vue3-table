/**
 * 将 File 转换为 base64 data URL
 * @param {File} file
 * @returns {Promise<string>}
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * 校验文件是否为图片类型
 * @param {File} file
 * @returns {boolean}
 */
export const isImageFile = (file) => {
  if (!file) return false
  if (file.type?.startsWith('image/')) return true
  // 兜底：根据扩展名判断
  const name = (file.name || '').toLowerCase()
  return /\.(png|jpe?g|gif|bmp|webp|svg|ico)$/.test(name)
}

/**
 * 匹配 markdown 文本中的 base64 data URL（含 data: 前缀与 base64 载荷）
 * 形如：data:image/png;base64,iVBORw0KGgo...
 * 用于字数统计时剔除图片编码产生的大量无意义字符
 */
const BASE64_DATA_URL_RE = /data:[^,;]+(?:;[^,;]+)*,[\w+/=]+/g

/**
 * 统计 Markdown 文本的「合理字数」：
 * 剔除 base64 图片编码后剩余字符的长度。
 * base64 图片内联时会占据数千到数万字符，不应计入正文统计。
 * @param {string} text 原始 markdown 文本
 * @returns {number} 过滤 base64 后的字符数
 */
export const countMarkdownChars = (text) => {
  if (!text) return 0
  return text.replace(BASE64_DATA_URL_RE, '').length
}

/**
 * 将 md-editor-v3 onGetCatalog 返回的扁平标题列表构建为树形结构
 *
 * 输入形如：[{ text, level, line }, ...]（level 1~6，按文档顺序排列）
 * 输出：[{ key, index, text, level, line, children: [] }, ...]
 *  - key：稳定标识（基于原始下标），供 Vue :key 与折叠状态记录使用
 *  - index：在原始扁平列表中的下标，用于滚动高亮时回查
 *
 * 容错：首个标题不是 h1、层级跳跃（h1 → h3）均能正常成树。
 * @param {Array} headings 扁平标题列表
 * @param {number} [maxDepth] 最大展示层级（level <= maxDepth 才保留），不传或 <=0 表示不限制
 * @returns {Array} 树形节点数组
 */
export const buildCatalogTree = (headings, maxDepth) => {
  if (!Array.isArray(headings) || headings.length === 0) return []
  const limit = typeof maxDepth === 'number' && maxDepth > 0 ? maxDepth : Infinity
  const roots = []
  const stack = [] // 当前层级路径上的节点（自根向叶）
  headings.forEach((h, i) => {
    if (!h || h.level > limit) return
    const node = { key: `h${i}`, index: i, text: h.text, level: h.level, line: h.line, children: [] }
    // 弹出所有 level >= 当前节点的祖先，使栈顶成为父节点
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length) {
      stack[stack.length - 1].children.push(node)
    } else {
      roots.push(node)
    }
    stack.push(node)
  })
  return roots
}

/**
 * 滚动高亮决策：给定各标题在滚动内容中的绝对 top 数组（升序）与当前 scrollTop，
 * 返回「当前激活标题」的下标 —— 最后一个 top <= scrollTop + offset 的标题。
 * 若所有标题都在偏移线之下（滚动位置在首个标题之前），返回 0（默认高亮第一项）；
 * 空数组返回 -1（无高亮）。
 * @param {number[]} tops 标题绝对 top 数组（文档顺序，升序）
 * @param {number} scrollTop 滚动容器当前 scrollTop
 * @param {number} [offset] 高亮判定线相对容器顶部的偏移量
 * @returns {number} 激活标题下标，-1 表示无
 */
export const pickActiveHeadingIndex = (tops, scrollTop, offset = 0) => {
  if (!Array.isArray(tops) || tops.length === 0) return -1
  const line = scrollTop + offset
  let active = 0
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) active = i
    else break
  }
  return active
}
