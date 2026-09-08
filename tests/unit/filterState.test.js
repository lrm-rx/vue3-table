import { describe, it, expect } from "vitest";
import {
  cloneFilterData,
  saveFilterSnapshot,
  restoreFilterSnapshot,
  updateFilterSnapshot,
  clearFilterSnapshot,
  buildFilterDataFromDefault,
  getColumnDefaultData,
} from "../../src/components/tablePro/utils/filterState.js";

describe("cloneFilterData", () => {
  it("非对象（null/undefined/原始值）原样返回", () => {
    expect(cloneFilterData(null)).toBeNull();
    expect(cloneFilterData(undefined)).toBeUndefined();
    expect(cloneFilterData("x")).toBe("x");
    expect(cloneFilterData(1)).toBe(1);
  });

  it("浅拷贝对象并复制顶层数组（values 不再共享引用）", () => {
    const src = { values: [1, 2], search: "k", nested: { a: [1] } };
    const clone = cloneFilterData(src);
    expect(clone).toEqual(src);
    expect(clone).not.toBe(src);
    expect(clone.values).not.toBe(src.values);
    // 嵌套对象按浅拷贝语义共享（原实现即如此）
    expect(clone.nested).toBe(src.nested);
  });
});

describe("过滤面板草稿快照", () => {
  const mkColumn = (id, filters) => ({ id, filters });
  const mkStore = () => ({});

  it("save 记录 data 深拷贝与 checked，改动原列不影响快照", () => {
    const store = mkStore();
    const opt = { data: { values: ["a", "b"] }, checked: true };
    const column = mkColumn("col_1", [opt]);
    saveFilterSnapshot(store, column);
    expect(store.col_1).toEqual([{ data: { values: ["a", "b"] }, checked: true }]);

    // 修改原列后快照仍为旧值（含数组引用隔离）
    opt.data.values.push("c");
    opt.checked = false;
    expect(store.col_1[0].data.values).toEqual(["a", "b"]);
    expect(store.col_1[0].checked).toBe(true);
  });

  it("restore 按索引恢复并清除快照；无快照时 no-op", () => {
    const store = mkStore();
    const column = mkColumn("col_1", [
      { data: { values: ["new"] }, checked: false },
    ]);
    store.col_1 = [
      { data: { values: ["old"] }, checked: true },
    ];
    restoreFilterSnapshot(store, column);
    expect(column.filters[0]).toEqual({ data: { values: ["old"] }, checked: true });
    // 恢复结果与快照数组隔离
    column.filters[0].data.values.push("x");
    expect(store.col_1).toBeUndefined();
  });

  it("restore 仅恢复存在的索引，多余 option 保持不动", () => {
    const store = mkStore();
    const column = mkColumn("col_1", [
      { data: { value: "b" }, checked: false },
      { data: { value: "keep" }, checked: true },
    ]);
    store.col_1 = [{ data: { value: "a" }, checked: true }];
    restoreFilterSnapshot(store, column);
    expect(column.filters[0]).toEqual({ data: { value: "a" }, checked: true });
    expect(column.filters[1]).toEqual({ data: { value: "keep" }, checked: true });
  });

  it("restore / save / clear 忽略无 id 或空 store", () => {
    const store = mkStore();
    expect(() => saveFilterSnapshot(store, mkColumn(undefined, []))).not.toThrow();
    expect(() => restoreFilterSnapshot(store, mkColumn("c", []))).not.toThrow();
    expect(() => clearFilterSnapshot(store, mkColumn(undefined, []))).not.toThrow();
    expect(() => saveFilterSnapshot(null, mkColumn("c", []))).not.toThrow();
  });

  it("update 相当于重新保存（重置后基线刷新）", () => {
    const store = mkStore();
    const column = mkColumn("col_1", [{ data: { value: "v1" }, checked: false }]);
    saveFilterSnapshot(store, column);
    column.filters[0].data.value = "v2";
    updateFilterSnapshot(store, column);
    expect(store.col_1[0].data.value).toBe("v2");
  });

  it("clear 仅删除对应列快照", () => {
    const store = mkStore();
    saveFilterSnapshot(store, mkColumn("a", [{ data: {}, checked: false }]));
    saveFilterSnapshot(store, mkColumn("b", [{ data: {}, checked: false }]));
    clearFilterSnapshot(store, mkColumn("a", []));
    expect(store.a).toBeUndefined();
    expect(store.b).toBeDefined();
  });
});

describe("buildFilterDataFromDefault", () => {
  it("FilterInput 字符串化默认值", () => {
    expect(buildFilterDataFromDefault("FilterInput", "abc")).toEqual({ value: "abc" });
    expect(buildFilterDataFromDefault("FilterInput", 0)).toEqual({ value: "0" });
    expect(buildFilterDataFromDefault("FilterInput", null)).toEqual({ value: "" });
  });

  it("FilterCheckbox：数组原样拷贝 / 标量包成单元素 / 空值给空数组", () => {
    expect(buildFilterDataFromDefault("FilterCheckbox", ["a", "b"])).toEqual({
      values: ["a", "b"],
      search: "",
    });
    const src = ["a"];
    const out = buildFilterDataFromDefault("FilterCheckbox", src);
    expect(out.values).not.toBe(src);
    expect(buildFilterDataFromDefault("FilterCheckbox", "solo")).toEqual({
      values: ["solo"],
      search: "",
    });
    expect(buildFilterDataFromDefault("FilterCheckbox", null)).toEqual({
      values: [],
      search: "",
    });
  });

  it("区间类：数组 / 旧对象格式 / 空值归一", () => {
    expect(buildFilterDataFromDefault("FilterDateRange", ["2024-01-01", null])).toEqual({
      values: ["2024-01-01", null],
    });
    expect(
      buildFilterDataFromDefault("FilterNumberRange", { min: 1, max: 9 }),
    ).toEqual({ values: [1, 9] });
    expect(buildFilterDataFromDefault("FilterDateRange", { start: "a", end: "b" })).toEqual({
      values: ["a", "b"],
    });
    // 空字符串端归一为 null
    expect(buildFilterDataFromDefault("FilterNumberRange", [0, ""])).toEqual({
      values: [0, null],
    });
  });

  it("未知类型返回 null", () => {
    expect(buildFilterDataFromDefault("NoSuch", "x")).toBeNull();
  });
});

describe("getColumnDefaultData", () => {
  it("initParam.filters 命中时用默认值，否则回退 FILTER_DEFAULTS 工厂", () => {
    const initParam = { filters: { name: "张三" } };
    expect(getColumnDefaultData("name", "FilterInput", initParam)).toEqual({
      value: "张三",
    });
    expect(getColumnDefaultData("other", "FilterInput", initParam)).toEqual({
      value: "",
    });
    // 未配置 initParam 时回退工厂
    expect(getColumnDefaultData("name", "FilterInput", {})).toEqual({ value: "" });
  });

  it("工厂结果每次独立（无共享引用）", () => {
    const a = getColumnDefaultData("x", "FilterCheckbox", {});
    const b = getColumnDefaultData("y", "FilterCheckbox", {});
    expect(a).toEqual(b);
    expect(a.values).not.toBe(b.values);
    a.values.push("mut");
    expect(b.values).toEqual([]);
  });
});
