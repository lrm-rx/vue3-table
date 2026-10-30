// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  GRID_COLS,
  isGroupItem,
  isInsertItem,
  isFieldItem,
  isItemRequired,
  isItemVisible,
  isHiddenByVisibility,
  collectHiddenValueOverrides,
  resolveSpan,
  splitIntoGroups,
  resolveVisibleEntries,
  collectFieldProps,
  deriveDefaultValue,
  buildInitialData,
  resolveFieldOptions,
  resolveGroupTitleStyle,
  resolveVisualRowIndexes,
  collectTipRows,
  addItems,
  removeItems,
  updateItems,
  objectToFormData,
} from "../../src/components/formPro/utils.js";

describe("formPro utils", () => {
  describe("类型判定", () => {
    it("isGroupItem / isFieldItem / isInsertItem 互斥且正确", () => {
      const g = { group: true, title: "A" };
      const f = { prop: "name", label: "名称" };
      const ins = { slot: "divider" };
      expect(isGroupItem(g)).toBe(true);
      expect(isFieldItem(g)).toBe(false);
      expect(isInsertItem(g)).toBe(false);
      expect(isFieldItem(f)).toBe(true);
      expect(isInsertItem(f)).toBe(false);
      expect(isInsertItem(ins)).toBe(true);
      expect(isFieldItem(ins)).toBe(false);
    });
  });

  describe("resolveGroupTitleStyle（分组标题样式）", () => {
    it("空配置返回空样式对象（不加内联字重，继承 CSS 默认 600）", () => {
      expect(resolveGroupTitleStyle({})).toEqual({});
      expect(resolveGroupTitleStyle({ title: "G" })).toEqual({});
      expect(resolveGroupTitleStyle()).toEqual({});
    });

    it("titleBold: true → fontWeight 700；false → 400", () => {
      expect(resolveGroupTitleStyle({ titleBold: true })).toEqual({ fontWeight: 700 });
      expect(resolveGroupTitleStyle({ titleBold: false })).toEqual({ fontWeight: 400 });
    });

    it("titleStyle 原样展开（颜色/字号等自定义样式）", () => {
      expect(
        resolveGroupTitleStyle({ titleStyle: { color: "#409eff", fontSize: 15 } }),
      ).toEqual({ color: "#409eff", fontSize: 15 });
    });

    it("titleBold 与 titleStyle 叠加", () => {
      expect(
        resolveGroupTitleStyle({
          titleBold: true,
          titleStyle: { color: "red" },
        }),
      ).toEqual({ color: "red", fontWeight: 700 });
    });

    it("titleStyle.fontWeight 显式指定时优先于 titleBold 推导", () => {
      expect(
        resolveGroupTitleStyle({ titleBold: true, titleStyle: { fontWeight: 500 } }),
      ).toEqual({ fontWeight: 500 });
      expect(
        resolveGroupTitleStyle({ titleBold: false, titleStyle: { fontWeight: 900 } }),
      ).toEqual({ fontWeight: 900 });
    });

    it("不修改入参（纯函数）", () => {
      const src = { titleBold: true, titleStyle: { color: "red" } };
      resolveGroupTitleStyle(src);
      expect(src.titleStyle).toEqual({ color: "red" });
      expect("fontWeight" in src.titleStyle).toBe(false);
    });
  });

  describe("resolveSpan（24 栅格）", () => {
    it("item.span 优先于表单级 span", () => {
      expect(resolveSpan({ span: 8 }, 12)).toBe(8);
    });
    it("缺省回退表单级 span，默认 24", () => {
      expect(resolveSpan({}, 12)).toBe(12);
      expect(resolveSpan({})).toBe(24);
    });
    it("越界钳制到 [1,24]", () => {
      expect(resolveSpan({ span: 0 })).toBe(1);
      expect(resolveSpan({ span: 100 })).toBe(24);
      expect(resolveSpan({ span: -3 })).toBe(1);
      expect(resolveSpan({ span: "12" })).toBe(12);
    });
  });

  describe("isItemRequired", () => {
    it("item.required=true 即必填", () => {
      expect(isItemRequired({ prop: "a", required: true })).toBe(true);
    });
    it("rules 含 required:true 即必填（item.rules 与 formRules 合并）", () => {
      expect(
        isItemRequired({ prop: "a", rules: [{ required: true }] }),
      ).toBe(true);
      expect(isItemRequired({ prop: "a" }, { a: [{ required: true }] })).toBe(
        true,
      );
    });
    it("非必填返回 false", () => {
      expect(isItemRequired({ prop: "a" })).toBe(false);
      expect(
        isItemRequired({ prop: "a", rules: [{ required: false }] }),
      ).toBe(false);
    });
  });

  describe("isItemVisible", () => {
    const formRules = { a: [{ required: true }] };
    it("visible:false 隐藏", () => {
      expect(isItemVisible({ prop: "a", visible: false })).toBe(false);
    });
    it("visibleMethod(data) 返回 false 隐藏", () => {
      expect(
        isItemVisible(
          { prop: "a", visibleMethod: (d) => !!d.flag },
          { data: { flag: false } },
        ),
      ).toBe(false);
      expect(
        isItemVisible(
          { prop: "a", visibleMethod: (d) => !!d.flag },
          { data: { flag: true } },
        ),
      ).toBe(true);
    });
    it("onlyRequired 过滤掉非必填字段项", () => {
      expect(
        isItemVisible({ prop: "b" }, { onlyRequired: true, formRules }),
      ).toBe(false);
      expect(
        isItemVisible({ prop: "a" }, { onlyRequired: true, formRules }),
      ).toBe(true);
    });
    it("onlyRequired 不影响插入项（无 field）", () => {
      expect(
        isItemVisible({ slot: "x" }, { onlyRequired: true, formRules }),
      ).toBe(true);
    });
  });

  describe("splitIntoGroups（分组切分）", () => {
    it("无分组头 → 单一匿名组", () => {
      const items = [{ prop: "a" }, { prop: "b" }];
      const blocks = splitIntoGroups(items);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].group).toBeNull();
      expect(blocks[0].items).toHaveLength(2);
    });
    it("分组头切分多组，组前项归入匿名组", () => {
      const items = [
        { prop: "pre" },
        { group: true, title: "G1" },
        { prop: "a" },
        { group: true, title: "G2" },
        { prop: "b" },
      ];
      const blocks = splitIntoGroups(items);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].group).toBeNull();
      expect(blocks[0].items).toEqual([{ prop: "pre" }]);
      expect(blocks[1].group.title).toBe("G1");
      expect(blocks[1].items).toEqual([{ prop: "a" }]);
      expect(blocks[2].group.title).toBe("G2");
      expect(blocks[2].items).toEqual([{ prop: "b" }]);
    });
    it("丢弃空匿名组（首项就是分组头）", () => {
      const items = [{ group: true, title: "G" }, { prop: "a" }];
      const blocks = splitIntoGroups(items);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].group.title).toBe("G");
    });
  });

  describe("resolveVisibleEntries（可见项解析 + 回流）", () => {
    it("隐藏项被排除，后续项保留并前移（输出有序）", () => {
      const items = [
        { prop: "a", span: 8 },
        { prop: "b", span: 8, visible: false },
        { prop: "c", span: 8, visibleMethod: () => false },
        { prop: "d", span: 8 },
      ];
      const entries = resolveVisibleEntries(items, { formSpan: 24 });
      expect(entries.map((e) => e.item.prop)).toEqual(["a", "d"]);
      expect(entries.every((e) => e.kind === "field")).toBe(true);
    });
    it("onlyRequired 只保留必填项，插入项始终保留", () => {
      const items = [
        { prop: "a", required: true, span: 12 },
        { prop: "b", span: 12 },
        { slot: "divider" },
      ];
      const entries = resolveVisibleEntries(items, {
        onlyRequired: true,
        formSpan: 24,
      });
      expect(entries).toHaveLength(2);
      expect(entries[0].kind).toBe("field");
      expect(entries[0].item.prop).toBe("a");
      expect(entries[1].kind).toBe("insert");
    });
    it("插入项带 span 解析，默认 24", () => {
      const entries = resolveVisibleEntries([{ slot: "x", span: 6 }], {
        formSpan: 24,
      });
      expect(entries[0].span).toBe(6);
      const entries2 = resolveVisibleEntries([{ render: () => null }], {
        formSpan: 24,
      });
      expect(entries2[0].span).toBe(24);
    });
    it("字段项携带 required 标记", () => {
      const entries = resolveVisibleEntries(
        [{ prop: "a", required: true }, { prop: "b" }],
        { formSpan: 24 },
      );
      expect(entries[0].required).toBe(true);
      expect(entries[1].required).toBe(false);
    });
  });

  describe("隐藏字段值改写（isHiddenByVisibility / collectHiddenValueOverrides）", () => {
    it("isHiddenByVisibility：仅 visible/visibleMethod 隐藏判定，不涉及 onlyRequired", () => {
      // 约定：visibleMethod 返回 false 表示隐藏
      expect(isHiddenByVisibility({ prop: "a", visible: false }, {})).toBe(true);
      expect(isHiddenByVisibility({ prop: "a", visibleMethod: () => false }, {})).toBe(
        true,
      );
      // type=company 时显示（返回 true），其余隐藏（返回 false）
      const vm = (d) => d.type === "company";
      expect(isHiddenByVisibility({ prop: "a", visibleMethod: vm }, { type: "personal" })).toBe(
        true, // 返回 false → 隐藏
      );
      expect(isHiddenByVisibility({ prop: "a", visibleMethod: vm }, { type: "company" })).toBe(
        false, // 返回 true → 不隐藏
      );
      // 普通可见字段
      expect(isHiddenByVisibility({ prop: "a" }, {})).toBe(false);
      // 非字段项（插入项/分组头）始终 false
      expect(isHiddenByVisibility({ slot: "x" }, {})).toBe(false);
      expect(isHiddenByVisibility({ group: true, title: "G" }, {})).toBe(false);
    });

    it("collectHiddenValueOverrides：表单级未设置（undefined）时不改写任何值", () => {
      const items = [
        { prop: "a", visible: false },
        { prop: "b", visibleMethod: () => false },
      ];
      expect(collectHiddenValueOverrides(items, {}, undefined).size).toBe(0);
      expect(collectHiddenValueOverrides(items, {}).size).toBe(0);
    });

    it("collectHiddenValueOverrides：设置表单级值时收集 visible/visibleMethod 隐藏字段", () => {
      const items = [
        { prop: "a", visible: false },
        { prop: "b", visibleMethod: (d) => d.show === true }, // show=false → 返回 false → 隐藏
        { prop: "c" }, // 可见
      ];
      const map = collectHiddenValueOverrides(items, { show: false }, "");
      expect([...map.keys()].sort()).toEqual(["a", "b"]);
      expect(map.get("a")).toBe("");
      expect(map.get("b")).toBe("");
    });

    it("collectHiddenValueOverrides：item.hiddenValue 可单独覆盖表单级值（项级优先）", () => {
      const items = [
        { prop: "a", visible: false, hiddenValue: null }, // 项级 null 覆盖表单级 ""
        { prop: "b", visible: false }, // 跟随表单级
        { prop: "c", visible: false, hiddenValue: "x" }, // 表单级未设置，但项级指定
      ];
      const on = collectHiddenValueOverrides(items, {}, "");
      expect(on.get("a")).toBe(null); // 项级 null 优先（null 是有效改写值）
      expect(on.get("b")).toBe(""); // 跟随表单级
      expect(on.get("c")).toBe("x"); // 项级指定
      const off = collectHiddenValueOverrides(items, {}, undefined);
      expect(off.size).toBe(2); // 表单级未设置时仅收集项级显式指定的字段（null 也是有效值）
      expect(off.get("a")).toBe(null);
      expect(off.get("c")).toBe("x");
    });

    it("collectHiddenValueOverrides：假值改写值（\"\" / null / 0）均有效，仅 undefined 表示不改写", () => {
      const items = [{ prop: "a", visible: false }];
      expect(collectHiddenValueOverrides(items, {}, "").get("a")).toBe("");
      expect(collectHiddenValueOverrides(items, {}, null).get("a")).toBe(null);
      expect(collectHiddenValueOverrides(items, {}, 0).get("a")).toBe(0); // 0 是有效改写值，不被误判为「未设置」
      expect(collectHiddenValueOverrides(items, {}, false).get("a")).toBe(false);
      expect(collectHiddenValueOverrides(items, {}, undefined).size).toBe(0);
      // 项级 0 覆盖表单级 ""
      const withItem = [{ prop: "a", visible: false, hiddenValue: 0 }];
      expect(collectHiddenValueOverrides(withItem, {}, "").get("a")).toBe(0);
    });
  });

  describe("默认值自动补全", () => {
    it("collectFieldProps：收集所有字段项 prop（去重、保序、跳过分组/插入项）", () => {
      const items = [
        { group: true, title: "G" },
        { prop: "a" },
        { slot: "x" },
        { prop: "b" },
        { prop: "a" }, // 重复
      ];
      expect(collectFieldProps(items)).toEqual(["a", "b"]);
    });

    it("deriveDefaultValue：按控件类型推导空默认值", () => {
      expect(deriveDefaultValue({ prop: "a", itemRender: { name: "ElInput" } })).toBe("");
      expect(deriveDefaultValue({ prop: "a", itemRender: { name: "ElSelect" } })).toBe("");
      expect(deriveDefaultValue({ prop: "a", itemRender: { name: "ElDatePicker" } })).toBe("");
      expect(deriveDefaultValue({ prop: "a", itemRender: { name: "ElSwitch" } })).toBe(false);
      expect(deriveDefaultValue({ prop: "a", itemRender: { name: "el-switch" } })).toBe(false);
      expect(deriveDefaultValue({ prop: "a", itemRender: { name: "ElCheckboxGroup" } })).toEqual([]);
    });

    it("deriveDefaultValue：item.defaultValue 优先于类型推导", () => {
      expect(
        deriveDefaultValue({ prop: "a", itemRender: { name: "ElInput" }, defaultValue: "N/A" }),
      ).toBe("N/A");
      expect(
        deriveDefaultValue({ prop: "a", itemRender: { name: "ElSwitch" }, defaultValue: true }),
      ).toBe(true);
    });

    it("buildInitialData：为所有字段补全默认值，用户传入值优先且不被覆盖", () => {
      const items = [
        { group: true, title: "G" },
        { prop: "name", itemRender: { name: "ElInput" } },
        { prop: "enabled", itemRender: { name: "ElSwitch" } },
        { prop: "hobbies", itemRender: { name: "ElCheckboxGroup" } },
        { prop: "level", itemRender: { name: "ElSelect" }, defaultValue: "p6" },
      ];
      const data = buildInitialData(items, { name: "张三" });
      expect(data).toEqual({
        name: "张三", // 用户值优先
        enabled: false, // 推导
        hobbies: [], // 推导
        level: "p6", // item.defaultValue
      });
    });

    it("buildInitialData：无 overrides 时也返回全部字段的默认值", () => {
      const items = [{ prop: "a", itemRender: { name: "ElInput" } }];
      expect(buildInitialData(items)).toEqual({ a: "" });
      expect(buildInitialData(items, null)).toEqual({ a: "" });
    });
  });

  describe("resolveFieldOptions（options 多形态解析）", () => {
    const opts = [
      { label: "P5", value: "p5" },
      { label: "P6", value: "p6" },
    ];
    it("静态数组原样返回", () => {
      expect(resolveFieldOptions(opts)).toEqual(opts);
    });
    it("函数形态：接收 ctx 并返回数组（级联联动）", () => {
      const fn = (ctx) =>
        ctx.data.type === "company"
          ? [{ label: "企业专属", value: "ent" }]
          : opts;
      expect(resolveFieldOptions(fn, { data: { type: "personal" } })).toEqual(opts);
      expect(resolveFieldOptions(fn, { data: { type: "company" } })).toEqual([
        { label: "企业专属", value: "ent" },
      ]);
    });
    it("函数返回非数组（如 Promise / undefined）兜底为空数组，不报错", () => {
      expect(resolveFieldOptions(() => Promise.resolve(opts))).toEqual([]);
      expect(resolveFieldOptions(() => undefined)).toEqual([]);
      expect(resolveFieldOptions(() => null)).toEqual([]);
    });
    it("非法形态（非数组非函数）兜底为空数组", () => {
      expect(resolveFieldOptions(undefined)).toEqual([]);
      expect(resolveFieldOptions(null)).toEqual([]);
      expect(resolveFieldOptions("abc")).toEqual([]);
      expect(resolveFieldOptions(42)).toEqual([]);
    });
  });

  // ===================== 运行时 items 增删改 =====================
  const field = (prop, extra = {}) => ({ prop, label: prop, ...extra });
  const baseItems = () => [
    { group: true, title: "G" },
    field("a"),
    field("b"),
    field("c"),
    { slot: "tip" },
  ];

  describe("addItems（新增：单个/批量/定位）", () => {
    it("默认追加到末尾，单个数组与单项写法等价", () => {
      const items = baseItems();
      const ret = addItems(items, field("d"));
      expect(items.map((i) => i.prop)).toEqual([
        undefined,
        "a",
        "b",
        "c",
        undefined,
        "d",
      ]);
      expect(ret).toBe(items); // 返回同一引用
      addItems(items, [field("e"), field("f")]);
      expect(items.map((i) => i.prop).slice(-2)).toEqual(["e", "f"]);
    });
    it("position='start' 插到开头（分组头之前）", () => {
      const items = baseItems();
      addItems(items, field("x"), "start");
      expect(items[0]).toMatchObject({ prop: "x" });
    });
    it("数字索引：指定位置插入，越界钳制", () => {
      const items = baseItems();
      addItems(items, field("x"), 2); // 插到 b（索引2）之前
      expect(items.map((i) => i.prop)).toEqual([
        undefined,
        "a",
        "x",
        "b",
        "c",
        undefined,
      ]);
      addItems(items, field("y"), 999);
      expect(items.at(-1)).toMatchObject({ prop: "y" });
      addItems(items, field("z"), -5);
      expect(items[0]).toMatchObject({ prop: "z" });
    });
    it("{ before } / { after } 按 prop 锚点定位", () => {
      const items = baseItems();
      addItems(items, field("x"), { before: "b" });
      addItems(items, field("y"), { after: "b" });
      expect(items.map((i) => i.prop)).toEqual([
        undefined,
        "a",
        "x",
        "b",
        "y",
        "c",
        undefined,
      ]);
    });
    it("锚点 prop 不存在时回退追加末尾", () => {
      const items = baseItems();
      addItems(items, field("x"), { after: "nonexistent" });
      expect(items.at(-1)).toMatchObject({ prop: "x" });
    });
    it("空 entries / null 项 / 非法 items 为安全 no-op", () => {
      const items = baseItems();
      const snapshot = [...items];
      addItems(items, []);
      addItems(items, [null, undefined]);
      expect(items).toEqual(snapshot);
      expect(addItems(null, field("x"))).toBeNull();
    });
  });

  describe("removeItems（删除：单个/批量/谓词）", () => {
    it("单个 prop 删除并返回被删项", () => {
      const items = baseItems();
      const removed = removeItems(items, "b");
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ prop: "b" });
      expect(items.map((i) => i.prop)).toEqual([undefined, "a", "c", undefined]);
    });
    it("批量 prop 一次删除，返回顺序与原数组一致", () => {
      const items = baseItems();
      const removed = removeItems(items, ["a", "c", "x-not-exist"]);
      expect(removed.map((i) => i.prop)).toEqual(["a", "c"]);
      expect(items.map((i) => i.prop)).toEqual([undefined, "b", undefined]);
    });
    it("谓词可删除无 prop 的分组头 / 插入项", () => {
      const items = baseItems();
      const removed = removeItems(
        items,
        (it) => it.group === true || it.slot === "tip",
      );
      expect(removed).toHaveLength(2);
      expect(items.map((i) => i.prop)).toEqual(["a", "b", "c"]);
    });
    it("无命中返回空数组且数组不变；非法入参安全", () => {
      const items = baseItems();
      expect(removeItems(items, "zzz")).toEqual([]);
      expect(items).toHaveLength(5);
      expect(removeItems(null, "a")).toEqual([]);
      expect(removeItems(items, null)).toEqual([]);
    });
  });

  describe("updateItems（更新：浅合并 / 点路径 / 函数补丁）", () => {
    it("单个 prop：顶层键整体赋值", () => {
      const items = baseItems();
      const touched = updateItems(items, "a", { visible: false, required: true });
      expect(touched).toHaveLength(1);
      expect(items[1]).toMatchObject({ prop: "a", visible: false, required: true });
    });
    it("批量 prop 更新", () => {
      const items = baseItems();
      updateItems(items, ["a", "b"], { span: 12 });
      expect(items[1].span).toBe(12);
      expect(items[2].span).toBe(12);
      expect(items[3].span).toBeUndefined();
    });
    it("谓词更新命中的字段项", () => {
      const items = baseItems();
      const touched = updateItems(
        items,
        (it) => ["a", "c"].includes(it.prop),
        { tip: "x" },
      );
      expect(touched.map((i) => i.prop)).toEqual(["a", "c"]);
    });
    it("点路径深设：只改嵌套叶子，不破坏兄弟字段（禁用联动）", () => {
      const items = [
        field("a", {
          itemRender: { name: "ElInput", props: { placeholder: "p", clearable: true } },
        }),
      ];
      updateItems(items, "a", { "itemRender.props.disabled": true });
      expect(items[0].itemRender.props).toEqual({
        placeholder: "p",
        clearable: true,
        disabled: true,
      });
      expect(items[0].itemRender.name).toBe("ElInput");
    });
    it("批量 + 点路径：一次禁用多个控件，各自兄弟 props 不破坏", () => {
      const items = [
        field("a", { itemRender: { name: "ElInput", props: { placeholder: "pa" } } }),
        field("b", { itemRender: { name: "ElInput", props: { placeholder: "pb" } } }),
        field("c", { itemRender: { name: "ElInput", props: { placeholder: "pc" } } }),
      ];
      const touched = updateItems(items, ["a", "c"], {
        "itemRender.props.disabled": true,
      });
      expect(touched.map((i) => i.prop)).toEqual(["a", "c"]);
      expect(items[0].itemRender.props).toEqual({ placeholder: "pa", disabled: true });
      expect(items[1].itemRender.props).toEqual({ placeholder: "pb" });
      expect(items[2].itemRender.props).toEqual({ placeholder: "pc", disabled: true });
    });
    it("批量隐藏：多项 visible:false 经可见性解析全部排除，恢复后重新可见", () => {
      const items = baseItems(); // [分组头, a, b, c, 插入项]
      // 走真实渲染链路：先分组切分，再逐块解析可见项
      const fieldProps = () =>
        splitIntoGroups(items)
          .flatMap((b) => resolveVisibleEntries(b.items, { formSpan: 24 }))
          .filter((e) => e.kind === "field")
          .map((e) => e.item.prop);
      updateItems(items, ["a", "c"], { visible: false });
      const hiddenProps = collectHiddenValueOverrides(items, {}, "");
      expect([...hiddenProps.keys()].sort()).toEqual(["a", "c"]);
      expect(fieldProps()).toEqual(["b"]);
      updateItems(items, ["a", "c"], { visible: true });
      expect(fieldProps()).toEqual(["a", "b", "c"]);
    });
    it("点路径整体替换 options 数组（异步联动），不按索引合并", () => {
      const items = [
        field("city", { itemRender: { name: "ElSelect", options: [{ label: "旧", value: 1 }] } }),
      ];
      const next = [{ label: "新A", value: "a" }, { label: "新B", value: "b" }];
      updateItems(items, "city", { "itemRender.options": next });
      expect(items[0].itemRender.options).toEqual(next);
    });
    it("函数补丁：按每项动态生成", () => {
      const items = baseItems();
      updateItems(items, (it) => it.prop === "a", (it) => ({
        label: `${it.prop}-改`,
      }));
      expect(items[1].label).toBe("a-改");
      expect(items[2].label).toBe("b");
    });
    it("非法入参安全兜底", () => {
      const items = baseItems();
      expect(updateItems(null, "a", { x: 1 })).toEqual([]);
      expect(updateItems(items, "a", null)).toEqual([]);
      expect(updateItems(items, null, { x: 1 })).toEqual([]);
      expect(items[1].label).toBe("a");
    });
  });

  // ===================== 紧凑模式（compact）：可视行划分 =====================
  describe("resolveVisualRowIndexes（可视行划分）", () => {
    it("按累计 span ≤ 24 划分行：累计满行后另起新行", () => {
      const entries = [{ span: 8 }, { span: 8 }, { span: 8 }, { span: 8 }];
      expect(resolveVisualRowIndexes(entries)).toEqual([0, 0, 0, 1]);
    });
    it("行尾恰好占满 24：下一项换新行（与 el-row 换行规则一致）", () => {
      const entries = [{ span: 12 }, { span: 12 }, { span: 12 }];
      expect(resolveVisualRowIndexes(entries)).toEqual([0, 0, 1]);
    });
    it("span=24 的整行项独占一行", () => {
      const entries = [{ span: 24 }, { span: 24 }];
      expect(resolveVisualRowIndexes(entries)).toEqual([0, 1]);
    });
    it("跨多行连续划分（行号单调递增）", () => {
      const entries = [
        { span: 8 },
        { span: 8 },
        { span: 8 },
        { span: 8 },
        { span: 8 },
        { span: 8 },
        { span: 8 },
      ];
      expect(resolveVisualRowIndexes(entries)).toEqual([0, 0, 0, 1, 1, 1, 2]);
    });
    it("span 非法（0 / undefined）：按整行 24 兜底", () => {
      expect(resolveVisualRowIndexes([{ span: 0 }, { span: 12 }])).toEqual([0, 1]);
      expect(resolveVisualRowIndexes([{}, {}])).toEqual([0, 1]);
    });
    it("空条目：返回空数组；自定义栅格数生效", () => {
      expect(resolveVisualRowIndexes([])).toEqual([]);
      expect(
        resolveVisualRowIndexes([{ span: 3 }, { span: 3 }, { span: 3 }, { span: 3 }], 9),
      ).toEqual([0, 0, 0, 1]);
    });
  });

  describe("collectTipRows（含 tip 可视行集合）", () => {
    const rows = (entries) => resolveVisualRowIndexes(entries);
    it("收集配置了非空 tip 的字段项所在行", () => {
      const entries = [
        { kind: "field", item: { tip: "提示" }, span: 8 },
        { kind: "field", item: {}, span: 8 },
        { kind: "field", item: { tip: "" }, span: 8 },
      ];
      expect(collectTipRows(entries, rows(entries))).toEqual(new Set([0]));
    });
    it("空串 / null / undefined tip 等同未配置", () => {
      const entries = [
        { kind: "field", item: { tip: "" }, span: 12 },
        { kind: "field", item: { tip: null }, span: 12 },
        { kind: "field", item: {}, span: 12 },
      ];
      expect(collectTipRows(entries, rows(entries)).size).toBe(0);
    });
    it("插入项 / 折叠节点等非 field 条目不计入", () => {
      const entries = [
        { kind: "insert", item: { tip: "非字段项" }, span: 24 },
        { kind: "field", item: { tip: "提示" }, span: 12 },
        { kind: "field", item: {}, span: 12 },
      ];
      expect(collectTipRows(entries, rows(entries))).toEqual(new Set([1]));
    });
    it("不同行的 tip 分别收集；同行多项 tip 去重", () => {
      const entries = [
        { kind: "field", item: { tip: "A" }, span: 8 },
        { kind: "field", item: { tip: "B" }, span: 8 },
        { kind: "field", item: {}, span: 8 },
        { kind: "field", item: { tip: "C" }, span: 24 },
      ];
      expect(collectTipRows(entries, rows(entries))).toEqual(new Set([0, 1]));
    });
    it("entries 与 rowIndexes 等长对齐（含空数组安全）", () => {
      expect(collectTipRows([], [])).toEqual(new Set());
      const entries = [{ kind: "field", item: { tip: "x" }, span: 24 }];
      expect(collectTipRows(entries, [0])).toEqual(new Set([0]));
    });
  });

  describe("objectToFormData", () => {
    it("标量 / 嵌套对象 / 数组（默认重复同名键）", () => {
      const fd = objectToFormData({
        name: "张三",
        age: 18,
        active: true,
        birthday: new Date("2020-01-02T03:04:05.000Z"),
        empty: null,
        missing: undefined,
        user: { address: { city: "北京" }, tags: ["a", "b"] },
      });
      expect(fd.get("name")).toBe("张三");
      expect(fd.get("age")).toBe("18");
      expect(fd.get("active")).toBe("true");
      expect(fd.get("birthday")).toBe("2020-01-02T03:04:05.000Z");
      // null / undefined 视为不传该字段
      expect(fd.has("empty")).toBe(false);
      expect(fd.has("missing")).toBe(false);
      expect(fd.get("user[address][city]")).toBe("北京");
      expect(fd.getAll("user[tags]")).toEqual(["a", "b"]);
    });

    it("文件始终以二进制 append：保留 File 实例、文件名 / 类型 / 字节", () => {
      const avatar = new File([new Uint8Array([1, 2, 3])], "avatar.png", {
        type: "image/png",
      });
      const docA = new File(["a"], "a.txt", { type: "text/plain" });
      const docB = new File(["b"], "b.txt", { type: "text/plain" });
      const fd = objectToFormData({ avatar, docs: [docA, docB] });

      const got = fd.get("avatar");
      expect(got).toBeInstanceOf(File);
      expect(got).toBe(avatar);
      expect(got.name).toBe("avatar.png");
      expect(got.type).toBe("image/png");
      expect(got.size).toBe(3);
      // 数组内文件：同名重复键
      expect(fd.getAll("docs").map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
    });

    it("UploadPro 绑定值里的 { raw: File } 取 raw 二进制，而非字符串化对象", () => {
      const raw = new File(["hello"], "pending.png", { type: "image/png" });
      const fd = objectToFormData({
        attachments: [
          { name: "pending.png", url: "", status: "ready", raw },
          { name: "done.pdf", url: "https://example.com/done.pdf", id: 9 },
        ],
      });
      const files = fd.getAll("attachments");
      // 第一项 raw 二进制
      expect(files[0]).toBeInstanceOf(File);
      expect(files[0]).toBe(raw);
      expect(files[0].name).toBe("pending.png");
      // 无 raw 的已上传项不会丢元数据：按下标展开
      expect(fd.get("attachments[1][name]")).toBe("done.pdf");
      expect(fd.get("attachments[1][url]")).toBe(
        "https://example.com/done.pdf",
      );
      expect(fd.get("attachments[1][id]")).toBe("9");
      // 不会把文件项整体字符串化
      expect(fd.has("attachments[0][name]")).toBe(false);
    });

    it("arrayFormat='bracket'：标量 / 文件数组使用 key[]", () => {
      const file = new File(["x"], "x.txt", { type: "text/plain" });
      const fd = objectToFormData(
        { tags: ["a", "b"], files: [file] },
        { arrayFormat: "bracket" },
      );
      expect(fd.getAll("tags[]")).toEqual(["a", "b"]);
      expect(fd.has("tags")).toBe(false);
      const files = fd.getAll("files[]");
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("x.txt");
      expect(fd.has("files")).toBe(false);
    });

    it("对象数组按下标展开；空数组 / 非对象入参不产生键", () => {
      const fd = objectToFormData({
        items: [{ name: "a" }, { name: "b" }],
        empty: [],
      });
      expect(fd.get("items[0][name]")).toBe("a");
      expect(fd.get("items[1][name]")).toBe("b");
      expect(Array.from(fd.keys())).toEqual(["items[0][name]", "items[1][name]"]);
      expect(objectToFormData(null).keys().next().done).toBe(true);
      expect(objectToFormData("str").keys().next().done).toBe(true);
    });
  });
});
