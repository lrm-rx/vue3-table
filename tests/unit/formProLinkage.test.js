// @vitest-environment jsdom
/**
 * FormPro 声明式联动纯逻辑单测：
 *  - resolveOptionsSourceDeps    deps 归一化（数组字段名 / 函数形态）
 *  - resolveOptionsSourceTrigger 触发策略（首次豁免清值与防抖、clearValue、debounce）
 *  - shouldFetchOptions          when 守卫求值
 *  - resolveDynamicControlState  disabledWhen / readonlyWhen 动态禁用只读求值
 * 组件侧的执行（loading、防抖计时器、防竞态 token、render 期依赖追踪）见
 * tests/integration/FormPro.test.js 的「optionsSource」「disabledWhen / readonlyWhen」用例。
 */
import { describe, it, expect, vi } from "vitest";
import {
  resolveOptionsSourceDeps,
  resolveOptionsSourceTrigger,
  shouldFetchOptions,
  resolveDynamicControlState,
  mergeModelValue,
} from "../../src/components/formPro/utils.js";

describe("resolveOptionsSourceDeps（依赖快照归一化）", () => {
  it("数组形态：按字段名从 data 取值", () => {
    const data = { resourceGroup: "A", keyword: "pay" };
    expect(resolveOptionsSourceDeps(["resourceGroup"], data)).toEqual(["A"]);
    expect(resolveOptionsSourceDeps(["resourceGroup", "keyword"], data)).toEqual([
      "A",
      "pay",
    ]);
  });

  it("数组形态：缺失字段取到 undefined（仍占一位，参与比对）", () => {
    expect(resolveOptionsSourceDeps(["missing"], { a: 1 })).toEqual([undefined]);
  });

  it("函数形态：返回值原样作为快照（支持自定义依赖表达式）", () => {
    const deps = (data) => [data.a, data.b * 2];
    expect(resolveOptionsSourceDeps(deps, { a: 1, b: 3 })).toEqual([1, 6]);
  });

  it("函数形态：返回非数组时包装为单元素数组", () => {
    expect(resolveOptionsSourceDeps((data) => data.tag, { tag: "x" })).toEqual(["x"]);
    expect(resolveOptionsSourceDeps(() => undefined, {})).toEqual([undefined]);
  });

  it("deps 未配置 / 空数组：返回空数组", () => {
    expect(resolveOptionsSourceDeps(undefined, { a: 1 })).toEqual([]);
    expect(resolveOptionsSourceDeps([], { a: 1 })).toEqual([]);
  });

  it("data 缺省：数组形态不报错，全部取 undefined", () => {
    expect(resolveOptionsSourceDeps(["a", "b"])).toEqual([undefined, undefined]);
  });
});

describe("resolveOptionsSourceTrigger（触发策略）", () => {
  it("首次触发：不清值、不防抖（即使配置了 debounce 也立即拉取）", () => {
    expect(resolveOptionsSourceTrigger({ debounce: 400 }, true)).toEqual({
      clearValue: false,
      delay: 0,
    });
    expect(resolveOptionsSourceTrigger({}, true)).toEqual({
      clearValue: false,
      delay: 0,
    });
  });

  it("非首次默认：清值 + 立即执行", () => {
    expect(resolveOptionsSourceTrigger({}, false)).toEqual({
      clearValue: true,
      delay: 0,
    });
  });

  it("非首次 clearValue:false：保留本字段值", () => {
    expect(resolveOptionsSourceTrigger({ clearValue: false }, false)).toEqual({
      clearValue: false,
      delay: 0,
    });
  });

  it("非首次 debounce>0：返回防抖毫秒数", () => {
    expect(resolveOptionsSourceTrigger({ debounce: 400 }, false)).toEqual({
      clearValue: true,
      delay: 400,
    });
  });

  it("debounce 为 0 / 负数 / 非法值：按立即执行处理", () => {
    expect(resolveOptionsSourceTrigger({ debounce: 0 }, false).delay).toBe(0);
    expect(resolveOptionsSourceTrigger({ debounce: -1 }, false).delay).toBe(0);
    expect(resolveOptionsSourceTrigger({ debounce: NaN }, false).delay).toBe(0);
  });

  it("src 缺省：按默认策略（清值 + 立即执行）", () => {
    expect(resolveOptionsSourceTrigger(undefined, false)).toEqual({
      clearValue: true,
      delay: 0,
    });
  });
});

