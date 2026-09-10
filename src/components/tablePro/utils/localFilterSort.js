/**
 * 本地过滤 + 排序工具（由 tablePro 的 localFilterSort 布尔开关控制，与是否传 requestApi 无关）
 *
 * localFilterSort=true 时后端不参与表头过滤与列排序，「确认」动作不会产生请求，
 * 由组件对当前数据（静态数据为 props.data，远程数据为接口当前页数据）
 * 在本地完成过滤与排序后再下发给 vxe-grid。
 *
 * 过滤语义（与 vxe 过滤习惯一致）：
 *   - 同一列多个已确认 option 之间为「或」，不同列之间为「且」
 *   - FilterInput：字段值包含关键字（忽略大小写）
 *   - FilterCheckbox：字段值命中任一选中值（String 宽松比较，兼容数字/字符串选项值）
 *   - FilterDateRange：[start, end] 区间；仅一端有值时只约束该端，
 *     纯日期字符串（YYYY-MM-DD，无时间部分）的端点按整天处理（start 当天 00:00 起 / end 当天末尾止）
 *   - FilterNumberRange：[min, max] 数值区间；仅一端有值时只约束该端
 *
 * 排序语义：
 *   - 多字段按传入顺序依次比较（sorts 顺序即 vxe getSortColumns 的优先级顺序），
 *     是否允许多字段排序由 sortConfig.multiple 决定（vxe 侧控制单/多列，本地按状态透传）
 *   - 空值（null/undefined/''）恒排在最后，不随 asc/desc 翻转
 *   - 比较规则：均可转数字按数值比较；否则均可解析为日期按时间戳比较；否则按字符串比较
 *   - Array.prototype.sort 为稳定排序，比较相等的行保持原顺序
 */
import dayjs from "dayjs";

const isBlank = (v) => v == null || v === "";

// 解析为 dayjs 实例，无法解析时返回 null
const toDay = (v) => {
  if (isBlank(v)) return null;
  const d = dayjs(v);
  return d.isValid() ? d : null;
};

// 是否为「纯日期字符串」（无时间部分，如 2024-01-01），用于区间端点的整天语义
const isDateOnlyString = (v) =>
  typeof v === "string" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(v.trim());

// FilterInput：包含匹配（忽略大小写）
const matchFilterInput = (rowVal, data) => {
  const kw = String((data && data.value) ?? "").trim().toLowerCase();
  if (!kw) return true;
  return String(rowVal ?? "").toLowerCase().includes(kw);
};

// FilterCheckbox：命中任一选中值（String 宽松比较，兼容选项值与字段值类型不一致）
const matchFilterCheckbox = (rowVal, data) => {
  const vals = Array.isArray(data && data.values) ? data.values : [];
  if (!vals.length) return true;
  const rowStr = String(rowVal ?? "");
  return vals.some((v) => String(v) === rowStr);
};

// FilterDateRange：日期区间（区间生效时无法解析为日期的字段值视为不匹配）
const matchFilterDateRange = (rowVal, data) => {
  const values = Array.isArray(data && data.values) ? data.values : [];
  const start = values[0];
  const end = values[1];
  if (isBlank(start) && isBlank(end)) return true;
  const d = toDay(rowVal);
  if (!d) return false;
  const startDay = toDay(start);
  if (startDay) {
    const startBound = isDateOnlyString(start) ? startDay.startOf("day") : startDay;
    if (d.isBefore(startBound)) return false;
  }
  const endDay = toDay(end);
  if (endDay) {
    // 纯日期端点按当天末尾比较，保证「当天」数据被包含
    const endBound = isDateOnlyString(end) ? endDay.endOf("day") : endDay;
    if (d.isAfter(endBound)) return false;
  }
  return true;
};

// FilterNumberRange：数值区间（区间生效时空值/非数值字段值视为不匹配）
const matchFilterNumberRange = (rowVal, data) => {
  const values = Array.isArray(data && data.values) ? data.values : [];
  const min = values[0];
  const max = values[1];
  if (isBlank(min) && isBlank(max)) return true;
  // 注意 Number(null)=0 / Number('')=0，空值需先排除，避免被当作 0 参与区间比较
  if (isBlank(rowVal)) return false;
  const n = Number(rowVal);
  if (Number.isNaN(n)) return false;
  const minN = isBlank(min) ? null : Number(min);
  if (minN != null && !Number.isNaN(minN) && n < minN) return false;
  const maxN = isBlank(max) ? null : Number(max);
  if (maxN != null && !Number.isNaN(maxN) && n > maxN) return false;
  return true;
};

const FILTER_MATCHERS = {
  FilterInput: matchFilterInput,
  FilterCheckbox: matchFilterCheckbox,
  FilterDateRange: matchFilterDateRange,
  FilterNumberRange: matchFilterNumberRange,
};

// 排序值比较：空值恒最后 → 数值 → 日期 → 字符串
const compareSortValues = (a, b) => {
  const aEmpty = isBlank(a);
  const bEmpty = isBlank(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return na === nb ? 0 : na - nb;
  }
  const da = toDay(a);
  const db = toDay(b);
  if (da && db) {
    return da.valueOf() - db.valueOf();
  }
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
};

/**
 * 对全量数据执行本地过滤 + 排序
 * @param {Array} data 原始全量数据
 * @param {Array} filters getFilterSortState 收集的过滤状态（{ field, type, data, active, ... }）
 * @param {Array} sorts 排序状态（{ field|property, order }，数组顺序即排序优先级）
 * @returns 过滤 + 排序后的新数组（无生效条件时返回原数组引用）
 */
export const applyLocalFilterSort = (data, filters, sorts) => {
  const source = Array.isArray(data) ? data : [];
  const activeFilters = (filters || []).filter(
    (f) => f && f.active && f.field && FILTER_MATCHERS[f.type],
  );
  const activeSorts = (sorts || []).filter(
    (s) =>
      s &&
      (s.field || s.property) &&
      (s.order === "asc" || s.order === "desc"),
  );
  if (!activeFilters.length && !activeSorts.length) return source;

  // 过滤：按列分组收集匹配器，同列内「或」、列间「且」
  let rows = source;
  if (activeFilters.length) {
    const matchersByField = new Map();
    activeFilters.forEach((f) => {
      const matcher = FILTER_MATCHERS[f.type];
      const list = matchersByField.get(f.field) || [];
      list.push((row) => matcher(row[f.field], f.data));
      matchersByField.set(f.field, list);
    });
    rows = source.filter((row) => {
      for (const matchers of matchersByField.values()) {
        if (!matchers.some((match) => match(row))) return false;
      }
      return true;
    });
  }
  if (!activeSorts.length) return rows;

  // 排序：多字段按优先级依次比较（desc 取反）
  const sortFields = activeSorts.map((s) => ({
    field: s.field || s.property,
    desc: s.order === "desc",
  }));
  return [...rows].sort((rowA, rowB) => {
    for (const { field, desc } of sortFields) {
      const a = rowA ? rowA[field] : undefined;
      const b = rowB ? rowB[field] : undefined;
      // 空值恒排最后，不随 asc/desc 翻转（不受 desc 取反影响）
      const aEmpty = isBlank(a);
      const bEmpty = isBlank(b);
      if (aEmpty || bEmpty) {
        if (aEmpty && bEmpty) continue; // 都空，交由下一排序字段决定
        return aEmpty ? 1 : -1;
      }
      const cmp = compareSortValues(a, b);
      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
};
