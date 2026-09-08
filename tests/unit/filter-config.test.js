import { describe, it, expect } from "vitest";
import { FILTER_DEFAULTS, isFilterActive } from "../../src/components/tablePro/filters/filter-config.js";

describe("FILTER_DEFAULTS 工厂", () => {
  it("每种类型返回独立新对象（多次调用不共享）", () => {
    const a = FILTER_DEFAULTS.FilterCheckbox();
    const b = FILTER_DEFAULTS.FilterCheckbox();
    expect(a).toEqual(b);
    expect(a.values).not.toBe(b.values);
    a.values.push("x");
    expect(b.values).toEqual([]);
  });

  it("区间类默认 values 为 [null, null]", () => {
    expect(FILTER_DEFAULTS.FilterDateRange()).toEqual({ values: [null, null] });
    expect(FILTER_DEFAULTS.FilterNumberRange()).toEqual({ values: [null, null] });
  });
});

describe("isFilterActive", () => {
  it("FilterInput：trim 后非空才激活", () => {
    expect(isFilterActive("FilterInput", { value: "a" })).toBe(true);
    expect(isFilterActive("FilterInput", { value: "  " })).toBe(false);
    expect(isFilterActive("FilterInput", { value: "" })).toBe(false);
    expect(isFilterActive("FilterInput", { value: null })).toBe(false);
    // 数值 0 视为有效
    expect(isFilterActive("FilterInput", { value: 0 })).toBe(true);
  });

  it("FilterCheckbox：values 非空激活", () => {
    expect(isFilterActive("FilterCheckbox", { values: ["a"] })).toBe(true);
    expect(isFilterActive("FilterCheckbox", { values: [] })).toBe(false);
    expect(isFilterActive("FilterCheckbox", { values: [null, ""] })).toBe(true); // 元素非空判断只看 length
  });

  it("区间类：任一端有值即激活", () => {
    expect(isFilterActive("FilterDateRange", { values: ["2024-01-01", null] })).toBe(true);
    expect(isFilterActive("FilterNumberRange", { values: [null, 10] })).toBe(true);
    expect(isFilterActive("FilterDateRange", { values: [null, null] })).toBe(false);
    expect(isFilterActive("FilterDateRange", { values: [] })).toBe(false);
  });

  it("异常输入不激活", () => {
    expect(isFilterActive("FilterInput", null)).toBe(false);
    expect(isFilterActive("Unknown", { value: "x" })).toBe(false);
    expect(isFilterActive("FilterCheckbox", {})).toBe(false);
  });
});