describe("shouldFetchOptions（when 守卫）", () => {
  it("未配置 when：恒可拉取", () => {
    expect(shouldFetchOptions({}, { a: 1 })).toBe(true);
    expect(shouldFetchOptions(undefined, {})).toBe(true);
  });

  it("when 返回真值：可拉取；返回假值：不拉取（调用方清空 options）", () => {
    const src = { when: (data) => !!data.resourceGroup };
    expect(shouldFetchOptions(src, { resourceGroup: "A" })).toBe(true);
    expect(shouldFetchOptions(src, { resourceGroup: "" })).toBe(false);
  });

  it("when 返回非布尔真值：做真值转换", () => {
    expect(shouldFetchOptions({ when: (data) => data.n }, { n: 2 })).toBe(true);
    expect(shouldFetchOptions({ when: (data) => data.n }, { n: 0 })).toBe(false);
  });
});

describe("resolveDynamicControlState（动态禁用 / 只读）", () => {
  const ctx = { value: "", prop: "phone", data: { contact: "" } };

  it("未配置 disabledWhen / readonlyWhen：均为 false", () => {
    expect(resolveDynamicControlState({ prop: "phone" }, ctx)).toEqual({
      disabled: false,
      readonly: false,
    });
  });

  it("disabledWhen 依据 ctx.data 求值：依赖字段为空 → disabled true", () => {
    const item = { prop: "phone", disabledWhen: (c) => !c.data.contact };
    expect(resolveDynamicControlState(item, ctx).disabled).toBe(true);
    expect(
      resolveDynamicControlState(item, { ...ctx, data: { contact: "张三" } })
        .disabled,
    ).toBe(false);
  });

  it("readonlyWhen 依据 ctx.data 求值：依赖字段为空 → readonly true", () => {
    const item = { prop: "note", readonlyWhen: (c) => !c.data.contact };
    expect(resolveDynamicControlState(item, ctx).readonly).toBe(true);
    expect(
      resolveDynamicControlState(item, { ...ctx, data: { contact: "张三" } })
        .readonly,
    ).toBe(false);
  });

  it("ctx 透传：函数收到的 value / prop / data 与传入一致", () => {
    const disabledWhen = vi.fn(() => false);
    const item = { prop: "phone", disabledWhen };
    resolveDynamicControlState(item, ctx);
    expect(disabledWhen).toHaveBeenCalledWith(ctx);
  });

  it("函数返回非布尔真值：做真值转换", () => {
    expect(
      resolveDynamicControlState({ disabledWhen: () => 1 }, ctx).disabled,
    ).toBe(true);
    expect(
      resolveDynamicControlState({ readonlyWhen: () => "" }, ctx).readonly,
    ).toBe(false);
  });

  it("item 为 null / undefined：不报错，均为 false", () => {
    expect(resolveDynamicControlState(null, ctx)).toEqual({
      disabled: false,
      readonly: false,
    });
    expect(resolveDynamicControlState(undefined)).toEqual({
      disabled: false,
      readonly: false,
    });
  });

  it("多条件组合：部门 / 职位任一为空 → disabled true", () => {
    const item = {
      prop: "entryDate",
      disabledWhen: (c) => !c.data.dept || !c.data.position,
    };
    const withData = (data) => ({ value: "", prop: "entryDate", data });
    expect(resolveDynamicControlState(item, withData({})).disabled).toBe(true);
    expect(
      resolveDynamicControlState(item, withData({ dept: "rd" })).disabled,
    ).toBe(true);
    expect(
      resolveDynamicControlState(item, withData({ dept: "rd", position: "fe" }))
        .disabled,
    ).toBe(false);
  });
});

