/**
 * 评论区内置演示数据
 * 业务侧不传 comments 时使用；对接后端时请按 README 中的数据模型提供。
 * 回复数据扁平存放在 replies 中，replyTo 表达「回复了谁」，不嵌套 children。
 */

const now = Date.now();
const minutesAgo = (n) => now - n * MINUTE_UNIT;
const hoursAgo = (n) => now - n * HOUR_UNIT;
const daysAgo = (n) => now - n * DAY_UNIT;

const MINUTE_UNIT = 60 * 1000;
const HOUR_UNIT = 60 * MINUTE_UNIT;
const DAY_UNIT = 24 * HOUR_UNIT;

// 演示用当前登录用户（role: 'admin' → 管理员，可删除任意评论/回复）
export const mockCurrentUser = { id: "me", name: "我", avatar: "", role: "admin" };

const user = (id, name) => ({ id, name, avatar: "" });

// floor 8「求 BGM」：24 条回复，用于演示 2 条预览 + 查看全部回复
const bgmNames = ["夜航星", "一只猫", "键盘侠本侠", "摸鱼大师", "追番的鱼", "橙汁加冰", "路过的假面骑士"];
const bgmReplies = Array.from({ length: 24 }, (_, i) => {
  const author = user(`bgm_u_${i + 1}`, bgmNames[i % bgmNames.length]);
  const first = { id: "bgm_u_1", name: "夜航星" };
  return {
    id: `bgm_r_${i + 1}`,
    author,
    content:
      i === 0
        ? "同求 BGM！这旋律太上头了"
        : i % 3 === 0
          ? "我记得片尾有写，是原创音乐"
          : "+1，等一个好心人",
    createTime: hoursAgo(8 + i),
    likeCount: ((i * 7) % 31) + 1,
    liked: false,
    replyTo: i >= 2 ? first : null,
  };
});

const buildMockComments = () => [
  {
    id: "root_1",
    floor: 1,
    author: user("u_001", "前排突击队"),
    content: "前排！沙发！",
    createTime: daysAgo(3) - minutesAgo(42),
    likeCount: 231,
    liked: false,
    replies: [
      {
        id: "r_1_1",
        author: user("u_002", "手速达人"),
        content: "手速可以啊，这都能抢到",
        createTime: daysAgo(3) - minutesAgo(30),
        likeCount: 18,
        liked: false,
        replyTo: { id: "u_001", name: "前排突击队" },
      },
      {
        id: "r_1_2",
        author: user("u_001", "前排突击队"),
        content: "哈哈哈哈定好闹钟来的",
        createTime: daysAgo(3) - minutesAgo(20),
        likeCount: 9,
        liked: false,
        replyTo: { id: "u_002", name: "手速达人" },
      },
      {
        id: "r_1_3",
        author: user("u_003", "围观群众"),
        content: "晚来一步，沙发没了",
        createTime: daysAgo(3) - minutesAgo(10),
        likeCount: 4,
        liked: false,
        replyTo: null,
      },
    ],
  },
  {
    id: "root_2",
    floor: 2,
    author: user("u_004", "催更小能手"),
    content: "催更催更！下一期什么时候出呀",
    createTime: daysAgo(3) - minutesAgo(20),
    likeCount: 88,
    liked: false,
    replies: [],
  },
  {
    id: "root_3",
    floor: 3,
    author: user("u_up", "干货UP主"),
    content: "感谢大家支持，下期正在剪了，预计本周末更新～",
    createTime: daysAgo(2),
    likeCount: 567,
    liked: false,
    isUp: true,
    replies: [
      {
        id: "r_3_1",
        author: user("u_005", "三连机器"),
        content: "UP 主更新辛苦了！已经三连",
        createTime: daysAgo(2) + 2 * HOUR_UNIT,
        likeCount: 52,
        liked: false,
        replyTo: null,
      },
      {
        id: "r_3_2",
        author: user("u_up", "干货UP主"),
        content: "谢谢支持～",
        createTime: daysAgo(2) + HOUR_UNIT,
        likeCount: 30,
        liked: false,
        isUp: true,
        replyTo: { id: "u_005", name: "三连机器" },
      },
    ],
  },
  {
    id: "root_4",
    floor: 4,
    author: user("u_006", "学习使我快乐"),
    content: "讲得太好了，全程无废话，三连支持！",
    createTime: daysAgo(2) + 30 * MINUTE_UNIT,
    likeCount: 342,
    liked: true,
    replies: [],
  },
  {
    id: "root_5",
    floor: 5,
    author: user("u_007", "记笔记的小本子"),
    content: "笔记已经记好了，跟着实操一遍",
    createTime: daysAgo(2) + 3 * HOUR_UNIT,
    likeCount: 45,
    liked: false,
    replies: [],
  },
  {
    id: "root_6",
    floor: 6,
    author: user("u_008", "回放战士"),
    content: "00:42 这里我看了三遍才看懂，懂了之后直呼精妙",
    createTime: daysAgo(1),
    likeCount: 12,
    liked: false,
    replies: [
      {
        id: "r_6_1",
        author: user("u_009", "弹幕护体"),
        content: "同卡在这里，看完评论区突然悟了",
        createTime: hoursAgo(20),
        likeCount: 6,
        liked: false,
        replyTo: { id: "u_008", name: "回放战士" },
      },
    ],
  },
  {
    id: "root_7",
    floor: 7,
    author: user("u_010", "新人冒泡"),
    content: "新人报道，刚关注，从头补视频中",
    createTime: daysAgo(1) + 40 * MINUTE_UNIT,
    likeCount: 3,
    liked: false,
    replies: [],
  },
  {
    id: "root_8",
    floor: 8,
    author: user("u_011", "音乐雷达"),
    content: "请问这期的 BGM 是什么？求歌名！",
    createTime: hoursAgo(18),
    likeCount: 8,
    liked: false,
    replies: bgmReplies,
  },
  {
    id: "root_9",
    floor: 9,
    author: user("u_012", "缘分一道桥"),
    content: "刚刷到就更新了，这就是缘分吗",
    createTime: hoursAgo(12),
    likeCount: 17,
    liked: false,
    replies: [],
  },
  {
    id: "root_10",
    floor: 10,
    author: user("u_013", "收藏就是学会"),
    content: "收藏夹吃灰去吧（狗头）",
    createTime: hoursAgo(6),
    likeCount: 6,
    liked: false,
    replies: [],
  },
  {
    id: "root_11",
    floor: 11,
    author: user("u_014", "周末再学"),
    content: "码住，周末慢慢看",
    createTime: hoursAgo(3),
    likeCount: 2,
    liked: false,
    replies: [],
  },
  {
    id: "root_12",
    floor: 12,
    author: user("u_015", "画质党"),
    content: "画质好评，肉眼可见的用心",
    createTime: minutesAgo(28),
    likeCount: 0,
    liked: false,
    replies: [],
  },
];

export default buildMockComments;
