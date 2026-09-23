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
  collectHiddenValueProps,
  resolveSpan,
  splitIntoGroups,
  resolveVisibleEntries,
  collectFieldProps,
  deriveDefaultValue,
  buildInitialData,
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

  describe("隐藏字段值移除（isHiddenByVisibility / collectHiddenValueProps）", () => {
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

    it("collectHiddenValueProps：表单级开关关闭时不移除任何值", () => {
      const items = [
        { prop: "a", visible: false },
        { prop: "b", visibleMethod: () => false },
      ];
      expect(collectHiddenValueProps(items, {}, false).size).toBe(0);
    });

    it("collectHiddenValueProps：开关开启时收集 visible/visibleMethod 隐藏字段", () => {
      const items = [
        { prop: "a", visible: false },
        { prop: "b", visibleMethod: (d) => d.show === true }, // show=false → 返回 false → 隐藏
        { prop: "c" }, // 可见
      ];
      const set = collectHiddenValueProps(items, { show: false }, true);
      expect([...set].sort()).toEqual(["a", "b"]);
    });

    it("collectHiddenValueProps：item.removeValueOnHidden 可单独覆盖表单级开关", () => {
      const items = [
        { prop: "a", visible: false, removeValueOnHidden: false }, // 表单级开，但显式保留
        { prop: "b", visible: false }, // 跟随表单级
        { prop: "c", visible: false, removeValueOnHidden: true }, // 表单级关，但显式移除
      ];
      const on = collectHiddenValueProps(items, {}, true);
      expect([...on].sort()).toEqual(["b", "c"]); // a 被 item 级保留，b/c 移除
      const off = collectHiddenValueProps(items, {}, false);
      expect([...off].sort()).toEqual(["c"]); // 仅 c 被 item 级强制移除
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
});
