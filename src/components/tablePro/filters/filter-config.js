/**
 * 表头过滤渲染器公共配置
 * - FILTER_DEFAULTS：每种过滤类型对应的初始 data（用于初始化与重置）
 * - isFilterActive：判断某列的过滤条件是否处于「已生效」状态（用于图标高亮与组合过滤收集）
 *
 * 区间类过滤（FilterDateRange / FilterNumberRange）data 结构约定：
 *   { values: [first, second] }
 *     - FilterDateRange：values[0] = 起始日期，values[1] = 结束日期
 *     - FilterNumberRange：values[0] = 最小值，values[1] = 最大值
 *   某一端无值时存 null（最终请求参数的占位值由 filterRender.props.emptyValue 配置，默认 null）
 *   与 FilterCheckbox 的 data.values 属性 key 保持一致
 */

// 各过滤类型对应的初始 data 工厂
export const FILTER_DEFAULTS = {
  // 输入框过滤：{ value }
  FilterInput: () => ({ value: '' }),
  // 输入框 + 多选：{ values, search }
  FilterCheckbox: () => ({ values: [], search: '' }),
  // 日期区间：{ values: [start, end] }
  FilterDateRange: () => ({ values: [null, null] }),
  // 数字区间：{ values: [min, max] }
  FilterNumberRange: () => ({ values: [null, null] }),
}

// 判断指定类型的过滤条件是否已填写（即「激活」）
export function isFilterActive(name, data) {
  if (!data) return false
  switch (name) {
    case 'FilterInput':
      return !!(data.value != null && String(data.value).trim())
    case 'FilterCheckbox':
      return !!(data.values && data.values.length)
    case 'FilterDateRange':
    case 'FilterNumberRange':
      // 区间类：values 数组中任一端有值即视为激活
      return !!(data.values && data.values.some((v) => v != null && v !== ''))
    default:
      return false
  }
}
