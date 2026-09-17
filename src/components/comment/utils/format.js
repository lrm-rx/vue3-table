/**
 * 评论区工具函数
 *  - 时间/计数展示
 *  - 楼层（第 n 楼）补排与取号
 *  - 一级评论排序（最热 / 最新）
 */
import dayjs from "dayjs";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间格式化：刚刚 / n分钟前 / n小时前 / n天前 / MM-DD / YYYY-MM-DD
 * @param {number|string|Date} time 毫秒时间戳 / ISO 字符串 / Date
 */
export const formatRelativeTime = (time) => {
  if (time == null) return "";
  const ts = dayjs(time).valueOf();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 0 || diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}天前`;
  const d = dayjs(ts);
  return d.year() === dayjs().year() ? d.format("MM-DD") : d.format("YYYY-MM-DD");
};

/**
 * 数字计数：>= 10000 展示为「x.x 万」（B站风格）
 */
export const formatCount = (count) => {
  const n = Number(count) || 0;
  if (n >= 10000) {
    const wan = n / 10000;
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, "");
    return `${text}万`;
  }
  return String(n);
};

/**
 * 楼层展示文案
 */
export const floorLabel = (floor) => `第${floor}楼`;

/**
 * 为缺少 floor 的一级评论补排楼层：
 * 已带 floor 的保持不变；缺失的按 createTime 升序从「当前最大楼层 + 1」开始补号。
 * 注意：不会因删除评论而重新编号（楼层是评论的固定属性）。
 */
export const assignFloors = (comments) => {
  const list = [...(comments || [])];
  let maxFloor = list.reduce(
    (m, c) => (Number(c.floor) > m ? Number(c.floor) : m),
    0,
  );
  const missing = list.filter(
    (c) => !Number.isFinite(Number(c.floor)) || Number(c.floor) <= 0,
  );
  if (missing.length) {
    const sortedMissing = [...missing].sort(
      (a, b) => (a.createTime ?? 0) - (b.createTime ?? 0),
    );
    const floorMap = new Map();
    sortedMissing.forEach((c) => {
      maxFloor += 1;
      floorMap.set(c, maxFloor);
    });
    list.forEach((c) => {
      if (floorMap.has(c)) c.floor = floorMap.get(c);
    });
  }
  return list;
};

/**
 * 下一个楼层号：当前最大楼层 + 1（真实场景由后端发号）
 */
export const getNextFloor = (comments) =>
  (comments || []).reduce(
    (m, c) => (Number(c.floor) > m ? Number(c.floor) : m),
    0,
  ) + 1;

/**
 * 一级评论排序（返回新数组，不改原数组）
 *  - latest 最新：createTime 倒序
 *  - hot 最热：likeCount 倒序，相同点赞按 createTime 倒序
 */
export const sortRootComments = (comments, sort) =>
  [...(comments || [])].sort((a, b) => {
    if (sort === "latest") {
      return (b.createTime ?? 0) - (a.createTime ?? 0);
    }
    const likeDiff = (b.likeCount ?? 0) - (a.likeCount ?? 0);
    if (likeDiff !== 0) return likeDiff;
    return (b.createTime ?? 0) - (a.createTime ?? 0);
  });

/**
 * 生成前端临时 id（后端落库后应以服务端 id 替换）
 */
export const createId = (prefix = "c") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
