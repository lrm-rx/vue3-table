// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  GRID_COLS,
  isGroupItem,
  isInsertItem,
  isFieldItem,
  isItemRequired,
  isItemVisible,
  resolveSpan,
  splitIntoGroups,
  resolveVisibleEntries,
} from "../../src/components/formPro/utils.js";

describe("formPro utils", () => {
  describe("类型判定", () => {
    it("isGroupItem / isFieldItem / isInsertItem 互斥且正确", () => {
      const g = { group: true, title: "A" };
      const f = { field: "name", label: "名称" };
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
      expect(isItemRequired({ field: "a", required: true })).toBe(true);
    });
    it("rules 含 required:true 即必填（item.rules 与 formRules 合并）", () => {
      expect(
        isItemRequired({ field: "a", rules: [{ required: true }] }),
      ).toBe(true);
      expect(isItemRequired({ field: "a" }, { a: [{ required: true }] })).toBe(
        true,
      );
    });
    it("非必填返回 false", () => {
      expect(isItemRequired({ field: "a" })).toBe(false);
      expect(
        isItemRequired({ field: "a", rules: [{ required: false }] }),
      ).toBe(false);
    });
  });

  describe("isItemVisible", () => {
    const formRules = { a: [{ required: true }] };
    it("visible:false 隐藏", () => {
      expect(isItemVisible({ field: "a", visible: false })).toBe(false);
    });
    it("visibleMethod(data) 返回 false 隐藏", () => {
      expect(
        isItemVisible(
          { field: "a", visibleMethod: (d) => !!d.flag },
          { data: { flag: false } },
        ),
      ).toBe(false);
      expect(
        isItemVisible(
          { field: "a", visibleMethod: (d) => !!d.flag },
          { data: { flag: true } },
        ),
      ).toBe(true);
    });
    it("onlyRequired 过滤掉非必填字段项", () => {
      expect(
        isItemVisible({ field: "b" }, { onlyRequired: true, formRules }),
      ).toBe(false);
      expect(
        isItemVisible({ field: "a" }, { onlyRequired: true, formRules }),
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
      const items = [{ field: "a" }, { field: "b" }];
      const blocks = splitIntoGroups(items);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].group).toBeNull();
      expect(blocks[0].items).toHaveLength(2);
    });
    it("分组头切分多组，组前项归入匿名组", () => {
      const items = [
        { field: "pre" },
        { group: true, title: "G1" },
        { field: "a" },
        { group: true, title: "G2" },
        { field: "b" },
      ];
      const blocks = splitIntoGroups(items);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].group).toBeNull();
      expect(blocks[0].items).toEqual([{ field: "pre" }]);
      expect(blocks[1].group.title).toBe("G1");
      expect(blocks[1].items).toEqual([{ field: "a" }]);
      expect(blocks[2].group.title).toBe("G2");
      expect(blocks[2].items).toEqual([{ field: "b" }]);
    });
    it("丢弃空匿名组（首项就是分组头）", () => {
      const items = [{ group: true, title: "G" }, { field: "a" }];
      const blocks = splitIntoGroups(items);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].group.title).toBe("G");
    });
  });

  describe("resolveVisibleEntries（可见项解析 + 回流）", () => {
    it("隐藏项被排除，后续项保留并前移（输出有序）", () => {
      const items = [
        { field: "a", span: 8 },
        { field: "b", span: 8, visible: false },
        { field: "c", span: 8, visibleMethod: () => false },
        { field: "d", span: 8 },
      ];
      const entries = resolveVisibleEntries(items, { formSpan: 24 });
      expect(entries.map((e) => e.item.field)).toEqual(["a", "d"]);
      expect(entries.every((e) => e.kind === "field")).toBe(true);
    });
    it("onlyRequired 只保留必填项，插入项始终保留", () => {
      const items = [
        { field: "a", required: true, span: 12 },
        { field: "b", span: 12 },
        { slot: "divider" },
      ];
      const entries = resolveVisibleEntries(items, {
        onlyRequired: true,
        formSpan: 24,
      });
      expect(entries).toHaveLength(2);
      expect(entries[0].kind).toBe("field");
      expect(entries[0].item.field).toBe("a");
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
        [{ field: "a", required: true }, { field: "b" }],
        { formSpan: 24 },
      );
      expect(entries[0].required).toBe(true);
      expect(entries[1].required).toBe(false);
    });
  });
});
