import Mock from 'mockjs'

const Random = Mock.Random

// ============================================================
// 仿 bilibili 评论区 Mock 数据（用于实测 CommentSection / 虚拟滚动）
// 数据模型与 src/components/comment/README.md 约定一致：
//   一级评论 { id, floor, author, content, createTime(ms), likeCount, liked, isUp?, replies:[] }
//   回复（扁平）{ id, author, content, createTime, likeCount, liked, isUp?, replyTo }
// 楼层按发帖时间升序固定编号 1..N（删除不重排），用于验证 hot 排序后序号列仍显示固定楼层。
// ============================================================

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const now = Date.now()

// UP 主与「我」（与 CommentDemo 演示 currentUser 对齐：id=me 的评论展示删除入口）
const UP_USER = { id: 'up_main', name: '干货UP主', avatar: '', isUp: true }
const ME_USER = { id: 'me', name: '我', avatar: '' }

// —— 用户池：全量评论/回复复用，重名时追加序号 ——
const buildUserPool = (size = 160) => {
  const pool = []
  const usedNames = new Set()
  for (let i = 0; i < size; i++) {
    let name = Random.cname()
    if (usedNames.has(name)) name = `${name}${i}`
    usedNames.add(name)
    pool.push({
      id: `mu_${i + 1}`,
      name,
      // 约 1/4 用户带远程头像（加载失败时由 BaseAvatar 兜底为昵称首字色块）
      avatar:
        Random.integer(1, 100) <= 25
          ? Random.image('80x80', Random.color(), '#ffffff', 'png', name.slice(0, 1))
          : '',
    })
  }
  return pool
}

const userPool = buildUserPool()

// —— 文案池：刻意拉开长短差异，压测虚拟滚动的「动态高度」测量 ——
const shortContents = [
  '前排！沙发！',
  '哈哈哈哈哈哈',
  '笑死',
  '码住，周末看',
  '三连了不谢',
  '新人报道',
  '同求 BGM',
  'UP 主辛苦了',
  '这也太强了',
  '学到了学到了',
  '收藏等于学会（狗头）',
  '刚刷到就更新了',
  '催更催更！',
  '画质好评',
  '来了来了',
  '？？？',
  '第一',
  '泪目',
  '已三连',
  '马住',
]

const normalContents = [
  '讲得太好了，全程无废话，三连支持！',
  '00:42 这里我看了三遍才看懂，懂了之后直呼精妙',
  '笔记已经记好了，跟着实操一遍',
  '请问这期的 BGM 是什么？求歌名！',
  '同卡在这里，看完评论区突然悟了',
  '新人刚关注，从头补视频中，UP 主更新频率可以啊',
  '这个思路比我之前的写法简洁太多了，感谢分享',
  '实测有效，之前踩了两天的坑终于填上了',
  '建议出一期进阶版，讲讲边界情况怎么处理',
  '弹幕里说的那个方法也可行，可以对比一下',
  '收藏夹 +1，等项目用到再回来翻',
  '我觉得这里还能再优化一下，不过已经很强了',
  '看到最后才发现前面全是伏笔，二刷预定',
  '求一份示例代码，跟着敲了一遍总觉得哪里不对',
  '办公室摸鱼看完的，假装在写文档（不是）',
]

const longContents = [
  '认认真真看到最后，干货密度真的高。前面铺垫的概念一开始没太理解，看到第三个示例突然就串起来了，UP 主这种循序渐进的讲法对新手太友好了。已经三连，期待同系列下一期！',
  '补充一个我自己踩过的坑：如果数据量特别大，一定要先确认每一项的 key 是否稳定，不然排序之后高度缓存会错位，现象就是快速滚动时偶尔闪一下。排查了半天才发现是我自己把 index 当成 key 用了，记录一下，希望能帮到后来人。',
  '作为从第一期追过来的老粉，明显能感觉到制作越来越用心了，脚本、演示、字幕全部在线。提两个小建议：一是片尾可以加个知识点回顾，二是长视频能不能分个 P。总之继续加油，必投币！',
  '昨天刚在项目里遇到一模一样的需求，正准备自己硬写，今天首页就刷到了，这就是大数据的力量吗（狗头）。照着方案改完之后代码少了将近一半，逻辑还更清晰了，已转发给同事一起学习。',
  '看的时候觉得「这我会了」，自己动手写的时候处处报错，老老实实回来二刷。第一次是眼会手没会，第二遍跟着敲完才算真正理解，这里面的细节比视频里看起来的多，建议大家一定动手试试。',
  '从原理到实现一气呵成，尤其喜欢这种不堆砌 API、先讲清楚为什么这么设计的风格。现在很多教程只告诉你怎么写，不告诉你为什么，时间一长根本记不住。这期值得反复看，已加入每周复习清单。',
]

