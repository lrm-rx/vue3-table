import { describe, it, expect } from "vitest";
import {
  filterStateToParams,
  sortStateToParams,
} from "../../src/components/tablePro/utils/params.js";

// 入参形态与组件内 getFilterSortState 收集结果一致
const baseFilter = (over) => ({
  field: "f1",
  paramKey: "f1",
  type: "FilterInput",
  data: {},
  active: true,
  props: undefined,
  ...over,
});

describe("filterStateToParams", () => {
  it("忽略未激活（active=false）的过滤项", () => {
    const { params, paramKeys } = filterStateToParams([
      baseFilter({ active: false, data: { value: "x" } }),
    ]);
    expect(params).toEqual({});
    expect(paramKeys.size).toBe(0);
  });

  it("空数组 / 空项返回空结果", () => {
    const { params, paramKeys } = filterStateToParams([]);
    expect(params).toEqual({});
    expect(paramKeys.size).toBe(0);
  });

  it("FilterInput：trim 后非空才写入；空/纯空白不发送", () => {
    const mk = (value) => baseFilter({ type: "FilterInput", data: { value } });
    expect(filterStateToParams([mk("  张三  ")]).params).toEqual({ f1: "张三" });
    expect(filterStateToParams([mk("")]).params).toEqual({});
    expect(filterStateToParams([mk("   ")]).params).toEqual({});
    expect(filterStateToParams([mk(null)]).params).toEqual({});
    // 数值转字符串
    expect(filterStateToParams([mk(0)]).params).toEqual({ f1: "0" });
  });

  it("FilterCheckbox：过滤空值后以数组发送；全空不发送", () => {
    const mk = (values) =>
      baseFilter({ type: "FilterCheckbox", data: { values } });
    expect(filterStateToParams([mk(["a", null, "", "b"])]).params).toEqual({
      f1: ["a", "b"],
    });
    expect(filterStateToParams([mk([])]).params).toEqual({});
    expect(filterStateToParams([mk([null])]).params).toEqual({});
  });

  it("paramKey 优先于 field（含 defParamKey 自定义）", () => {
    const f = baseFilter({
      field: "role",
      paramKey: "roleList",
      type: "FilterCheckbox",
      data: { values: ["admin"] },
    });
    expect(filterStateToParams([f]).params).toEqual({ roleList: ["admin"] });
  });

  describe("区间类（FilterDateRange / FilterNumberRange）", () => {
    const mkRange = (over) =>
      baseFilter({
        type: "FilterDateRange",
        field: "createTime",
        paramKey: "createTime",
        data: { values: [null, null] },
        ...over,
      });

    it("默认 array 模式：两端都空不发送", () => {
      const { params } = filterStateToParams([mkRange({})]);
      expect(params).toEqual({});
    });

    it("array 模式发送完整两元数组（空端补 emptyValue）", () => {
      const { params } = filterStateToParams([
        mkRange({ data: { values: ["2024-01-01", null] } }),
      ]);
      expect(params).toEqual({ createTime: ["2024-01-01", null] });
    });

    it("array 模式支持 props.emptyValue 占位", () => {
      const { params } = filterStateToParams([
        mkRange({
          data: { values: [null, "2024-02-01"] },
          props: { emptyValue: "" },
        }),
      ]);
      expect(params).toEqual({ createTime: ["", "2024-02-01"] });
    });

    it("数组长度不足 2 时补位（位置语义稳定）", () => {
      const { params } = filterStateToParams([
        mkRange({ data: { values: ["2024-03-01"] } }),
      ]);
      expect(params).toEqual({ createTime: ["2024-03-01", null] });
    });

    it("split 模式：日期用 startXxx/endXxx，数字用 XxxMin/XxxMax，按端独立判断", () => {
      const dateF = mkRange({
        data: { values: ["2024-01-01", null] },
        props: { paramMode: "split" },
      });
      expect(filterStateToParams([dateF]).params).toEqual({
        startCreateTime: "2024-01-01",
      });

      const numF = baseFilter({
        type: "FilterNumberRange",
        field: "age",
        paramKey: "age",
        data: { values: [18, 60] },
        props: { paramMode: "split" },
      });
      expect(filterStateToParams([numF]).params).toEqual({
        ageMin: 18,
        ageMax: 60,
      });
    });

    it("both 模式同时发送数组与 split 两端", () => {
      const f = mkRange({
        data: { values: ["2024-01-01", "2024-02-01"] },
        props: { paramMode: "both" },
      });
      const { params } = filterStateToParams([f]);
      expect(params).toEqual({
        createTime: ["2024-01-01", "2024-02-01"],
        startCreateTime: "2024-01-01",
        endCreateTime: "2024-02-01",
      });
    });

    it("paramMode 非法值回退 array", () => {
      const f = mkRange({
        data: { values: ["2024-01-01", null] },
        props: { paramMode: "foo" },
      });
      expect(filterStateToParams([f]).params).toEqual({
        createTime: ["2024-01-01", null],
      });
    });
  });

  it("paramKeys 集合与 params 的 key 一致", () => {
    const fs = [
      baseFilter({ field: "a", type: "FilterInput", data: { value: "1" } }),
      baseFilter({
        field: "b",
        type: "FilterCheckbox",
        data: { values: ["x"] },
      }),
    ];
    const { params, paramKeys } = filterStateToParams(fs);
    expect([...paramKeys].sort()).toEqual(Object.keys(params).sort());
  });
});

describe("sortStateToParams", () => {
  const s = (field, order, property) => ({ field, property, order });

  it("无生效排序返回空", () => {
    expect(sortStateToParams([])).toEqual({
      params: {},
      paramKeys: new Set(),
    });
    // order 为 'null' 或空时视为未生效
    expect(sortStateToParams([s("a", "null")]).params).toEqual({});
    expect(sortStateToParams([s(undefined, "asc", undefined)]).params).toEqual(
      {},
    );
  });

  it("默认模式：单字段用原值，多字段逗号连接；key 可配", () => {
    const one = sortStateToParams([s("age", "desc")]);
    expect(one.params).toEqual({ sortField: "age", sortOrder: "desc" });
    expect([...one.paramKeys]).toEqual(["sortField", "sortOrder"]);

    const multi = sortStateToParams([s("a", "asc"), s("b", "desc")]);
    expect(multi.params).toEqual({ sortField: "a,b", sortOrder: "asc,desc" });

    const custom = sortStateToParams([s("a", "asc")], {
      fieldKey: "orderField",
      orderKey: "orderRule",
    });
    expect(custom.params).toEqual({ orderField: "a", orderRule: "asc" });
  });

  it("property 兜底 field（vxe 排序项可能只有 property）", () => {
    const { params } = sortStateToParams([{ property: "code", order: "asc" }]);
    expect(params).toEqual({ sortField: "code", sortOrder: "asc" });
  });

  it("combined 模式：合并为单个 key，可配分隔符", () => {
    const r = sortStateToParams([s("a", "asc"), s("b", "desc")], {
      combined: true,
    });
    expect(r.params).toEqual({ orderBy: "a asc,b desc" });
    expect([...r.paramKeys]).toEqual(["orderBy"]);

    const custom = sortStateToParams([s("a", "asc")], {
      combined: true,
      combinedKey: "sorts",
      combinedSeparator: "_",
      combinedMultiSeparator: ";",
    });
    expect(custom.params).toEqual({ sorts: "a_asc" });
  });
});