describe("mergeModelValue（v-model 三方合并）", () => {
  it("两侧与 base 一致：返回内容相同的新对象", () => {
    const current = { a: 1, b: "x" };
    const merged = mergeModelValue({
      current,
      incoming: { a: 1, b: "x" },
      base: { a: 1, b: "x" },
    });
    expect(merged).toEqual({ a: 1, b: "x" });
    expect(merged).not.toBe(current); // 始终返回新对象
  });

  it("父级改了某键：取父级值", () => {
    const merged = mergeModelValue({
      current: { a: 1 },
      incoming: { a: 2 },
      base: { a: 1 },
    });
    expect(merged.a).toBe(2);
  });

  it("子级改了某键、父级没改：保留子级值", () => {
    const merged = mergeModelValue({
      current: { a: 2 },
      incoming: { a: 1 },
      base: { a: 1 },
    });
    expect(merged.a).toBe(2);
  });

  it("同 tick 父改 x、子改 y：两侧修改双保留（竞态修复核心场景）", () => {
    // 场景：change 事件里父级清空 resource，同 tick 子级 emit 携带刚改的 name
    const merged = mergeModelValue({
      current: { name: "张三", resource: "old" }, // 子级刚改 name，emit 在途
      incoming: { name: "", resource: "" }, // 父级拿到旧 name，但显式清空了 resource
      base: { name: "", resource: "old" },
    });
    expect(merged).toEqual({ name: "张三", resource: "" });
  });

  it("同一键父子都改：父级显式写入优先", () => {
    const merged = mergeModelValue({
      current: { a: "child" },
      incoming: { a: "parent" },
      base: { a: "base" },
    });
    expect(merged.a).toBe("parent");
  });

  it("childDeleted：子级刚删除的键不被父级残留快照 resurrect", () => {
    // 子级 removeItems 删了 age，emit 在途，父级快照还是旧值
    const merged = mergeModelValue({
      current: { name: "x" },
      incoming: { name: "x", age: 28 },
      base: { name: "x", age: 28 },
    });
    expect(merged).toEqual({ name: "x" });
    expect("age" in merged).toBe(false);
  });

  it("父级没改且子级本无该键：不写入 undefined 键（防 base 污染）", () => {
    const merged = mergeModelValue({
      current: {},
      incoming: { a: 1 },
      base: { a: 1 },
    });
    expect("a" in merged).toBe(false);
  });

  it("对照：父级显式新增键（base 无、incoming 有值）→ 正常写入", () => {
    const merged = mergeModelValue({
      current: {},
      incoming: { a: 1 },
      base: {},
    });
    expect(merged.a).toBe(1);
  });

  it("子级有 incoming 缺失的键：保留（removeHiddenValues 隐藏字段不丢值）", () => {
    const merged = mergeModelValue({
      current: { shown: "a", hidden: "keep" },
      incoming: { shown: "a" }, // 父级快照剔除了隐藏字段
      base: { shown: "a", hidden: "keep" },
    });
    expect(merged).toEqual({ shown: "a", hidden: "keep" });
  });

  it("子级值为 undefined 且 incoming 缺失：不保留该键", () => {
    const merged = mergeModelValue({
      current: { a: 1, ghost: undefined },
      incoming: { a: 1 },
      base: { a: 1 },
    });
    expect("ghost" in merged).toBe(false);
  });

  it("父级整体替换：全部键以父级为准，子级独有键仍保留", () => {
    const merged = mergeModelValue({
      current: { a: 1, b: 2, childOnly: "c" },
      incoming: { a: 10, b: 20 },
      base: { a: 1, b: 2 },
    });
    expect(merged).toEqual({ a: 10, b: 20, childOnly: "c" });
  });

  it("深比较：对象值与 base 深等 → 不算父级修改，保留子级新对象", () => {
    const childObj = { tags: ["a", "b"], extra: true };
    const merged = mergeModelValue({
      current: { cfg: childObj },
      incoming: { cfg: { tags: ["a", "b"] } }, // 与 base 深等
      base: { cfg: { tags: ["a", "b"] } },
    });
    expect(merged.cfg).toEqual({ tags: ["a", "b"], extra: true });
  });

  it("autoFillDefaults：两侧都缺失的字段补默认值，已有值不覆盖", () => {
    const items = [
      { prop: "name", itemRender: { name: "ElInput" } },
      { prop: "enabled", itemRender: { name: "ElSwitch" } },
      { prop: "level", itemRender: { name: "ElSelect" }, defaultValue: "p6" },
    ];
    const merged = mergeModelValue({
      current: { name: "张三" },
      incoming: { name: "张三" },
      base: { name: "张三" },
      items,
      autoFillDefaults: true,
    });
    expect(merged).toEqual({ name: "张三", enabled: false, level: "p6" });
  });

  it("autoFillDefaults 关闭：不补默认值", () => {
    const items = [{ prop: "enabled", itemRender: { name: "ElSwitch" } }];
    const merged = mergeModelValue({
      current: {},
      incoming: {},
      base: {},
      items,
      autoFillDefaults: false,
    });
    expect(merged).toEqual({});
  });

  it("incoming 为 null / undefined：按 {} 处理，子级值全部保留", () => {
    const current = { a: 1, b: 2 };
    expect(mergeModelValue({ current, incoming: null, base: {} })).toEqual(current);
    expect(mergeModelValue({ current, incoming: undefined, base: {} })).toEqual(
      current,
    );
  });

  it("不可变性：不修改 current / incoming / base 入参", () => {
    const current = { a: 2 };
    const incoming = { a: 1, b: 3 };
    const base = { a: 1 };
    mergeModelValue({ current, incoming, base });
    expect(current).toEqual({ a: 2 });
    expect(incoming).toEqual({ a: 1, b: 3 });
    expect(base).toEqual({ a: 1 });
  });
});
