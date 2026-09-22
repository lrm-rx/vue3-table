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
- 点击「回复」按钮，内联输入框**就近展开**：回复楼主时编辑器置顶于楼中楼卡片（全部回复之上，紧邻操作条，长列表也无需滚动）；回复某条回复时编辑器插在**该条正下方**。内容带上 `replyTo`，渲染为「B 回复 A：…」。切换回复目标时编辑器随位置迁移并重新聚焦，发送/取消后收起。
- 点赞为**乐观更新**：先改 UI（liked 与数字 +1/−1），再异步通知后端，失败回滚。

### 6. 操作条与删除权限

- 点赞 / 回复为**纯文本按钮（无图标）**，并展示实时计数：`点赞(10)`、`回复(12)`；点踩功能已移除。
- 删除权限：**自己的评论 / 回复**可删除；`currentUser.role === 'admin'`（管理员）可删除**任意**评论 / 回复。
- 删除需确认弹窗（ElMessageBox），确认后本地移除并上抛 `delete` 事件；删除一级评论不重新编号楼层。

### 7. 发表评论交互

- 顶部输入框基于多行文本域：聚焦后高亮边框，右下角显示「已输入 / 最大字数」与「发布」按钮，空内容或纯空格不可发布。
- 快捷键 **Ctrl / ⌘ + Enter** 发布；回复态输入框额外提供「取消」。
- 发布成功后：一级评论进入列表（「最新」下直接出现在顶部），输入框清空。
- 真实项目通常还要挂表情面板、@提及、图片上传，均作为输入区的扩展插槽/能力位，不侵入列表渲染。

### 8. 状态管理与接口建议

| 前端动作 | 乐观更新 | 建议后端接口 |
| --- | --- | --- |
| 发表评论/回复 | 先入列表 | `POST /comment/add`，返回带楼层的完整评论 |
| 点赞/取消 | 立即翻转计数 | `POST /comment/like` / `POST /comment/unlike` |
| 删除评论/回复（本人或管理员） | 确认弹窗后移除 | `POST /comment/delete` |
| 切换排序/加载更多 | loading 态 | `GET /comment/list?sort=hot&cursor=`（游标分页） |

### 9. 评论列表虚拟滚动

当评论量达到数千/数万条时，全量渲染评论项会产生大量 DOM，滚动卡顿。评论项高度不固定，因此采用**动态高度虚拟滚动**（`virtualScroll` 显式开启）：

- **唯一滚动容器**：视口高度确定（`listHeight`），`overflow: auto`；
- **高度来源**：已渲染项由 `ResizeObserver` 测量真实高度，按评论 id 缓存（切换排序后缓存仍可复用）；未渲染项使用估计高度 `estimateHeight`；
- **定位**：基于高度前缀和 `offsets`，滚动位置通过二分查找定位窗口，只挂载「可视区 + 上下 overscan」内的条目，DOM 数量恒定；
- **占位与位移**：phantom 层以总高度撑开真实滚动条，content 层 `translateY` 定位已渲染节点；
- **楼层展示**：楼层统一由 CommentItem 渲染在昵称行右端——左侧昵称 + UP 标识成组、右侧「第 n 楼」，flex 两端对齐；两种滚动模式表现一致，排序切换后楼层保持固定编号。VirtualList 另保留通用的 `showIndex` 序号列能力（「数字 + 楼」+ sticky 排序表头，`indexField` 可配置），评论区默认不启用；
- **滚动补偿**：视口上方的条目因楼中楼展开/新增回复而变高时，同步补偿 `scrollTop`，避免内容跳变；
- **触底加载**：滚动接近底部时抛出 `load-more`，配合外部 `loading` 可对接增量接口（本地全量数据无需处理）；
- 切换排序 / 发表评论后列表自动回到顶部。

### 10. 头部吸顶（非虚拟模式）

非虚拟模式下评论数据较多时会出现页面级（滚动容器）滚动条，**「评论 + 总数」头部与顶部输入区**滚过滚动容器顶部后通过 `position: sticky` 固定在顶部（`CommentHeader` 与 `CommentEditor` 包裹在 `.bili-comment__top--sticky` 中），列表内容从其下方滚过；滚回顶部后自动还原。虚拟滚动模式列表在自身视口内滚动、头部天然常驻，不启用吸顶。

**吸顶态阴影**：头部上方紧贴一个 1px 哨兵（负 margin 不占布局），`@vueuse/core` 的 `useIntersectionObserver` 观察哨兵——越过滚动容器可视顶（未相交且在视口上方）即进入 `is-stuck` 态，吸顶头显示 `box-shadow` 与列表内容拉开层次；回滚后自动解除（带 box-shadow 过渡）。哨兵在视口下方（评论区尚未进入屏幕）不会误判。

宿主页面需满足 sticky 生效条件（组件已保证自身链路无障碍）：

- 吸顶头部到滚动容器之间的祖先不能出现 `overflow: hidden / auto / scroll`（如 `el-card` 自带 `overflow: hidden`、`el-card__body` 自带 `overflow: auto`，需放开为 `visible`，参考 `CommentDemo.vue`）；
- 滚动容器自身不要设置 `padding-top`：Chromium 中 sticky 吸顶停靠在滚动容器 content-box 顶，容器 `padding-top` 会让吸顶头下方留出一截内容穿透的缝隙（App 根容器已改为「无 padding-top + 首子元素 margin-top 补偿」）；
- 文档本身不能有多余的可滚动量：`body` 默认 8px 上下外边距 + 容器 `height: 100vh` 会让文档高度变成 `100vh + 16px`，出现文档级滚动条——评论区滚到底继续滚动（或拖动浏览器主滚动条）时，整页连同已吸顶的头部会被拖出视口顶部（「吸顶过头」）。App 已通过 `body { margin: 0 }` 清零，文档高度恰为 100vh，滚动完全由根容器承担。

