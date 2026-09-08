import { describe, it, expect } from "vitest";
import { applyLocalFilterSort } from "../../src/components/tablePro/utils/localFilterSort.js";

// 过滤项形状与 getFilterSortState 收集结果一致
const filter = (field, type, data, active = true) => ({ field, type, data, active });
const sort = (field, order) => ({ field, order });

describe("applyLocalFilterSort 无生效条件", () => {
  it("无过滤/排序时返回原数组引用（不拷贝）", () => {
    const rows = [{ a: 1 }];
    expect(applyLocalFilterSort(rows, [], [])).toBe(rows);
  });

  it("未激活过滤 / 空排序被忽略", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    // 激活但关键字为空 → 语义上全通过，但仍走过滤管线返回新数组
    expect(applyLocalFilterSort(rows, [filter("a", "FilterInput", { value: "" }, true)], [])).toEqual(rows);
    // 未激活 → 不进入过滤，原引用返回
    expect(applyLocalFilterSort(rows, [filter("a", "FilterInput", { value: "1" }, false)], [])).toBe(rows);
    // 空 order 排序被忽略 → 原引用返回
    expect(applyLocalFilterSort(rows, [], [sort("a", ""), sort("b", null)])).toBe(rows);
    // 有效排序即使顺序不变也产生新数组（排序分支）
    expect(applyLocalFilterSort(rows, [], [sort("a", "asc")])).toEqual(rows);
  });

  it("非数组 data 安全返回空数组", () => {
    expect(applyLocalFilterSort(null, [], [])).toEqual([]);
  });
});

describe("FilterInput 本地匹配", () => {
  const rows = [
    { id: 1, name: "张三丰" },
    { id: 2, name: "李四" },
    { id: 3, name: "Alice" },
    { id: 4, name: null },
  ];

  it("包含匹配且忽略大小写", () => {
    const f = [filter("name", "FilterInput", { value: "张三" })];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([1]);
    const f2 = [filter("name", "FilterInput", { value: "ALICE" })];
    expect(applyLocalFilterSort(rows, f2, []).map((r) => r.id)).toEqual([3]);
  });

  it("关键字两侧空白会被 trim，空值字段不参与匹配但保留", () => {
    const f = [filter("name", "FilterInput", { value: "  李  " })];
    // 关键字 trim 后为 "李"，只有 张三丰 含 "李"? 张三丰 无 “李”；李四 匹配
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([2]);
  });
});

describe("FilterCheckbox 本地匹配", () => {
  const rows = [
    { id: 1, role: "admin" },
    { id: 2, role: "editor" },
    { id: 3, role: 1 }, // 与字符串值做宽松比较
    { id: 4, role: "viewer" },
    { id: 5, role: null },
  ];

  it("同列多值之间是「或」", () => {
    const f = [
      filter("role", "FilterCheckbox", { values: ["admin", "viewer"] }),
    ];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([1, 4]);
  });

  it("String 宽松比较（数字选项值可命中数字/字符串字段）", () => {
    const f = [filter("role", "FilterCheckbox", { values: ["1"] })];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([3]);
  });

  it("不同列之间是「且」", () => {
    const rows2 = [
      { id: 1, dept: "a", role: "admin" },
      { id: 2, dept: "b", role: "admin" },
      { id: 3, dept: "a", role: "editor" },
    ];
    const f = [
      filter("dept", "FilterCheckbox", { values: ["a"] }),
      filter("role", "FilterCheckbox", { values: ["admin"] }),
    ];
    expect(applyLocalFilterSort(rows2, f, []).map((r) => r.id)).toEqual([1]);
  });
});

describe("FilterNumberRange 本地匹配", () => {
  const rows = [
    { id: 1, age: 18 },
    { id: 2, age: 60 },
    { id: 3, age: null },
    { id: 4, age: "30" },
    { id: 5, age: "abc" },
  ];

  it("闭区间 [18, 60] 只保留数值在区间内的行", () => {
    const f = [filter("age", "FilterNumberRange", { values: [18, 60] })];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([1, 2, 4]);
  });

  it("仅一端有值时只约束该端", () => {
    const min = [filter("age", "FilterNumberRange", { values: [30, null] })];
    expect(applyLocalFilterSort(rows, min, []).map((r) => r.id)).toEqual([2, 4]);
    const max = [filter("age", "FilterNumberRange", { values: [null, 30] })];
    expect(applyLocalFilterSort(rows, max, []).map((r) => r.id)).toEqual([1, 4]);
  });

  it("区间生效时 null / 非数值字段值不匹配", () => {
    const f = [filter("age", "FilterNumberRange", { values: [18, 60] })];
    const got = applyLocalFilterSort(rows, f, []);
    expect(got.some((r) => r.id === 3 || r.id === 5)).toBe(false);
  });

  it("边界值包含（18/60 均在闭区间内）", () => {
    const f = [filter("age", "FilterNumberRange", { values: [18, 18] })];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([1]);
  });
});