const replyContents = [
  '哈哈哈哈',
  '+1',
  '同问',
  '感谢分享',
  '我觉得也是',
  '？？？',
  '来了来了',
  '回复好快',
  '赞同',
  '确实',
  '离谱但合理',
  '受教了',
  '那你是没见过更离谱的',
  '楼上说得对',
  '第一遍没看懂，第二遍悟了',
  '码住',
  '已经在项目里用上了',
  'UP 主快看这条',
  '请问有源码吗',
  'dddd',
  '好好好',
  '这么整是吧',
  '蚌埠住了',
  'cy，等一个后续',
]

const pickContent = () => {
  const roll = Random.integer(1, 100)
  if (roll <= 45) return Random.pick(shortContents)
  if (roll <= 85) return Random.pick(normalContents)
  if (roll <= 95) return Random.pick(longContents)
  // 5% 随机长句：制造更多不可预测的换行高度
  return Random.csentence(20, 90)
}

const pickLikeCount = () => {
  const roll = Random.integer(1, 100)
  if (roll > 97) return Random.integer(500, 9999)
  if (roll > 85) return Random.integer(100, 499)
  if (roll > 50) return Random.integer(10, 99)
  return Random.integer(0, 12)
}

const pickReplyCount = () => {
  const roll = Random.integer(1, 100)
  if (roll <= 55) return 0
  if (roll <= 85) return Random.integer(1, 8)
  if (roll <= 97) return Random.integer(9, 20)
  return Random.integer(21, 45)
}

const pickAuthor = () => {
  const roll = Random.integer(1, 100)
  if (roll <= 3) return UP_USER
  if (roll <= 6) return ME_USER
  return Random.pick(userPool)
}

// —— 生成某条一级评论下的扁平回复（replyTo 表达「回复了谁」，不嵌套）——
const buildReplies = (rootFloor, rootAuthor, rootTime, replyCount) => {
  const replies = []
  // 已参与讨论的人：被回复对象只能从楼主 + 已有回复者中产生
  const participants = [rootAuthor]
  const span = Math.max(HOUR, now - rootTime)
  const slot = span / (replyCount + 2)

  for (let j = 0; j < replyCount; j++) {
    const author = pickAuthor()
    const base = rootTime + ((j + 1) / (replyCount + 2)) * span
    const createTime = Math.min(now, Math.floor(base + Random.integer(0, Math.floor(slot))))

    // 从第 2 条起约 55% 是「回复某人」，其余为直接讨论
    let replyTo = null
    if (j > 0 && Random.integer(1, 100) <= 55) {
      const target = Random.pick(participants)
      if (target.id !== author.id) {
        replyTo = { id: target.id, name: target.name }
      }
    }

    replies.push({
      id: `mock_r_${rootFloor}_${j + 1}`,
      author: { ...author },
      content: Random.pick(replyContents),
      createTime,
      likeCount: Random.integer(0, 80),
      liked: Random.boolean(1, 9, true),
      replyTo,
    })
    participants.push(author)
  }
  return replies
}

