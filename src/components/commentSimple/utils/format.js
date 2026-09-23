/**
 * 评论区工具函数（简化版）
 *  - 时间/计数展示
 *  - 楼层（第 n 楼）补排与取号
 *  - 一级评论排序（最热 / 最新 / 楼层）
 * 远程模式下楼层通常由后端下发，assignFloors 仅在缺失时兜底补排。
 */
import dayjs from "dayjs";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间格式化：刚刚 / n分钟前 / n小时前 / n天前 / MM-DD / YYYY-MM-DD
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
 * 数字计数：>= 10000 展示为「x.x 万」
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

// 楼层号由后端生成并随评论数据返回，前端不补排、不取号。
// 仅在排序与渲染处对 floor 缺失做容错：缺失视为无穷大（排末尾）、不展示「第 n 楼」。
export const hasFloor = (c) =>
  Number.isFinite(Number(c?.floor)) && Number(c.floor) > 0;

/**
 * 一级评论排序（返回新数组，不改原数组）
 *  - latest 最新：createTime 倒序
 *  - floor 楼层：floor 升序，floor 缺失排末尾，相同按 createTime 升序
 *  - hot 最热（默认）：likeCount 倒序，相同点赞按 createTime 倒序
 */
export const sortRootComments = (comments, sort) =>
  [...(comments || [])].sort((a, b) => {
    if (sort === "latest") {
      return (b.createTime ?? 0) - (a.createTime ?? 0);
    }
    if (sort === "floor") {
      const af = hasFloor(a) ? Number(a.floor) : Infinity;
      const bf = hasFloor(b) ? Number(b.floor) : Infinity;
      if (af !== bf) return af - bf;
      return (a.createTime ?? 0) - (b.createTime ?? 0);
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
