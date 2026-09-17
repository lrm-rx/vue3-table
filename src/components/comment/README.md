# Comment 评论区（仿 bilibili）

参考 bilibili Web 端评论区实现的评论组件：**顶部评论框 + 评论列表（显示「第 n 楼」）+ 楼中楼回复**。
组件只负责前端交互与本地状态，所有基础控件均基于 **Element Plus** 二次封装，业务侧可通过 props / emits 对接真实后端。

---

## 一、bilibili 评论区前端设计拆解

> 只介绍前端部分（页面结构、数据模型、交互逻辑），不涉及服务端实现。

### 1. 整体结构（从上到下）

```
┌──────────────────────────────────────────────┐
│ 评论区头部：共 n 条评论        [最热] [最新]    │  ← 总数 + 排序 Tab
├──────────────────────────────────────────────┤
│ [头像] 发一条友善的评论…                  [发布] │  ← 一级评论输入区
├──────────────────────────────────────────────┤
│ [头像] 用户名  UP主标识          第 n 楼        │
│        评论正文内容……                         │  ← CommentItem 一级评论
│        3 分钟前  👍 128   💬 回复              │
│        ┌────────────────────────────────┐    │
│        │ [头像] A：前排沙发               │    │  ← 楼中楼回复（默认预览 2 条）
│        │ [头像] B 回复 A：哈哈哈哈         │    │
│        │        共 24 条回复，点击查看  >   │    │  ← 展开全部回复
│        └────────────────────────────────┘    │
├──────────────────────────────────────────────┤
│              [点击加载更多评论]                │  ← 游标/分页加载
└──────────────────────────────────────────────┘
```

### 2. 数据模型：一级评论 + 扁平回复（两层，不做无限递归树）

B站评论只有**两层**：主评论（一楼）与它的回复列表（楼中楼）。回复之间通过 `replyTo` 表达「回复了谁」，而不是用 `children` 嵌套成树：

```js
// 一级评论
{
  id: 1001,
  author: { id: 1, name: "用户昵称", avatar: "https://…" },
  content: "评论正文",
  createTime: 1726000000000, // 毫秒时间戳，排序/时间展示的唯一依据
  likeCount: 128,
  liked: false,              // 当前用户是否已点赞
  floor: 3,                  // 楼层号（见下节）
  isUp: false,               // 可选：是否为 UP 主，展示标识
  replies: [ /* Reply[]，扁平数组 */ ],
}

// 楼中楼回复（全部同级，不嵌套）
{
  id: 2001,
  author: { id: 2, name: "A", avatar: "" },
  content: "前排沙发",
  createTime: 1726000100000,
  likeCount: 5,
  liked: false,
  replyTo: null,             // null=直接评论楼主；{id,name} 表示回复某条回复的作者
}
```

前端**禁止递归渲染**：`replies` 永远是平铺数组，「A 回复 B」仅靠 `replyTo` 渲染一个名字前缀，避免数据结构与 UI 退化成多级树形讨论。

### 3. 楼层（「第 n 楼」）规则

- 楼层按**发帖时间从早到晚**编号：最早的评论是 1 楼，之后依次递增；楼层是评论的**固定属性**，与列表当前的排序方式无关。
- 切到「最热」时列表顺序会变，但每条评论仍显示自己原来的楼层号。
- 删除评论后**不重新编号**（已占用的楼层号保留），新评论楼层号 = 当前最大楼层 + 1（真实场景由后端发号）。
- 楼中楼回复**没有楼层号**，只显示「用户名 回复 用户名」。

### 4. 排序：最热 / 最新

- **最热（默认）**：`likeCount` 降序，点赞相同时按时间倒序。
- **最新**：严格按 `createTime` 倒序。
- 排序只改变**展示顺序**，不改变楼层；切换时列表回到第 1 屏。

### 5. 楼中楼交互

