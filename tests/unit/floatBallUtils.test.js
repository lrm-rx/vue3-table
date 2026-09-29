import { describe, it, expect } from "vitest";
import {
  computeItemPosition,
  computeSlicePath,
  computeSliceMidpoint,
  clampPosition,
  resolveSnap,
  resolveInitialPosition,
} from "../../src/components/floatBall/utils.js";

describe("floatBall utils", () => {
  describe("computeItemPosition（环形均分）", () => {
    it("n=4 时按钮落在正上/右/下/左（默认起始角 -90°）", () => {
      const r = 100;
      const p0 = computeItemPosition(0, 4, r);
      const p1 = computeItemPosition(1, 4, r);
      const p2 = computeItemPosition(2, 4, r);
      const p3 = computeItemPosition(3, 4, r);
      // 正上方
      expect(p0.dx).toBeCloseTo(0, 6);
      expect(p0.dy).toBeCloseTo(-r, 6);
      // 正右
      expect(p1.dx).toBeCloseTo(r, 6);
      expect(p1.dy).toBeCloseTo(0, 6);
      // 正下方
      expect(p2.dx).toBeCloseTo(0, 6);
      expect(p2.dy).toBeCloseTo(r, 6);
      // 正左
      expect(p3.dx).toBeCloseTo(-r, 6);
      expect(p3.dy).toBeCloseTo(0, 6);
    });

    it("n=2 时两按钮关于圆心对称（上 / 下）", () => {
      const r = 80;
      const p0 = computeItemPosition(0, 2, r);
      const p1 = computeItemPosition(1, 2, r);
      expect(p0.dx).toBeCloseTo(0, 6);
      expect(p0.dy).toBeCloseTo(-r, 6);
      expect(p1.dx).toBeCloseTo(0, 6);
      expect(p1.dy).toBeCloseTo(r, 6);
    });

    it("count 为 0 时退化为 1，不产生 NaN", () => {
      const p = computeItemPosition(0, 0, 50);
      expect(Number.isNaN(p.dx)).toBe(false);
      expect(Number.isNaN(p.dy)).toBe(false);
    });

    it("所有按钮到中心的距离恒等于 radius（整体在同一圆上）", () => {
      const r = 120;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const { dx, dy } = computeItemPosition(i, n, r);
        expect(Math.hypot(dx, dy)).toBeCloseTo(r, 6);
      }
    });
  });

  describe("clampPosition（边界钳制）", () => {
    it("正常范围内不改动", () => {
      expect(clampPosition(10, 20, 50, 50, 1000, 800)).toEqual({ x: 10, y: 20 });
    });
    it("超出左边/顶边钳制到 0", () => {
      expect(clampPosition(-100, -50, 50, 50, 1000, 800)).toEqual({ x: 0, y: 0 });
    });
    it("超出右边/底边钳制到 vw-w / vh-h", () => {
      expect(clampPosition(2000, 2000, 50, 50, 1000, 800)).toEqual({
        x: 950,
        y: 750,
      });
    });
    it("元素大于视口时钳制结果非负", () => {
      expect(clampPosition(0, 0, 2000, 2000, 1000, 800)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("resolveSnap（仅吸附左/右边缘）", () => {
    const W = 1000;
    const H = 800;
    const ball = 60;

    it("水平居中、左右等距时选 left，且 y 保持不变", () => {
      const y = 300;
      const res = resolveSnap(W / 2 - ball / 2, y, ball, ball, W, H);
      expect(res.edge).toBe("left");
      expect(res.x).toBe(0);
      expect(res.y).toBe(y);
    });

    it("靠近右边时吸附到右边，y 保持不变", () => {
      const y = 123;
      const res = resolveSnap(W - ball - 30, y, ball, ball, W, H);
      expect(res.edge).toBe("right");
      expect(res.x).toBe(W - ball);
      expect(res.y).toBe(y);
    });

    it("靠近左边时吸附到左边", () => {
      const res = resolveSnap(30, 400, ball, ball, W, H);
      expect(res.edge).toBe("left");
      expect(res.x).toBe(0);
    });

    it("即使非常靠近上/下边，也只吸附左/右（不贴上/下边）", () => {
      // 中心 x 正中偏左 → 吸附左边；y 任意都保持不变
      const res = resolveSnap(W / 2 - ball / 2 - 1, H - ball - 5, ball, ball, W, H);
      expect(res.edge).toBe("left");
      expect(res.y).toBe(H - ball - 5);
    });

    it("threshold 大于最近水平边距离时返回 null（不吸附）", () => {
      // 水平居中，到左 / 右 = 500
      const res = resolveSnap(W / 2 - ball / 2, H / 2 - ball / 2, ball, ball, W, H, {
        threshold: 100,
      });
      expect(res).toBeNull();
    });

    it("threshold=0 时总是吸附到左 / 右", () => {
      const res = resolveSnap(W / 2 - ball / 2, H / 2 - ball / 2, ball, ball, W, H, {
        threshold: 0,
      });
      expect(res).not.toBeNull();
      expect(["left", "right"]).toContain(res.edge);
    });

    it("hideHalf=true 时半隐藏（半个球在视口外）", () => {
      const res = resolveSnap(W - ball - 30, 100, ball, ball, W, H, {
        hideHalf: true,
      });
      expect(res.edge).toBe("right");
      expect(res.x).toBe(W - ball / 2);
    });
  });

  describe("resolveInitialPosition（初始位置）", () => {
    const W = 1000;
    const H = 800;
    const ball = 60;

    it("预设 bottom-right 落在右下角留白处", () => {
      const p = resolveInitialPosition("bottom-right", ball, ball, W, H, 16);
      expect(p.x).toBe(W - ball - 16);
      expect(p.y).toBe(H - ball - 16);
    });

    it("预设 right 落在右侧垂直居中", () => {
      const p = resolveInitialPosition("right", ball, ball, W, H, 16);
      expect(p.x).toBe(W - ball - 16);
      expect(p.y).toBe(Math.round((H - ball) / 2));
    });

    it("预设 left 落在左侧垂直居中", () => {
      const p = resolveInitialPosition("left", ball, ball, W, H, 16);
      expect(p.x).toBe(16);
      expect(p.y).toBe(Math.round((H - ball) / 2));
    });

    it("预设 top-left 落在左上角留白处", () => {
      const p = resolveInitialPosition("top-left", ball, ball, W, H, 20);
      expect(p).toEqual({ x: 20, y: 20 });
    });

    it("传入 {x,y} 时直接使用并钳制", () => {
      const p = resolveInitialPosition({ x: -50, y: 9999 }, ball, ball, W, H);
      expect(p.x).toBe(0);
      expect(p.y).toBe(H - ball);
    });

    it("未知字符串回退 bottom-right", () => {
      const p = resolveInitialPosition("xxx", ball, ball, W, H, 16);
      expect(p.x).toBe(W - ball - 16);
    });
  });

  describe("computeSlicePath（扇形切片 SVG path）", () => {
    const R = 100;
    const r = 40;

    it("n=4 生成 4 条独立 path，均以外/内弧构成环形扇区", () => {
      for (let i = 0; i < 4; i++) {
        const d = computeSlicePath(i, 4, R, r);
        // 每条 path 含 2 段圆弧（外弧 A + 内弧 A）与 1 条连线 L，且闭合 Z
        expect(d.startsWith("M ")).toBe(true);
        expect(d.endsWith("Z")).toBe(true);
        expect((d.match(/A /g) || []).length).toBe(2);
        expect((d.match(/L /g) || []).length).toBe(1);
      }
    });

    it("step<=180° 时 largeArc 为 0，step>180° 时为 1", () => {
      // n=2 → step=180，边界用 > 判断 → 0
      const d2 = computeSlicePath(0, 2, R, r);
      expect(d2).toContain("0 0 1");
      // n=1 走整圆环分支，含 4 段 A
      const d1 = computeSlicePath(0, 1, R, r);
      expect((d1.match(/A /g) || []).length).toBe(4);
    });

    it("第 0 片（默认起始角 -90°，正上方）外弧起点位于圆心正上方", () => {
      const d = computeSlicePath(0, 4, R, r, -90, R, R);
      // 首点 M 应为 (cx, cy - outerR) = (100, 0)
      expect(d.startsWith(`M ${R} ${R - R} `)).toBe(true);
    });

    it("圆心与半径参数正确反映到坐标", () => {
      const cx = 50;
      const cy = 60;
      const d = computeSlicePath(1, 4, R, r, -90, cx, cy);
      // 第 1 片 a1 = 0°（正右），外弧起点 = (cx + outerR, cy) = (150, 60)
      expect(d.startsWith(`M ${cx + R} ${cy} `)).toBe(true);
    });
  });

  describe("computeSliceMidpoint（切片径向中点）", () => {
    const R = 100;
    const r = 40;

    it("中点位于内外半径中间、角度居中", () => {
      // 第 0 片：a1=-90, a2=0, midA=-45, rMid=70
      const m = computeSliceMidpoint(0, 4, R, r, -90, R, R);
      const rad = (-45 * Math.PI) / 180;
      expect(m.x).toBeCloseTo(R + 70 * Math.cos(rad), 6);
      expect(m.y).toBeCloseTo(R + 70 * Math.sin(rad), 6);
    });

    it("中点到圆心距离恒等于 (innerR+outerR)/2", () => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const m = computeSliceMidpoint(i, n, R, r, -90, R, R);
        expect(Math.hypot(m.x - R, m.y - R)).toBeCloseTo((R + r) / 2, 6);
      }
    });
  });

});