**吸顶条宽度外扩**：宿主容器带左右 padding（如 `el-card__body` 默认 20px）时，仅内容宽的吸顶条会让列表从两侧 padding 区穿过而「穿帮」。组件吸顶条支持横向外扩：宿主在容器上设置 `--bili-sticky-gutter`（外扩量，默认 `0px` 不外扩），吸顶条以「负 margin 外扩 + 等量 padding 补偿」铺满整个容器宽度，内部内容仍与列表对齐。`CommentDemo.vue` 设 `--bili-sticky-gutter: var(--el-card-padding)` 使吸顶条与卡片体同宽。

---

## 二、组件拆分

基础控件来自 Element Plus（ElAvatar / ElButton / ElInput / ElEmpty / ElMessage / ElMessageBox）：头像与文本域封装为 BaseAvatar / BaseTextarea，按钮直接使用 ElButton（EP 默认风格），业务组件不引用其他封装层。

```
src/components/comment/
├─ README.md                 # 本设计文档
├─ index.vue                 # CommentSection 评论区主容器（状态中枢）
├─ utils/format.js            # assignFloors 楼层分配、createId、排序等纯函数
├─ base/                     # —— 基于 Element Plus 的基础组件封装 ——
│  ├─ BaseAvatar.vue         # ElAvatar 封装：加载失败兜底为「昵称首字 + 色块」
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

const comments = ref([]); // 评论列表由业务侧传入并双向同步
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
| `comments` | Array | `[]` | 评论列表（业务侧传入，组件内不内置 mock 数据），支持 `v-model:comments` |
| `currentUser` | Object | `{ id: '', name: '', avatar: '' }` | 当前登录用户 `{ id, name, avatar, role? }`（业务侧传入）；自己的评论/回复可删除，`role: 'admin'` 为管理员可删除任意内容 |
| `sort` | `'hot' \| 'latest' \| 'floor'` | `'hot'` | 排序方式：最热 / 最新（楼层倒序）/ 楼层升序；支持 `v-model:sort` |
| `pageSize` | Number | `20` | 首屏渲染条数，超出后显示「点击加载更多评论」（仅本地模式） |
| `previewReplies` | Number | `2` | 楼中楼默认预览条数 |
| `maxlength` | Number | `1000` | 评论最大字数 |
| `loading` | Boolean | `false` | 列表加载态（远程模式抑制重复 `load-more`） |
| `virtualScroll` | Boolean | `false` | 是否开启评论列表虚拟滚动（显式开启；开启后不再显示「点击加载更多」，由列表内部承载全量数据） |
| `listHeight` | Number \| String | `600` | 虚拟滚动视口高度，number 按 px；容器必须有确定高度 |
| `remote` | Boolean | `false` | 远程加载模式：触底时 emit `load-more` 由父组件取数并 append；不启用时保留本地切片 + 「点击加载更多」按钮 |
| `autoLoadMore` | Boolean | `false` | 非虚拟模式触底自动加载：开启后本地模式滚近底部自动扩容切片（隐藏「点击加载更多」按钮，哨兵触发，不 emit `load-more`），全部加载完后显示「没有更多评论了」；远程模式本就由哨兵触底取数，不受影响 |
| `remoteHasMore` | Boolean | `true` | 远程模式：是否还有更多数据（父组件根据接口返回控制）；`false` 时显示「没有更多评论了」 |
| `bottomDistance` | Number | `200` | 非虚拟模式触底提前量（px），哨兵进入视口 rootMargin 时触发 `load-more`（远程取数 / 本地扩容） |

> 开发环境提供 MockJS 批量数据实测入口：`src/views/CommentDemo.vue`（App 顶部「评论区演示」），数据由 `src/mock/modules/comment.js` 的 `GET /mock-api/comment/list?count=500&seed=0` 生成，可切换数据量 / 虚拟滚动 / 触底自动加载 / 视口高度。

### Emits

所有写操作的 payload 均携带 `opId`（组件内部为该次操作保存了快照）：请求成功后调用暴露的 `settle(opId)` 丢弃快照；失败则调用 `rollback(opId)` 按快照精确还原本地数据。

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `update:comments` | 新列表 | 任意本地变更后同步 |
| `update:sort` | `'hot' \| 'latest'` | 切换排序 |
| `send` | `{ content, opId }` | 发表一级评论（本地已插入） |
| `reply` | `{ commentId, content, replyTo, opId }` | 发表回复（本地已插入） |
| `like` | `{ comment, reply, liked, opId }` | 点赞/取消（本地已翻转，失败可回滚） |
| `delete` | `{ comment, reply, opId }` | 删除一级评论（`reply` 为 null）或楼中楼回复（`reply` 为该回复），确认弹窗后本地已移除 |
| `load-more` | — | 远程模式触底时触发（虚拟模式由 VirtualList `isNearBottom` 检测，非虚拟模式由 IntersectionObserver 哨兵检测）；父组件取数后 append 到 `comments` 并更新 `remoteHasMore` |

### Exposed Methods（通过模板 ref 调用）

| 方法 | 说明 |
| --- | --- |
| `settle(opId)` | 写请求成功后调用：丢弃该操作的快照 |
| `rollback(opId)` | 写请求失败后调用：按操作前快照精确回滚（点赞恢复旧值、发布/回复按 id 移除、删除插回原位置），并同步 `comments` |
