# BaseMdEditor Markdown 编辑器

基于 [md-editor-v3](https://github.com/imzbf/md-editor-v3) 的二次封装：图片默认 base64 内联（支持工具栏上传 / 拖拽 / 截图粘贴）、可选自定义上传、中文开箱即用，并集成了自定义**目录面板**、Mark 高亮、Emoji、预览主题切换、插入时间、自动保存等扩展。

- 文件：`index.vue`（主组件）、`utils.js`（工具函数）、`extensions/`（工具栏扩展 / 页脚扩展 / 目录面板）
- 其余未声明的属性与事件一律透传给底层 `MdEditor`（只读模式透传给 `MdPreview`）

---

## 1. 基本用法

```vue
<template>
  <MdEditor v-model="content" style="height: 500px" />
</template>

<script setup>
import { ref } from 'vue'
import MdEditor from '@/components/mdEditor/index.vue'

const content = ref('# 标题\n\n正文')
</script>
```

---

## 2. 目录面板

### Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `catalog` | Boolean | `false` | 目录面板**初始**是否显示；动态变更会同步重置面板状态（见 §3） |
| `catalogPosition` | String | `'right'` | 面板位置：`'left'` 编辑器左侧 / `'right'` 编辑器右侧 |
| `catalogMaxDepth` | Number | `undefined` | 最大展示层级（level ≤ 该值才显示），不传 / ≤ 0 表示不限制 |
| `catalogWidth` | String/Number | `240` | 面板宽度（数字按 px 处理，字符串原样使用） |

### 行为说明

- **目录切换按钮常驻工具栏**（目录在左 → 按钮在首位，目录在右 → 按钮在末位），点击切换面板显隐，面板默认不显示；内置 `catalog` 工具栏按钮会被自动排除，避免两个入口并存。
- **编辑模式**：面板与编辑器等高、内部独立滚动，支持滚动跟随高亮（scroll-spy）与点击平滑定位。
- **只读模式**（`read-only`）：无工具栏，面板显隐只能通过 `catalog` prop 初始化或实例方法 `toggleCatalog()` 切换；面板采用 sticky 吸顶布局，页面滚动时保持可见，点击目录项定位到页面位置。
- 目录数据由底层组件的 `onGetCatalog` 事件驱动，业务侧也可通过 `@on-get-catalog` 监听同一份数据（二者并存、互不影响）。

### CSS 样式说明

样式分布在两处：布局类写在 `index.vue`（容器与各模式的定位方案），面板自身外观写在 `extensions/Catalog.vue`（scoped）。两类名约定：

| 类名 | 挂载位置 | 说明 |
|---|---|---|
| `.base-md-editor` | 容器根 | 组件最外层包裹元素 |
| `.base-md-editor--with-catalog` | 容器根 | 编辑模式 + 面板显示时的布局类 |
| `.base-md-editor--catalog-left` | 容器根 | 编辑模式 + 面板在左时的变体 |
| `.base-md-editor--readonly-catalog` | 容器根 | 只读模式 + 面板显示时的布局类（左侧再加 `--readonly-catalog-left`） |
| `.md-editor--fs-catalog` / `--fs-catalog-right` / `--fs-catalog-left` | MdEditor 根元素 | 全屏时面板 Teleport 进编辑器根元素后的让位类 |
| `.base-md-catalog` | 面板根（aside） | 面板本体，带 `data-theme="light/dark"` 属性 |
| `.md-editor-catalog-toggle-btn`（`--active`） | 工具栏按钮 | 目录切换按钮，激活态样式与 md-editor 工具栏一致 |

**① CSS 变量 `--catalog-width`**：`catalogWidth`（数字自动转 px）以 CSS 变量形式挂在容器根上，所有「为面板让位」的 padding 计算都引用它，修改宽度只需覆盖该变量，无需改动布局规则。

**② 编辑模式：padding 留白 + absolute 贴边**

```scss
.base-md-editor--with-catalog {
  position: relative;
  padding-right: calc(var(--catalog-width, 240px) + 8px);

  .base-md-catalog {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
  }
}
```

编辑器保持在文档流（决定容器高度），面板绝对定位贴边，因此面板高度严格等于编辑器高度，目录项再多也不会撑高容器，超出部分由面板 `__body` 独立滚动。注意留白必须加在**容器 padding** 上、不能给 `.md-editor` 加 margin —— 其根元素 `width: 100%` 相对内容盒计算，加 margin 会导致编辑器整体溢出、预览区被面板遮挡。面板在左时由 `--catalog-left` 镜像为 `padding-left` + `left: 0`。

**③ 只读模式：flex 布局 + sticky 吸顶**

```scss
.base-md-editor--readonly-catalog {
  display: flex;
  align-items: flex-start; // 面板高度小于容器是 sticky 生效前提
  gap: 8px;

  > .md-editor-previewOnly { flex: 1; min-width: 0; }

  .base-md-catalog {
    position: sticky;
    top: 0;
    max-height: 100vh; // 超出视口高度由面板内部滚动
  }
}
.base-md-editor--readonly-catalog-left { flex-direction: row-reverse; }
```

只读模式不复用 ② 的方案：MdPreview 无独立滚动容器，内容高度即容器高度，absolute 面板会随整篇文章拉伸并随页面滚出视口。改为 flex 让面板占据真实列宽，`position: sticky; top: 0` 使页面滚动时面板保持可见；左侧变体通过 `row-reverse` 翻转视觉顺序（DOM 中 MdPreview 始终在前）。

**④ 全屏模式**：两种全屏下面板 Teleport 进编辑器根元素内部（脱离文档流后兄弟节点不可见），由 `--fs-catalog-*` 类在编辑器根上加 padding 让位并提升 `z-index: 10`。

**⑤ 面板自身外观（Catalog.vue）**：竖向 flex 布局，`__header` 固定头部 + `__body`（`flex: 1` 独立滚动）；目录项缩进为内联样式 `padding-left: 8 + depth * 14px`；激活项 / hover 配色取 element-plus 变量（`--el-color-primary` 等，带浅色兜底值）；滚动条自定义 6px 轨道样式，通过 `@supports not selector(::-webkit-scrollbar)` 用标准属性（`scrollbar-width` / `scrollbar-color`）兜底且二者互斥；深色主题由根元素 `data-theme="dark"` 切换边框 / 背景 / 文字色与滚动条变量（跟随 `theme` prop）。

---

## 3. 暴露的实例 API（ref）

```vue
<template>
  <MdEditor ref="editorRef" v-model="content" read-only catalog />
  <el-button @click="editorRef.toggleCatalog()">切换目录</el-button>
</template>

<script setup>
import { ref } from 'vue'
import MdEditor from '@/components/mdEditor/index.vue'

const editorRef = ref()
const content = ref('# 标题\n\n正文')
</script>
```

| 实例成员 | 类型 | 说明 |
|---|---|---|
| `editorRef` | Object | 底层 md-editor-v3 实例，可调用其 `insert()` / `rerender()` 等原生方法（仅编辑模式存在；只读模式宿主为 `MdPreview`） |
| `toggleCatalog` | `(visible?: boolean) => void` | 切换目录面板显隐：**不传参数**取反当前状态；**传布尔值**直接设置目标状态（对已处于目标状态时幂等） |

### 典型场景

**① 编辑模式：默认收起，按钮点击展开（默认行为）**

```vue
<MdEditor ref="editorRef" v-model="content" />
<!-- 工具栏目录按钮常驻，点击即切换；无需额外代码 -->
```

**② 初始化即显示目录**

```vue
<MdEditor v-model="content" catalog />
```

**③ 只读模式：由业务按钮控制目录显隐（只读模式无工具栏，只能用实例方法）**

```vue
<template>
  <MdEditor ref="viewerRef" v-model="content" read-only />
  <el-button @click="viewerRef.toggleCatalog()">目录</el-button>
</template>
```

**④ 外部逻辑直接设置状态（如抽屉打开时强制展开、关闭时收起）**

```js
viewerRef.value.toggleCatalog(true)  // 强制显示
viewerRef.value.toggleCatalog(false) // 强制隐藏
```

---

## 4. 注意事项

- `toggleCatalog` 与工具栏按钮、`catalog` prop 三者操作同一份内部状态：按钮 / 方法切换不回写 prop，动态变更 `catalog` prop 会重置面板为 prop 指定的状态。
- `catalog` 系列自定义 props 不会透传给底层 md-editor-v3，其余属性（`placeholder`、`footers`、原生事件等）正常透传。
