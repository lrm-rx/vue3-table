/**
 * 过滤状态工具（纯函数，不依赖组件实例）：
 *  - cloneFilterData：深拷贝一层过滤 data（处理 FilterCheckbox.values 等数组属性）
 *  - 过滤面板草稿快照：save / restore / update / clear（store 由调用方持有，如 reactive({})）
 *  - 默认过滤值构建：buildFilterDataFromDefault / getColumnDefaultData
 *
 * 快照背景：vxe-grid 面板关闭时可能自动设置 opt.checked=true，导致未确认草稿被
 * 标记为已激活。快照机制：打开→保存；确认→清除；重置→更新基线；关闭且未确认→恢复。
 */
import { FILTER_DEFAULTS } from "../filters/filter-config.js";

// 深拷贝过滤 data（处理 FilterCheckbox.values 等数组类型属性）
export const cloneFilterData = (data) => {
  if (!data || typeof data !== "object") return data;
  const clone = { ...data };
  Object.keys(clone).forEach((k) => {
    if (Array.isArray(clone[k])) clone[k] = [...clone[k]];
  });
  return clone;
};

/**
 * 保存某列当前过滤状态快照到 store
 * @param {Object} store 快照容器（形如 { [columnId]: [{ data, checked }] }）
 * @param {Object} column vxe 列对象（需含 id 与 filters）
 */
export const saveFilterSnapshot = (store, column) => {
  if (!store || !column || !column.id) return;
  store[column.id] = (column.filters || []).map((opt) => ({
    data: cloneFilterData(opt.data),
    checked: opt.checked,
  }));
};

/**
 * 恢复某列过滤状态（快照存在时）并清除该列快照
 */
export const restoreFilterSnapshot = (store, column) => {
  if (!store || !column || !column.id) return;
  const snapshot = store[column.id];
  if (!snapshot) return;
  (column.filters || []).forEach((opt, i) => {
    if (snapshot[i]) {
      opt.data = cloneFilterData(snapshot[i].data);
      opt.checked = snapshot[i].checked;
    }
  });
  delete store[column.id];
};

/**
 * 更新某列快照为当前状态（重置场景：重置立即生效，后续关闭面板不再恢复重置前）
 */
export const updateFilterSnapshot = (store, column) => {
  saveFilterSnapshot(store, column);
};

/**
 * 清除某列快照（确认场景：确认的改动保留，面板关闭时不再恢复）
 */
export const clearFilterSnapshot = (store, column) => {
  if (!store || !column || !column.id) return;
  delete store[column.id];
};

/**
 * 将 initParam.filters 中的默认值转换为对应过滤类型的 data 结构
 * @param {string} name 过滤类型名（FilterInput / FilterCheckbox / FilterDateRange / FilterNumberRange）
 * @param {*} defaultVal initParam 中的默认值
 */
export const buildFilterDataFromDefault = (name, defaultVal) => {
  switch (name) {
    case "FilterInput":
      return { value: defaultVal == null ? "" : String(defaultVal) };
    case "FilterCheckbox":
      return {
        values: Array.isArray(defaultVal)
          ? [...defaultVal]
          : defaultVal == null
            ? []
            : [defaultVal],
        search: "",
      };
    case "FilterDateRange":
    case "FilterNumberRange": {
      // 区间类默认值：数组 [first, second] 或旧对象格式 { start, end } / { min, max }
      let a = null;
      let b = null;
      if (Array.isArray(defaultVal)) {
        a = defaultVal[0];
        b = defaultVal[1];
      } else if (defaultVal && typeof defaultVal === "object") {
        a = defaultVal.start != null ? defaultVal.start : defaultVal.min;
        b = defaultVal.end != null ? defaultVal.end : defaultVal.max;
      }
      return {
        values: [
          a != null && a !== "" ? a : null,
          b != null && b !== "" ? b : null,
        ],
      };
    }
    default:
      return null;
  }
};

/**
 * 获取指定列的默认过滤 data：优先用 initParam.filters，否则回退 FILTER_DEFAULTS
 * @param {string} field 列 field
 * @param {string} filterRenderName 过滤渲染器名
 * @param {Object} initParam initParam 配置（含 filters 时读取默认值）
 */
export const getColumnDefaultData = (field, filterRenderName, initParam) => {
  const ip = initParam || {};
  const defaultVal = ip.filters && ip.filters[field];
  if (defaultVal != null) {
    const data = buildFilterDataFromDefault(filterRenderName, defaultVal);
    if (data) return data;
  }
  const fac = FILTER_DEFAULTS[filterRenderName];
  return fac ? fac() : null;
};
