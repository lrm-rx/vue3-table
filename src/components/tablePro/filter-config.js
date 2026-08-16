/**
 * 表头过滤渲染器公共配置
 * - FILTER_DEFAULTS：每种过滤类型对应的初始 data（用于初始化与重置）
 * - isFilterActive：判断某列的过滤条件是否处于「已生效」状态（用于图标高亮与组合过滤收集）
 */

// 各过滤类型对应的初始 data 工厂
export const FILTER_DEFAULTS = {
  // 输入框过滤：{ value }
  FilterInput: () => ({ value: '' }),
  // 输入框 + 多选：{ values, search }
  FilterCheckbox: () => ({ values: [], search: '' }),
  // 日期区间：{ start, end }
  FilterDateRange: () => ({ start: '', end: '' }),
  // 数字区间：{ min, max }
  FilterNumberRange: () => ({ min: null, max: null }),
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
      return !!(data.start || data.end)
    case 'FilterNumberRange':
      return data.min != null || data.max != null
    default:
      return false
  }
}