describe("FilterDateRange 本地匹配（整天语义）", () => {
  const rows = [
    { id: 1, time: "2024-01-01" }, // 当天 00:00（纯日期）
    { id: 2, time: "2024-01-01 12:30:00" },
    { id: 3, time: "2024-01-02 23:59:59" },
    { id: 4, time: "2024-01-03 00:00:00" },
    { id: 5, time: "bad-date" },
    { id: 6, time: null },
  ];

  it("纯日期端点按整天（start 当天起 / end 当天末止）", () => {
    const f = [
      filter("time", "FilterDateRange", { values: ["2024-01-01", "2024-01-02"] }),
    ];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("仅起始日期约束（当天起包含）", () => {
    const f = [filter("time", "FilterDateRange", { values: ["2024-01-02", null] })];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([3, 4]);
  });

  it("仅结束日期约束（当天末止包含当天）", () => {
    const f = [filter("time", "FilterDateRange", { values: [null, "2024-01-02"] })];
    expect(applyLocalFilterSort(rows, f, []).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("区间生效时无法解析的字段值（含 null / 非法）被排除", () => {
    const f = [
      filter("time", "FilterDateRange", { values: ["2024-01-01", "2024-01-31"] }),
    ];
    const got = applyLocalFilterSort(rows, f, []);
    expect(got.some((r) => r.id === 5 || r.id === 6)).toBe(false);
  });
});

describe("排序", () => {
  const rows = [
    { id: "a", n: 2, s: "banana" },
    { id: "b", n: null, s: "apple" },
    { id: "c", n: 1, s: "cherry" },
    { id: "d", n: 2, s: "apple" },
    { id: "e", n: "", s: "date" },
  ];

  it("数字升序：空值恒最后", () => {
    const r = applyLocalFilterSort(rows, [], [sort("n", "asc")]);
    expect(r.map((x) => x.id)).toEqual(["c", "a", "d", "b", "e"]);
  });

  it("数字降序不翻转空值位置", () => {
    const r = applyLocalFilterSort(rows, [], [sort("n", "desc")]);
    expect(r.map((x) => x.id)).toEqual(["a", "d", "c", "b", "e"]);
  });

  it("多字段排序按传入顺序依次比较；稳定排序保持相等行原始顺序", () => {
    const r = applyLocalFilterSort(rows, [], [sort("n", "asc"), sort("s", "asc")]);
    // n:1 → c；n:2 中 s 升序 → d(apple) 先于 a(banana)
    expect(r.map((x) => x.id)).toEqual(["c", "d", "a", "b", "e"]);
  });

  it("字符串比较（不可转数字/日期的值）", () => {
    const r = applyLocalFilterSort(rows, [], [sort("s", "asc")]);
    expect(r.map((x) => x.id)).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("日期字符串按时间戳比较", () => {
    const dates = [
      { id: 1, d: "2024-03-01" },
      { id: 2, d: "2024-01-15" },
      { id: 3, d: "2024-02-01 08:00" },
    ];
    const r = applyLocalFilterSort(dates, [], [sort("d", "desc")]);
    expect(r.map((x) => x.id)).toEqual([1, 3, 2]);
  });

  it("排序不修改原数组", () => {
    const copy = [...rows];
    applyLocalFilterSort(rows, [], [sort("n", "asc")]);
    expect(rows).toEqual(copy);
  });
});

describe("过滤 + 排序组合", () => {
  const rows = [
    { id: 1, role: "admin", age: 30 },
    { id: 2, role: "editor", age: 20 },
    { id: 3, role: "admin", age: 10 },
    { id: 4, role: "viewer", age: 40 },
  ];

  it("先过滤后排序（排序作用于过滤结果）", () => {
    const f = [filter("role", "FilterCheckbox", { values: ["admin"] })];
    const r = applyLocalFilterSort(rows, f, [sort("age", "desc")]);
    expect(r.map((x) => x.id)).toEqual([1, 3]);
  });
});
