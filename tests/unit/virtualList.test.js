import { describe, it, expect } from "vitest";
import {
  getVisibleRange,
  ITEM_HEIGHT,
  OVERSCAN,
  HEADER_HEIGHT,
} from "../../src/components/tablePro/filters/virtualList.js";

describe("getVisibleRange 边界", () => {
  it("total=0 返回空窗口", () => {
    expect(getVisibleRange({ total: 0, scrollTop: 0, viewportHeight: 200 })).toEqual({
      start: 0,
      end: 0,
    });
  });

  it("viewportHeight<=0（首帧未测量/jsdom）时全量渲染兜底", () => {
    expect(getVisibleRange({ total: 10000, scrollTop: 999, viewportHeight: 0 })).toEqual({
      start: 0,
      end: 10000,
    });
  });

  it("全部项放得下时全量渲染（无需虚拟）", () => {
    // 10 项 * 22px = 220px <= 300px
    expect(getVisibleRange({ total: 10, scrollTop: 0, viewportHeight: 300 })).toEqual({
      start: 0,
      end: 10,
    });
  });

  it("非法 total/负 scrollTop 被安全处理", () => {
    expect(getVisibleRange({ total: "abc", viewportHeight: 100 })).toEqual({ start: 0, end: 0 });
    const r = getVisibleRange({ total: 100, scrollTop: -50, viewportHeight: 100 });
    expect(r.start).toBe(0);
  });
});

describe("getVisibleRange 窗口计算（默认行高 22 / overscan 8）", () => {
  const total = 1000;
  const vp = 220; // 可视 10 行

  it("滚动到顶部：从 0 开始，end = 可视行数 + 2*overscan = 26", () => {
    expect(getVisibleRange({ total, scrollTop: 0, viewportHeight: vp })).toEqual({
      start: 0,
      end: 26,
    });
  });

  it("滚动到中部：start = floor(scrollTop/22) - 8，end = start + 10 + 16", () => {
    // scrollTop=220 → floor=10 → start=2, end=28
    expect(getVisibleRange({ total, scrollTop: 220, viewportHeight: vp })).toEqual({
      start: 2,
      end: 28,
    });
    // scrollTop=440 → floor=20 → start=12, end=38
    expect(getVisibleRange({ total, scrollTop: 440, viewportHeight: vp })).toEqual({
      start: 12,
      end: 38,
    });
  });

  it("滚动到末尾：end 被夹到 total", () => {
    const r = getVisibleRange({ total, scrollTop: 100000, viewportHeight: vp });
    expect(r.end).toBe(total);
    expect(r.start).toBeGreaterThan(0);
    expect(r.start).toBeLessThan(r.end);
  });

  it("自定义行高 / overscan 生效", () => {
    // 行高 40，可视 5 行，overscan 2；scrollTop=400 → floor=10 → start=8, end=8+5+4=17
    expect(
      getVisibleRange({ total: 100, scrollTop: 400, viewportHeight: 200, itemHeight: 40, overscan: 2 }),
    ).toEqual({ start: 8, end: 17 });
  });
});

describe("常量与样式契约", () => {
  it("行高 22px、overscan 8、吸顶头部 24px", () => {
    expect(ITEM_HEIGHT).toBe(22);
    expect(OVERSCAN).toBe(8);
    // HEADER_HEIGHT = 行高 22 + 2px 间距（与 SCSS 中 padding-bottom:2px 对应）
    expect(HEADER_HEIGHT).toBe(24);
  });
});
