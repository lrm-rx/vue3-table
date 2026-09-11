import { describe, it, expect } from "vitest";
import { normalizeRemoteFilterResult } from "../../src/components/tablePro/utils/remoteFilterOptions.js";

describe("normalizeRemoteFilterResult 远程过滤选项结果归一化", () => {
  it("数组：视为旧式一次性全量结果，paged=false", () => {
    const rows = [
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ];
    expect(normalizeRemoteFilterResult(rows)).toEqual({
      rows,
      total: 2,
      paged: false,
    });
  });

  it("{ list, total }：取 list 为行，paged=true", () => {
    const rows = [{ label: "A", value: "a" }];
    expect(normalizeRemoteFilterResult({ list: rows, total: 100 })).toEqual({
      rows,
      total: 100,
      paged: true,
    });
  });

  it("{ rows } 无 total：total 以 rows.length 兜底", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(normalizeRemoteFilterResult({ rows })).toEqual({
      rows,
      total: 3,
      paged: true,
    });
  });

  it("{ records, total }：支持 records 字段", () => {
    const rows = [{ label: "R", value: "r" }];
    expect(normalizeRemoteFilterResult({ records: rows, total: 1 })).toEqual({
      rows,
      total: 1,
      paged: true,
    });
  });

  it("{ data: [...], total }：data 为数组时直接作为行", () => {
    const rows = [{ label: "D", value: "d" }];
    expect(normalizeRemoteFilterResult({ data: rows, total: 9 })).toEqual({
      rows,
      total: 9,
      paged: true,
    });
  });

  it("{ data: { rows, total } }：解包一层 data", () => {
    const rows = [{ label: "I", value: "i" }];
    expect(
      normalizeRemoteFilterResult({ data: { rows, total: 7 }, total: 0 }),
    ).toEqual({ rows, total: 7, paged: true });
  });

  it("{ data: { list } } 无 total：以 inner 行长度兜底", () => {
    const rows = [1, 2].map((i) => ({ label: `x${i}`, value: i }));
    expect(normalizeRemoteFilterResult({ data: { list: rows } })).toEqual({
      rows,
      total: 2,
      paged: true,
    });
  });

  it("total 非法（负数/NaN/null）时回退为 rows.length", () => {
    const rows = [{ label: "A", value: "a" }];
    expect(normalizeRemoteFilterResult({ rows, total: -5 }).total).toBe(1);
    expect(normalizeRemoteFilterResult({ rows, total: "abc" }).total).toBe(1);
    expect(normalizeRemoteFilterResult({ rows, total: null }).total).toBe(1);
  });

  it("null / undefined / 空对象：空行且 paged=false（调用方按单页空结果处理）", () => {
    expect(normalizeRemoteFilterResult(null)).toEqual({
      rows: [],
      total: 0,
      paged: false,
    });
    expect(normalizeRemoteFilterResult(undefined)).toEqual({
      rows: [],
      total: 0,
      paged: false,
    });
    expect(normalizeRemoteFilterResult({})).toEqual({
      rows: [],
      total: 0,
      paged: false,
    });
  });
});
