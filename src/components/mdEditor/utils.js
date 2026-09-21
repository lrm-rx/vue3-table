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
  if (file.type && file.type.startsWith('image/')) return true
  // 兜底：根据扩展名判断
  const name = (file.name || '').toLowerCase()
  return /\.(png|jpe?g|gif|bmp|webp|svg|ico)$/.test(name)
}
