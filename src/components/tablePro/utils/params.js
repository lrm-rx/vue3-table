/**
 * 表头过滤 / 列排序状态 → 扁平请求参数对象的纯函数工具
 *
 * 与 index.vue 解耦：不读取任何 props / 表格实例，仅依赖入参，
 * 便于单元测试与独立复用。
 *
 * 过滤语义（与 filterStateToParams 配套的收集侧约定）：
 *   - 每条过滤项形如 { field, paramKey, title, type, data, props, active }
 *     （由 getFilterSortState 从 vxe-grid 列状态收集）
 *   - key 默认取 paramKey，未传时回退 field；区间类支持 paramMode: array/split/both
 * 排序语义（sortParamConfig 控制，详见 README）：
 *   - combined=true   → 合并为单个 orderBy: "field1 asc,field2 desc"（分隔符可配）
 *   - combined=false  → sortField / sortOrder（可配 key 名），多字段逗号连接
 */

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/**
 * 列过滤状态数组 → 扁平请求参数对象 + 涉及的 key 集合
 * @param {Array} filters 过滤状态数组（含 active / data / type / paramKey）
 * @returns {{ params: Object, paramKeys: Set<string> }}
 */
export const filterStateToParams = (filters) => {
  const params = {};
  const paramKeys = new Set();
  (filters || []).forEach((f) => {
    if (!f || !f.active) return;
    const d = f.data || {};
    const key = f.paramKey || f.field;
    switch (f.type) {
      case "FilterInput": {
        const v = String(d.value ?? "").trim();
        if (v) {
          params[key] = v;
          paramKeys.add(key);
        }
        break;
      }
      case "FilterCheckbox": {
        const vals = Array.isArray(d.values)
          ? d.values.filter((v) => v != null && v !== "")
          : [];
        if (vals.length) {
          // 多个值始终用数组传递
          params[key] = vals;
          paramKeys.add(key);
        }
        break;
      }
      case "FilterDateRange":
      case "FilterNumberRange": {
        const raw = Array.isArray(d.values) ? [...d.values] : [null, null];
        // 补齐为 2 元素数组，保证位置语义稳定
        while (raw.length < 2) raw.push(null);
        const ev =
          f.props && f.props.emptyValue !== undefined
            ? f.props.emptyValue
            : null;
        const normalized = raw.map((v) =>
          v == null || v === "" ? ev : v,
        );
        const mode =
          f.props && ["array", "split", "both"].includes(f.props.paramMode)
            ? f.props.paramMode
            : "array";
        // split 两端的 key 命名规则
        const isDate = f.type === "FilterDateRange";
        const key0 = isDate ? `start${capitalize(key)}` : `${key}Min`;
        const key1 = isDate ? `end${capitalize(key)}` : `${key}Max`;

        if (mode === "array" || mode === "both") {
          // 数组格式：两端至少一端有值才发送
          if (normalized.some((v) => v != null && v !== "")) {
            params[key] = normalized;
            paramKeys.add(key);
          }
        }
        if (mode === "split" || mode === "both") {
          // 分开格式：按端独立判断
          if (normalized[0] != null && normalized[0] !== "") {
            params[key0] = normalized[0];
            paramKeys.add(key0);
          }
          if (normalized[1] != null && normalized[1] !== "") {
            params[key1] = normalized[1];
            paramKeys.add(key1);
          }
        }
        break;
      }
    }
  });
  return { params, paramKeys };
};

/**
 * 列排序状态数组 → 请求参数对象 + key 集合
 * @param {Array} sorts 排序状态（{ field|property, order }，数组顺序即优先级）
 * @param {Object} sortParamConfig 排序参数 key 与格式配置（默认空对象）
 * @returns {{ params: Object, paramKeys: Set<string> }}
 */
export const sortStateToParams = (sorts, sortParamConfig = {}) => {
  const active = (sorts || []).filter(
    (s) => s && s.order && s.order !== "null" && (s.field || s.property),
  );
  if (!active.length) return { params: {}, paramKeys: new Set() };

  const fields = active.map((s) => s.field || s.property);
  const orders = active.map((s) => s.order);

  const cfg = sortParamConfig || {};
  const combined = cfg.combined === true;

  if (combined) {
    const combinedKey = cfg.combinedKey || "orderBy";
    const sep = cfg.combinedSeparator != null ? cfg.combinedSeparator : " ";
    const multiSep =
      cfg.combinedMultiSeparator != null ? cfg.combinedMultiSeparator : ",";
    // 每项形如 "field order"，项间用 multiSep 连接
    const value = active
      .map((_, i) => `${fields[i]}${sep}${orders[i]}`)
      .join(multiSep);
    return {
      params: { [combinedKey]: value },
      paramKeys: new Set([combinedKey]),
    };
  }

  const fieldKey = cfg.fieldKey || "sortField";
  const orderKey = cfg.orderKey || "sortOrder";
  const params = {
    [fieldKey]: fields.length === 1 ? fields[0] : fields.join(","),
    [orderKey]: orders.length === 1 ? orders[0] : orders.join(","),
  };
  return { params, paramKeys: new Set([fieldKey, orderKey]) };
};
