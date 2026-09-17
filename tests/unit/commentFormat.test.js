import { describe, it, expect } from "vitest";
import {
  assignFloors,
  createId,
  floorLabel,
  formatCount,
  formatRelativeTime,
  getNextFloor,
  sortRootComments,
} from "../../src/components/comment/utils/format.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("floorLabel 楼层文案", () => {
  it("渲染第 n 楼", () => {
    expect(floorLabel(1)).toBe("第1楼");
    expect(floorLabel(88)).toBe("第88楼");
  });
});

describe("formatCount 计数格式化", () => {
  it("万以下原样输出", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(9999)).toBe("9999");
  });

  it("万以上折叠为 x.x 万并去除 .0", () => {
    expect(formatCount(10000)).toBe("1万");
    expect(formatCount(15000)).toBe("1.5万");
    expect(formatCount(128000)).toBe("12.8万");
    expect(formatCount(1000000)).toBe("100万");
  });
});

describe("formatRelativeTime 相对时间", () => {
  it("未来/1 分钟内为刚刚", () => {
    expect(formatRelativeTime(Date.now())).toBe("刚刚");
    expect(formatRelativeTime(Date.now() + HOUR)).toBe("刚刚");
    expect(formatRelativeTime(Date.now() - 30 * MINUTE)).toBe("30分钟前");
    expect(formatRelativeTime(Date.now() - 5 * HOUR)).toBe("5小时前");
    expect(formatRelativeTime(Date.now() - 3 * DAY)).toBe("3天前");
  });

  it("更早的时间返回日期格式", () => {
    const result = formatRelativeTime(Date.now() - 30 * DAY);
    expect(result).toMatch(/^\d{2}-\d{2}$|^\d{4}-\d{2}-\d{2}$/);
  });

  it("非法/空值安全兜底", () => {
    expect(formatRelativeTime(null)).toBe("");
    expect(formatRelativeTime("not-a-date")).toBe("");
  });
});

describe("assignFloors 楼层补排", () => {
  const root = (id, createTime, floor) => ({ id, createTime, floor });

  it("已有楼层保持不变", () => {
    const list = [root("a", 2000, 5), root("b", 1000, 2)];
    const result = assignFloors(list);
    expect(result.find((c) => c.id === "a").floor).toBe(5);
    expect(result.find((c) => c.id === "b").floor).toBe(2);
  });

  it("缺失楼层按发帖时间升序，从最大楼层 +1 开始补号", () => {
    const list = [
      root("a", 1000, 3),
      root("b", 3000, undefined),
      root("c", 2000, undefined),
    ];
    const result = assignFloors(list);
    expect(result.find((c) => c.id === "c").floor).toBe(4);
    expect(result.find((c) => c.id === "b").floor).toBe(5);
  });

  it("全部缺失时从 1 楼开始", () => {
    const list = [root("a", 3000), root("b", 1000), root("c", 2000)];
    const result = assignFloors(list);
    expect(result.find((c) => c.id === "b").floor).toBe(1);
    expect(result.find((c) => c.id === "c").floor).toBe(2);
    expect(result.find((c) => c.id === "a").floor).toBe(3);
  });

  it("非数组安全兜底为空数组", () => {
    expect(assignFloors(null)).toEqual([]);
  });
});

describe("getNextFloor 楼层取号", () => {
  it("返回当前最大楼层 + 1，空列表为 1", () => {
    expect(getNextFloor([{ floor: 3 }, { floor: 12 }])).toBe(13);
    expect(getNextFloor([])).toBe(1);
  });
});

describe("sortRootComments 排序", () => {
  const c = (id, createTime, likeCount) => ({ id, createTime, likeCount });

  it("最新：严格按时间倒序", () => {
    const list = [c("a", 1000, 0), c("b", 3000, 0), c("d", 2000, 0)];
    expect(sortRootComments(list, "latest").map((x) => x.id)).toEqual(["b", "d", "a"]);
  });

  it("最热：点赞降序，点赞相同按时间倒序", () => {
    const list = [c("a", 1000, 5), c("b", 3000, 9), c("d", 2000, 9)];
    expect(sortRootComments(list, "hot").map((x) => x.id)).toEqual(["b", "d", "a"]);
  });

  it("楼层：按 floor 升序，楼层相同按时间升序（不受点赞影响）", () => {
    const list = [
      { id: "a", createTime: 1000, likeCount: 9, floor: 3 },
      { id: "b", createTime: 3000, likeCount: 0, floor: 1 },
      { id: "d", createTime: 2000, likeCount: 5, floor: 2 },
      { id: "e", createTime: 500, likeCount: 0, floor: 2 },
    ];
    expect(sortRootComments(list, "floor").map((x) => x.id)).toEqual([
      "b",
      "e",
      "d",
      "a",
    ]);
  });

  it("返回新数组，不修改原数组", () => {
    const list = [c("a", 1000, 1), c("b", 2000, 2)];
    expect(sortRootComments(list, "hot")).not.toBe(list);
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("createId", () => {
  it("生成的 id 带前缀且唯一", () => {
    const a = createId("root");
    const b = createId("root");
    expect(a.startsWith("root_")).toBe(true);
    expect(a).not.toBe(b);
  });
});