- 每条一级评论默认只预览前 **2 条**回复（B站 PC 端做法），减少页面高度。
- 回复数超过 2 条时出现「共 n 条回复，点击查看」，点击后**就地展开**全部回复（B站实际为弹层面板，本组件采用就地展开，保持组件自包含；也可替换为抽屉/弹窗）。
- 点击某条回复的「回复」按钮，展开内联输入框，内容会带上 `replyTo`，渲染为「B 回复 A：…」。
- 点赞为**乐观更新**：先改 UI（liked 与数字 +1/−1），再异步通知后端，失败回滚。

### 6. 发表评论交互

- 顶部输入框基于多行文本域：聚焦后高亮边框，右下角显示「已输入 / 最大字数」与「发布」按钮，空内容或纯空格不可发布。
- 快捷键 **Ctrl / ⌘ + Enter** 发布；回复态输入框额外提供「取消」。
- 发布成功后：一级评论进入列表（「最新」下直接出现在顶部），输入框清空。
- 真实项目通常还要挂表情面板、@提及、图片上传，均作为输入区的扩展插槽/能力位，不侵入列表渲染。

### 7. 状态管理与接口建议

| 前端动作 | 乐观更新 | 建议后端接口 |
| --- | --- | --- |
| 发表评论/回复 | 先入列表 | `POST /comment/add`，返回带楼层的完整评论 |
| 点赞/取消 | 立即翻转计数 | `POST /comment/like` / `POST /comment/unlike` |
| 删除自己的评论 | 确认弹窗后移除 | `POST /comment/delete` |
| 切换排序/加载更多 | loading 态 | `GET /comment/list?sort=hot&cursor=`（游标分页） |

### 8. 评论列表虚拟滚动

当评论量达到数千/数万条时，全量渲染评论项会产生大量 DOM，滚动卡顿。评论项高度不固定，因此采用**动态高度虚拟滚动**（`virtualScroll` 显式开启）：

- **唯一滚动容器**：视口高度确定（`listHeight`），`overflow: auto`；
- **高度来源**：已渲染项由 `ResizeObserver` 测量真实高度，按评论 id 缓存（切换排序后缓存仍可复用）；未渲染项使用估计高度 `estimateHeight`；
- **定位**：基于高度前缀和 `offsets`，滚动位置通过二分查找定位窗口，只挂载「可视区 + 上下 overscan」内的条目，DOM 数量恒定；
- **占位与位移**：phantom 层以总高度撑开真实滚动条，content 层 `translateY` 定位已渲染节点；
- **楼层序号列**：VirtualList 通过 `showIndex` 控制是否渲染「数字 + 楼」序号列，序号默认取条目 `floor` 字段（`indexField` 可配置；字段缺失时回退展示位置序号 index+1）；CommentSection 以业务属性 `showFloorIndex`（默认 `true`）控制该列：开启时 CommentItem 头部不再重复显示楼层，关闭时楼层改由 CommentItem 行内「第 n 楼」展示；
- **滚动补偿**：视口上方的条目因楼中楼展开/新增回复而变高时，同步补偿 `scrollTop`，避免内容跳变；
- **触底加载**：滚动接近底部时抛出 `load-more`，配合外部 `loading` 可对接增量接口（本地全量数据无需处理）；
- 切换排序 / 发表评论后列表自动回到顶部。

---

## 二、组件拆分

所有基础控件均来自 Element Plus（ElAvatar / ElButton / ElInput / ElEmpty / ElMessage / ElMessageBox），并先封装为本模块内部的基础组件，业务组件只引用封装层。

