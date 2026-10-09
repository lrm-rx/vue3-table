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
