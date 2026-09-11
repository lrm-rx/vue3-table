/**
 * 远程过滤选项（FilterCheckbox）分页结果归一化
 *
 * 背景：高基数列的选项由后端分页查询接口提供时，各后端常见返回包络不一致：
 *   - 旧约定（全量一次返回）：直接返回数组 [{ label, value }, ...]
 *   - 分页对象：{ list / rows / records / data: [...], total }
 *   - 包了一层：{ data: { rows: [...], total } }
 * 本函数把以上形态统一为 { rows, total, paged }，再由调用方做 label/value 映射。
 *
 * 规则：
 *   - 数组：视为「不分页的一次性全量结果」，paged=false（兼容既有 requestFilterAPI）
 *   - 对象：按 list → rows → records → data(数组) 顺序取列表；
 *           data 为对象时递归解包一层；total 缺省以 rows.length 兜底
 */

const toFiniteNumber = (v) => {
  // null/undefined 表示「未提供」，交由调用方兜底（注意 Number(null)===0 不可直接用）
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const normalizeRemoteFilterResult = (res) => {
  if (Array.isArray(res)) {
    return { rows: res, total: res.length, paged: false };
  }
  if (res && typeof res === "object") {
    const direct = res.list ?? res.rows ?? res.records;
    if (Array.isArray(direct)) {
      return {
        rows: direct,
        total: toFiniteNumber(res.total) ?? direct.length,
        paged: true,
      };
    }
    if (Array.isArray(res.data)) {
      return {
        rows: res.data,
        total: toFiniteNumber(res.total) ?? res.data.length,
        paged: true,
      };
    }
    // 再包一层：{ data: { rows/list/records: [...], total } }
    if (res.data && typeof res.data === "object") {
      const inner = res.data.list ?? res.data.rows ?? res.data.records;
      if (Array.isArray(inner)) {
        return {
          rows: inner,
          total:
            toFiniteNumber(res.data.total) ??
            toFiniteNumber(res.total) ??
            inner.length,
          paged: true,
        };
      }
    }
  }
  return { rows: [], total: 0, paged: false };
};