```
src/components/comment/
├─ README.md                 # 本设计文档
├─ index.vue                 # CommentSection 评论区主容器（状态中枢）
├─ mock.js                   # 内置演示数据（不传 comments 时使用）
├─ base/                     # —— 基于 Element Plus 的基础组件封装 ——
│  ├─ BaseAvatar.vue         # ElAvatar 封装：加载失败兜底为「昵称首字 + 色块」
│  ├─ BaseButton.vue         # ElButton 封装：评论区操作按钮（点赞/回复/Tab/发布）
│  └─ BaseTextarea.vue       # ElInput(textarea) 封装：字数统计 + 自适应高度
├─ components/
│  ├─ CommentHeader.vue      # 头部：评论总数 + 最热/最新 切换
│  ├─ CommentEditor.vue      # 评论输入区（顶部发布 / 内联回复两种模式）
│  ├─ CommentItem.vue        # 一级评论：头像/昵称/第n楼/正文/操作条/楼中楼
│  ├─ ReplyList.vue          # 楼中楼：2 条预览 + 展开全部 + 收起
│  ├─ ReplyItem.vue          # 单条回复：「A 回复 B」前缀 + 点赞 + 回复
│  └─ VirtualList.vue        # 动态高度虚拟滚动列表（测量缓存 + 窗口渲染）
└─ utils/
   ├─ format.js              # 相对时间、万以下计数、楼层补排、排序
   └─ virtualScroll.js       # 虚拟滚动数学：高度解析 / 前缀和 / 二分查找 / 窗口
```

**职责约束**：

- `index.vue` 是唯一持有评论列表的组件，负责发送/回复/点赞/删除/排序/分页；
- `CommentItem` / `ReplyItem` 只负责渲染与把用户意图（`reply` / `like` / `delete`）上抛，不自行改数据；
- 回复数据始终扁平存放在一级评论的 `replies` 数组中。

## 三、用法

```vue
<script setup>
import CommentSection from "@/components/comment/index.vue";
import { ref } from "vue";

const comments = ref([]); // 不传时组件使用内置 mock 数据，开箱即用
const currentUser = ref({ id: "me", name: "我", avatar: "" });

const onSend = (content) => {
  // 对接后端：组件已先把评论插入本地列表
};
const onReply = ({ commentId, content, replyTo }) => {};
const onLike = ({ comment, reply, liked }) => {};
const onDelete = ({ comment }) => {};
</script>

<template>
  <CommentSection
    v-model:comments="comments"
    v-model:sort="sort"
    :current-user="currentUser"
    @send="onSend"
    @reply="onReply"
    @like="onLike"
    @delete="onDelete"
  />
</template>
```

### Props

| prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `comments` | Array \| null | `null` | 评论列表；`null` 时使用内置 mock 演示数据，支持 `v-model:comments` |
| `currentUser` | Object | 内置「我」 | 当前登录用户 `{ id, name, avatar }`，自己的评论可删除 |
| `sort` | `'hot' \| 'latest'` | `'hot'` | 排序方式，支持 `v-model:sort` |
| `pageSize` | Number | `20` | 首屏渲染条数，超出后显示「点击加载更多评论」 |
| `previewReplies` | Number | `2` | 楼中楼默认预览条数 |
| `maxlength` | Number | `1000` | 评论最大字数 |
| `loading` | Boolean | `false` | 列表加载态（预留远程加载） |
| `virtualScroll` | Boolean | `false` | 是否开启评论列表虚拟滚动（显式开启；开启后不再显示「点击加载更多」，由列表内部承载全量数据） |
| `listHeight` | Number \| String | `600` | 虚拟滚动视口高度，number 按 px；容器必须有确定高度 |
| `showFloorIndex` | Boolean | `true` | 仅虚拟模式生效：是否以左侧序号列显示楼层；关闭后楼层改由 CommentItem 行内「第 n 楼」展示 |

> 开发环境提供 MockJS 批量数据实测入口：`src/views/CommentDemo.vue`（App 顶部「评论区演示」），数据由 `src/mock/modules/comment.js` 的 `GET /mock-api/comment/list?count=500&seed=0` 生成，可切换数据量 / 虚拟滚动 / 楼层序号列 / 视口高度。

### Emits

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `update:comments` | 新列表 | 任意本地变更后同步 |
| `update:sort` | `'hot' \| 'latest'` | 切换排序 |
| `send` | `content` | 发表一级评论（本地已插入） |
| `reply` | `{ commentId, content, replyTo }` | 发表回复（本地已插入） |
| `like` | `{ comment, reply, liked }` | 点赞/取消（本地已翻转，失败可回滚） |
| `delete` | `{ comment }` | 删除自己的一级评论（本地已移除） |
