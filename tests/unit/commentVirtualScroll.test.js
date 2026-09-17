import { describe, it, expect } from "vitest";
import {
  buildOffsets,
  findIndexAtOffset,
  getItemHeight,
  getVisibleRange,
  isNearBottom,
} from "../../src/components/comment/utils/virtualScroll.js";

describe("getItemHeight 高度解析", () => {
  it("命中实测缓存优先，否则用估计高度", () => {
    const map = new Map([["a", 128]]);
    expect(getItemHeight("a", map, 220)).toBe(128);
    expect(getItemHeight("b", map, 220)).toBe(220);
  });

  it("非法实测值被忽略", () => {
    const map = new Map([["a", 0]]);
    expect(getItemHeight("a", map, 220)).toBe(220);
  });
});

describe("buildOffsets 前缀和", () => {
  it("无缓存时按估计高度线性递增", () => {
    expect(buildOffsets(["a", "b", "c"], new Map(), 200)).toEqual([
      0, 200, 400, 600,
    ]);
  });

  it("实测/估计混合时前缀和正确", () => {
    const map = new Map([["b", 100]]);
    expect(buildOffsets(["a", "b", "c"], map, 200)).toEqual([0, 200, 300, 500]);
  });

  it("空列表总高度为 0", () => {
    expect(buildOffsets([], new Map(), 200)).toEqual([0]);
  });
});

describe("findIndexAtOffset 二分定位", () => {
  // 4 项，高 200：offsets = [0,200,400,600,800]
  const offsets = [0, 200, 400, 600, 800];

  it("边界：顶部 / 末尾 / 超出", () => {
    expect(findIndexAtOffset(offsets, 0)).toBe(0);
    expect(findIndexAtOffset(offsets, -10)).toBe(0);
    expect(findIndexAtOffset(offsets, 800)).toBe(3);
    expect(findIndexAtOffset(offsets, 9999)).toBe(3);
  });

  it("定位 y 所在项（含跨边界值）", () => {
    expect(findIndexAtOffset(offsets, 199)).toBe(0);
    expect(findIndexAtOffset(offsets, 200)).toBe(1);
    expect(findIndexAtOffset(offsets, 500)).toBe(2);
    expect(findIndexAtOffset(offsets, 799)).toBe(3);
  });

  it("空数组返回 0", () => {
    expect(findIndexAtOffset([0], 10)).toBe(0);
  });
});

describe("getVisibleRange 可见窗口", () => {
  const offsets = [0, 200, 400, 600, 800, 1000, 1200];

  it("空列表", () => {
    expect(getVisibleRange([0], 0, 600)).toEqual({ start: 0, end: 0 });
  });

  it("容器未测量（viewportHeight=0）时全量渲染兜底", () => {
    expect(getVisibleRange(offsets, 300, 0)).toEqual({ start: 0, end: 6 });
  });

  it("顶部窗口：覆盖前若干项 + overscan", () => {
    // scrollTop=0，viewport=500 → 逻辑 end=findIndex(500)+2=4，+overscan=7→6
    expect(getVisibleRange(offsets, 0, 500, 3)).toEqual({ start: 0, end: 6 });
  });

  it("中间窗口：start/end 均扩展 overscan", () => {
    // scrollTop=400 → startIndex=2，start=0
    // bottom=900 → findIndex=4，endIndex=6，+3=9→6
    expect(getVisibleRange(offsets, 400, 500, 3)).toEqual({ start: 0, end: 6 });
  });

  it("靠后窗口：start 扣减 overscan 但不越界为负", () => {
    const many = Array.from({ length: 21 }, (_, i) => i * 200);
    // scrollTop=3000 → startIndex=15，start=12
    // bottom=3600 → findIndex=18，endIndex=20，+3=23→20
    expect(getVisibleRange(many, 3000, 600, 3)).toEqual({ start: 12, end: 20 });
  });
});

describe("isNearBottom 触底判断", () => {
  const offsets = [0, 200, 400, 600, 800];

  it("距底阈值内为 true", () => {
    // scrollTop=150 → 150+600=750 >= 800-80=720
    expect(isNearBottom(offsets, 150, 600, 80)).toBe(true);
  });

  it("远离底部为 false", () => {
    expect(isNearBottom(offsets, 0, 600, 80)).toBe(false);
  });

  it("真正贴底为 true", () => {
    expect(isNearBottom(offsets, 200, 600, 80)).toBe(true);
  });
});