// —— 生成 N 条一级评论：楼层按时间升序固定，点赞/回复数量做了权重分布 ——
const generateComments = (count = 500) => {
  const list = []
  const span = 60 * DAY
  const step = span / count

  for (let i = 0; i < count; i++) {
    const floor = i + 1
    // 单调不减的发帖时间（相邻边界允许相等，楼层仍按 index 固定）
    const createTime = Math.floor(now - span + i * step + Random.integer(0, Math.floor(step)))
    const author = pickAuthor()

    list.push({
      id: `mock_root_${floor}`,
      floor,
      author: { ...author },
      content: pickContent(),
      createTime,
      likeCount: pickLikeCount(),
      liked: Random.boolean(1, 9, true),
      replies: buildReplies(floor, author, createTime, pickReplyCount()),
    })
  }
  return list
}

// 不同 count + seed 各自缓存一份，「重新生成」通过新 seed 击穿缓存
const datasetCache = new Map()

const getDataset = (count, seed) => {
  const key = `${count}_${seed}`
  if (!datasetCache.has(key)) {
    datasetCache.set(key, generateComments(count))
  }
  return datasetCache.get(key)
}

export default [
  // 全量拉取评论（虚拟滚动在客户端承载全量数据）
  // query: count=500 数据条数；seed 变化时重新生成一批
  // 注意：vite-plugin-mock 的 response 为同步调用（返回值不会被 await），
  //       模拟延迟必须使用路由级 timeout 字段，不能返回 Promise
  {
    url: '/mock-api/comment/list',
    method: 'get',
    timeout: 200,
    response: ({ query }) => {
      const count = Math.min(Math.max(Number(query.count) || 500, 1), 10000)
      const seed = String(query.seed || 'default')
      const list = getDataset(count, seed)
      return {
        code: 200,
        message: 'success',
        data: { list, total: list.length },
      }
    },
  },
  // 分页拉取评论（远程无限滚动模式：触底后请求下一页）
  // query:
  //   pageSize=20  每页条数；pageNum=1 页码（从1开始）；seed 数据批次
  //   total        可选，自定义数据总条数（测试不足一屏 / 2-3 条等边界）
  // 默认总数 200 条（pageSize*20）；返回当前页切片 + total（用于判断是否还有更多）
  // timeout 调大至 1200ms：让底部「加载中...」状态文本肉眼可见（演示加载态）
  {
    url: '/mock-api/comment/page',
    method: 'get',
    timeout: 1200,
    response: ({ query }) => {
      const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100)
      const pageNum = Math.max(Number(query.pageNum) || 1, 1)
      const seed = String(query.seed || 'default')
      // 默认 200 条；query.total 可覆盖（1 ~ 10000），用于极小数据集测试
      let total = pageSize * 20
      if (query.total !== undefined && query.total !== '') {
        total = Math.min(Math.max(Number(query.total) || 1, 1), 10000)
      }
      const list = getDataset(total, seed)
      const start = (pageNum - 1) * pageSize
      const pageList = list.slice(start, start + pageSize)
      const hasMore = start + pageSize < total
      return {
        code: 200,
        message: 'success',
        data: { list: pageList, total, pageNum, pageSize, hasMore },
      }
    },
  },

  // —— 写操作（乐观更新的服务端模拟；POST /mock-api/comment/write）——
  // body.action: send / reply / like / delete
  // body.simulateFail=true 时返回业务错误 code:500，
  // 业务侧 catch 后调用组件 rollback(opId) 还原本地乐观态
  // timeout 600ms：让「请求在途」与回滚效果肉眼可辨（POST /mock-api/comment/write）
  {
    url: '/mock-api/comment/write',
    method: 'post',
    timeout: 600,
    response: ({ body }) => {
      const { action, simulateFail } = body || {}
      const failMessages = {
        send: '发布失败：服务端异常（模拟）',
        reply: '回复失败：服务端异常（模拟）',
        like: '点赞失败：服务端异常（模拟）',
        delete: '删除失败：服务端异常（模拟）',
      }
      if (simulateFail) {
        return {
          code: 500,
          message: failMessages[action] || '操作失败（模拟）',
        }
      }
      return {
        code: 200,
        message: 'success',
        data: { action, ok: true },
      }
    },
  },
]
