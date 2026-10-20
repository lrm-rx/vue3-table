# FormPro 配置式表单

基于 Element Plus `el-form` 的二次封装，用 `items` 配置驱动渲染，同时**完整保留 el-form 的全部属性、实例方法与事件**。

- 文件：`index.vue`（主组件）、`FormBlock.vue`（渲染块）、`utils.js`（纯函数工具）
- 命名：`defineOptions({ name: "FormPro" })`

---

## 1. 基本用法

```vue
<template>
  <FormPro ref="formRef" v-model="formData" :items="items" label-width="100px" :rules="rules">
    <!-- 具名插槽：字段控件 / 插入项 / 分组标题扩展区 -->
    <template #remark="{ value }"> ... </template>
  </FormPro>
</template>

<script setup>
import { ref } from "vue";
import FormPro from "@/components/formPro/index.vue";

const formRef = ref();
const formData = ref({ name: "张三" }); // 只需声明有意义的默认值（见 autoFillDefaults）
const rules = { name: [{ required: true, message: "请输入姓名", trigger: "blur" }] };

const items = ref([
  { prop: "name", label: "姓名", required: true, itemRender: { name: "ElInput", props: { clearable: true } } },
  { prop: "age", label: "年龄", itemRender: { name: "ElInputNumber", props: { min: 0 } } },
  { prop: "hobbies", label: "爱好", itemRender: { name: "ElCheckboxGroup", options: [...] } },
]);
</script>
```

---

## 2. 组件 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `modelValue` | Object | `{}` | 表单数据（v-model） |
| `items` | Array | `[]` | 表单项配置数组 |
| `columns` | Number | `0` | 列数；设置后每项默认 `span = 24 / columns` |
| `span` | Number | `24` | 默认栅格占位（`columns` 未设时生效） |
| `gutter` | Number/Array | `0` | el-row 间距 |
| `onlyRequired` | Boolean | `false` | 仅显示必填项 |
| `titleColon` | Boolean | `false` | 标题是否带冒号（`item.titleColon` 可覆盖） |
| `titleBold` | Boolean | `false` | label 是否统一加粗（`item.titleBold` 可覆盖，项级优先级更高） |
| `groupCollapsible` | Boolean | `true` | 分组默认是否可折叠（`group.collapsible` 可覆盖） |
| `removeHiddenValues` | Boolean | `false` | 移除因 `visible`/`visibleMethod` 隐藏的字段值（见 §6） |
| `autoFillDefaults` | Boolean | `true` | 按 items 自动补全缺失字段的默认值（见 §5） |
| `border` | Boolean | `false` | 边框表格样式：外框 + 单元格网格线 + label 表头底色（见 §11） |
| `compact` | Boolean | `false` | 紧凑型表单：间隔收紧、label 距离减半、校验错误 tooltip 化（见 §16） |
| `errorTipDuration` | Number | `3` | 紧凑模式：校验错误 tooltip 自动隐藏秒数；`<=0` 表示不自动隐藏（见 §16） |

> 其余属性（`labelWidth`/`labelPosition`/`rules`/`inline`/`disabled` 等）一律透传给内部 `<el-form>`。

---

## 3. items 单项配置

| 字段 | 说明 |
|---|---|
| `prop` | 绑定 formData 的字段名（无 prop 即为「插入项」） |
| `label` | 标签 |
| `span` | 栅格占位（覆盖表单级） |
| `required` | 是否必填 |
| `rules` | 单字段校验规则 |
| `tip` | 填写/选择提示：位于「校验错误提示」同一位置（控件下方），颜色为 success 主色调；字段未校验不通过时一直显示，校验失败则隐藏、让位给错误提示 |
| `defaultValue` | 该字段固定默认值（autoFill 时优先级最高） |
| `itemRender` | `{ name, props, options, events }` 渲染内置控件（ElInput/ElSelect/.../UploadPro）。`options` 支持三种形态：①静态数组 `[{label,value}]`；②函数 `(ctx)=>Option[]`（ctx.data 为当前表单数据，用于**级联联动**）；③响应式 ref（用于**后端异步返回**，数据到位自动重渲染）。内置 `UploadPro` 上传控件见 §12 |
| `render(ctx, h)` | JSX 自定义渲染控件，`ctx = { value, prop, data }`（ctx 在前；h 仅在需要手写 VNode 时使用，JSX 中可省略） |
| `slot` | 引用外部具名插槽渲染（字段控件 / 插入项 / 分组标题扩展区） |
| `prefix` / `suffix` | 控件**前后缀**（在控件前/后渲染文本或元素，非 label 区域）。支持两种形态：①字符串 → 纯文本（如 `"￥"`、`"个"`）；②函数 `(ctx, h) => VNode`，`ctx = { value, prop, data }`，可读取当前值实现动态文本（见 §10） |
| `visible` / `visibleMethod(data)` | 条件显隐（`visibleMethod` 返回 `false` 表示隐藏） |
| `disabledWhen(ctx)` / `readonlyWhen(ctx)` | 动态禁用 / 只读：依据当前表单数据求值（`ctx = { value, prop, data }`），render 期自动追踪依赖、随依赖字段变化实时切换；与静态 `itemRender.props.disabled / readonly` 为「或」关系（静态 `true` 恒生效）。只读仅对支持 `readonly` 的控件有效（如 ElInput），选择类控件请用禁用（见 §14） |
| `optionsSource` | 声明式异步选项：`{ deps, fetch, when?, clearValue?, debounce? }`——「输入/选择/切换 → 请求接口 → 刷新本字段 options」，内置 loading、防竞态、依赖变化自动清空本字段值（见 §14）。与 `itemRender.options` 互斥（配置后由 optionsSource 接管 options） |
| `removeValueOnHidden` | 项级：隐藏时是否移除值（覆盖表单级 `removeHiddenValues`） |
| `folding` | 是否为折叠表单项（配合 `collapseNode`） |
| `itemProps` | 透传给 `<el-form-item>` 的额外属性 |
| `titlePrefix`/`titleSuffix`/`titlePrefixTip`/`titleSuffixTip`/`titleBold` | 标题前后缀图标与提示 |

**分组头**：`{ group: true, title, fold, collapsible, allToggle, render, slot, titleBold, titleStyle }`。
- `titleBold`：标题是否加粗（`true` → 700，`false` → 400，未设置 → 默认 600）；
- `titleStyle`：标题自定义内联样式（颜色/字号等，如 `{ color: '#409eff', fontSize: 15 }`），与 `titleBold` 叠加，`fontWeight` 显式指定时优先于 `titleBold`。

**插入项**：无 `prop`，用 `slot` 或 `render` 在表单项之间插入任意内容（`span: 24` 占整行）。

**占位项（留白）**：空对象 `{}` 即合法配置——无 `prop`/`slot`/`render` 时渲染为空 `el-col`，占据一个默认 span（`columns` 推导或表单级 `span`），用于两个 item 之间留白；`{ span: 8 }` 可指定占位宽度，也受 `visible` / `visibleMethod` 控制（条件留白）。

**折叠触发节点**：`{ collapseNode: true, span }` 控制 `folding` 项的展开/收起。

---

## 4. 暴露的实例 API（ref）

`formRef.value` 上可用：

**el-form 全部实例成员**（组件挂载后自动合并，对 EP 未来新增方法也兼容）：
`validate` / `validateField` / `resetFields` / `clearValidate` / `scrollToField` / `getField` / `setInitialValues` / `fields` / `formRef`（原始 el-form 实例）

**每个 el-form-item 的完整实例**：
- `formItemRefs` —— `{ [prop]: el-form-item 实例 }`，字段显隐/增删时自动同步
- `getFormItem(prop)` —— 按 prop 取单个实例（拿不到返回 `undefined`）

实例上可访问 el-form-item 的全部 expose：`validate` / `clearValidate` / `resetField` / `setInitialValue` / `validateState` / `validateMessage` / `size`。

```js
formRef.value.getFormItem("email").clearValidate();
```

**FormPro 自身方法**：
- `getSubmitData()` —— 返回已按 `removeHiddenValues` 过滤的提交数据（见 §6）
- 分组折叠：`setGroupCollapsed(title, v)` / `toggleGroup(title)` / `setGroupsCollapsed(titles, v)` / `collapseAllGroups()` / `expandAllGroups()` / `toggleAllGroups()`
- 运行时动态配置：`addItems(entries, position?)` / `removeItems(target)` / `updateItems(target, patch)` —— 增删改 items（联动禁用/显隐、异步 options，详见 §13）
- `formData` —— 内部完整数据（含隐藏字段值）

---

## 5. 初始值自动补全（autoFillDefaults）

表单项很多时，不必把每个字段的空默认值都写出来。开启 `autoFillDefaults`（默认开）后，组件按 `items` 配置**自动补全缺失字段**的默认值：

| 控件 | 默认值 |
|---|---|
| `ElSwitch` | `false` |
| `ElCheckboxGroup` | `[]` |
| `UploadPro` / 名称含 Upload 的控件 | `[]` |
| 其余（Input/Select/Radio/DatePicker/InputNumber…） | `""` |
| 指定了 `item.defaultValue` | 该值（优先级最高） |

**用户已提供的值始终不被覆盖。**

```js
// 只需声明有意义的非空默认值
const formData = ref({ name: "张三", age: 28, enabled: true, hobbies: ["read"] });
// birthday/email/address 等会被自动补为 ""
```

补全发生在三处：初始化、父级 modelValue 同步、items 动态新增字段。可用 `:auto-fill-defaults="false"` 关闭，回退原行为。

---

## 6. 提交时移除隐藏字段值（removeHiddenValues）

应用场景：保存/提交时不传被 `visibleMethod` 隐藏的字段值。

```vue
<FormPro :remove-hidden-values="true" ... />
```

```js
const submitData = formRef.value.getSubmitData(); // 已过滤隐藏字段值
```

**关键约束**：
- 仅移除因 `visible:false` 或 `visibleMethod` 返回 `false` 而隐藏的字段。
- **`onlyRequired` 导致的隐藏不受影响**，其值保留。
- 项级 `item.removeValueOnHidden` 可单独覆盖表单级开关。
- 内部 `formData` 始终保留完整值（字段重新可见时值仍在），仅对外回抛 / `getSubmitData()` 时过滤。

---

## 7. 选择类控件的 options（三种赋值方式）

`itemRender.options` 用于 `ElSelect` / `ElRadioGroup` / `ElCheckboxGroup` 等选择类控件，支持**三种形态**，可按需选用：

| 形态 | 写法 | 适用场景 |
|---|---|---|
| ① 静态数组 | `options: [{ label, value }]` | 选项固定不变 |
| ② 响应式 ref | `options: levelOptions`（ref） | 选项由**后端接口异步返回** |
| ③ 函数 | `options: (ctx) => Option[]` | 选项与**其他字段联动（级联）** |

> 选项解析发生在**渲染期**：读取响应式数据会被 Vue 追踪，因此「接口数据到位」或「联动字段变化」都会**自动重渲染**，无需手动刷新。

### ① 静态数组（最简，向后兼容）

```js
{
  prop: "gender",
  label: "性别",
  itemRender: {
    name: "ElSelect",
    props: { placeholder: "请选择" },
    options: [
      { label: "男", value: "male" },
      { label: "女", value: "female" },
    ],
  },
}
```

### ② 后端接口异步返回（传 ref）

把接口结果写入一个响应式 `ref`，直接把该 ref 赋给 `options`。数据回来时组件自动渲染，**不需要**监听、不需要手动赋值。

```vue
<script setup>
import { ref, onMounted } from "vue";

const levelOptions = ref([]);

// 真实项目里替换为你的接口请求
const fetchLevels = () => axios.get("/api/levels").then((r) => r.data);

onMounted(async () => {
  levelOptions.value = await fetchLevels(); // 到位后自动渲染
});

const items = ref([
  {
    prop: "level",
    label: "职级",
    itemRender: { name: "ElSelect", props: { placeholder: "请选择职级" }, options: levelOptions },
  },
]);
</script>
```

> ⚠️ **不要**让函数形态直接 `return Promise`（如 `options: () => fetchLevels()`）——render 是同步的，Promise 会被当作空数组。异步数据一律用 **ref** 承载。

### ③ 与其他字段联动 / 级联（传函数）

`options` 写成函数，接收 `ctx = { data, value, prop }`，其中 `ctx.data` 是**当前表单数据**。依据某个已选字段返回对应选项，依赖变化时自动重渲染。

```js
const cityMap = {
  广东: [{ label: "广州", value: "gz" }, { label: "深圳", value: "sz" }],
  浙江: [{ label: "杭州", value: "hz" }, { label: "宁波", value: "nb" }],
};

const items = ref([
  {
    prop: "province",
    label: "省份",
    itemRender: {
      name: "ElSelect",
      options: [
        { label: "广东", value: "广东" },
        { label: "浙江", value: "浙江" },
      ],
      // 切换省份时清空已选城市，避免残留失效值
      events: { change: () => (formData.value.city = "") },
    },
  },
  {
    prop: "city",
    label: "城市",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择城市" },
      // 函数形态：依据当前已选省份联动
      options: (ctx) => cityMap[ctx.data.province] || [],
    },
  },
]);
```

> 建议在联动源字段的 `itemRender.events.change` 里清空被联动字段的已选值，防止「选项已变但旧值残留」。

### 选项对象结构

每个选项支持 `{ label, value, props }`，其中 `props` 会透传给 `el-option` / `el-radio` / `el-checkbox`（如 `disabled`）：

```js
{ label: "P8（专家）", value: "p8", props: { disabled: true } }
```

> 完整可运行示例见 [FormProDemo.vue](../../../views/FormProDemo.vue)（`level` 演示 ref 异步、`province→city` 演示函数级联）；纯函数 `resolveFieldOptions` 的单测见 `tests/unit/formProUtils.test.js`。

---

## 8. ⚠️ 注意：watch formData → 改 items 会不会死循环？

### 结论
**写法不当会触发，但根因是「watch 里写回了它所监听的源」，与组件无关。**

### 耦合链路
开启 `autoFillDefaults` 后，`items` 变化会触发「补默认值」。完整链路：

```
watch(formData) → 修改 items（新增字段 company）
  → FormPro watch(items) → 补默认值 company = ""
     → formData 变化 → 回抛父级
        → 父级 formData 变化 → 你的 watch(formData) 再次触发 ← 回到起点
```

> 组件已做「**静默补全**」兜底：补默认值这一步**不向父级回抛**，减少了多余触发。但仍建议使用侧规范写法。

### 推荐写法（按推荐度）

**① 监听具体字段，而非整个 formData（最推荐，治本）**
```js
watch(() => formData.value.type, (type) => {
  if (type === "company") { /* 增删 items */ }
});
```
自动补的是别的字段，不会触发该 watcher。

**② watcher 内做幂等守卫**
```js
watch(formData, (val) => {
  const has = items.value.some(i => i.prop === "company");
  if (val.type === "company" && !has) items.value.push({ prop: "company", ... });
  else if (val.type !== "company" && has)
    items.value = items.value.filter(i => i.prop !== "company");
}, { deep: true });
```

**③ reentry guard 屏蔽程序写回**
```js
let syncing = false;
watch(formData, () => {
  if (syncing) return;
  syncing = true;
  try { /* 改 items */ } finally { syncing = false; }
}, { deep: true });
```

---

## 9. 事件

`defineEmits` 仅声明 `update:modelValue`；`inheritAttrs: false`，其余 `onXxx` 监听器全部进入 `$attrs` 并原样透传到内部 `<el-form>`。因此 **el-form 的原生事件（如 `validate`）及任意自定义事件均正常触发**，无需手动重 emit。

---

## 10. 控件前后缀（prefix / suffix）

在 `el-form-item` 的**内容区**、控件的**前/后**渲染文本或自定义元素（与 label 无关）。典型场景：输入框前加货币符号、后加单位；或展示与当前值联动的描述文本。

### 两种形态

| 形态 | 写法 | 适用场景 |
|---|---|---|
| ① 字符串 | `prefix: "￥"` / `suffix: "个"` | 静态文本（单位、符号、量词） |
| ② 渲染函数 | `(ctx, h) => VNode` | 需要读取当前值的**动态文本**，ctx = `{ value, prop, data }` |

### ① 静态文本（单位 / 符号）

```js
{
  prop: "price",
  label: "价格",
  prefix: "￥",          // 控件前：货币符号
  suffix: "元",          // 控件后：单位
  itemRender: { name: "ElInputNumber", props: { min: 0, precision: 2 } },
}
```

渲染效果：`￥ [ 输入框 ] 元`，三者横向排列、垂直居中。**控件按自身宽度渲染**（如 `ElInputNumber` 默认 150px），前后缀紧贴控件，多余空白留在后缀之后——单位不会被推到容器最右端。

### ② 动态文本（与当前值联动）

函数形态第一个参数为 `ctx`，可读取 `ctx.value`（当前字段值）与 `ctx.data`（整个表单数据），实现「有 xxx 个」等动态描述；第二个参数 `h` 仅手写 VNode 时才需要，纯 JSX 可省略：

```js
{
  prop: "count",
  label: "数量",
  // 读取当前值，渲染「当前输入：N 个」；值变化时自动重渲染
  suffix: (ctx, h) => h("span", { style: { color: "#909399" } },
    `当前输入：${ctx.value ?? 0} 个`),
  itemRender: { name: "ElInputNumber", props: { min: 0 } },
}
```

也可前后都配、或只配一侧：

```js
{
  prop: "phone",
  label: "手机号",
  prefix: "+86",
  itemRender: { name: "ElInput", props: { placeholder: "请输入手机号" } },
}
```

**关键约束**：
- `prefix` / `suffix` 作用于**控件内容区**，与 label 区域的 `titlePrefix` / `titleSuffix`（标题前后缀图标）相互独立。
- 仅当配置了 `prefix` 或 `suffix` 时才渲染包裹容器（`.form-pro__field-control-wrap`）；未配置时 DOM 与原结构完全一致，零侵入。
- 渲染函数内请勿返回 Promise（render 同步执行）。

---

## 11. 边框表格样式（border）

开启 `border` 后，表单渲染为**带边框的表格外观**：外层整框 + 单元格网格线，label 区域带浅灰底色与右侧分隔线（类似「表头单元格」），适用于信息录入、详情描述类表单。

```vue
<FormPro
  v-model="formData"
  :items="items"
  border          <!-- 开启边框表格样式 -->
  label-width="100px"
/>
```

**要点**：
- 默认 `false`，完全向后兼容；仅在显式开启时追加 `.form-pro--border` 容器类与单元格网格线。
- 推荐配合 `gutter="0"`（默认即为 0）使用，使单元格边框首尾相连、无间隙；`label-width` 建议固定值，表头观感更整齐。
- 分组标题在边框模式下自动作为「分段标题行」渲染（占满整行、带底色与底部分隔线）。
- 不影响数据双向绑定、校验、显隐、折叠等全部现有能力，仅为纯样式增强。

> 完整示例见 [FormProBorderDemo.vue](../../../views/FormProBorderDemo.vue)。

---

## 12. 上传集成（内置 UploadPro）

表单内置上传控件 `UploadPro`（文件：`UploadPro.vue` + `uploadUtils.js`），对 Element Plus `el-upload` 二次封装，**完整保留 el-upload 的属性 / 事件 / 实例方法**，并补齐四个开箱能力：

1. **照片墙粘贴上传**：`list-type="picture-card"` 时触发卡片内 `+` 号下方渲染「点击此处粘贴图片」入口，点击该入口（已拦截冒泡，**不会弹出文件选择窗**）聚焦后 `Ctrl+V` 即可粘贴截图 / 复制的图片；点击卡片其他区域（`+` 号 / 空白处）仍正常打开文件选择。粘贴文件走 el-upload 原生链路（`handleStart` 入队 → `beforeUpload` 校验 → 进度 → 成功回填），不另造上传请求。
2. **内置图片预览**：点击墙内图片直接唤起 `el-image` 内置全屏查看器（`preview-src-list` / `initial-index`），支持左右切换、缩放、旋转，无需 `el-dialog` 外壳。
3. **非图片文件预览预留**：`text` / `picture` 列表中，每个文件在「打勾 / 打叉」状态图标**之前**显示眼睛图标，点击（或点击文件名）触发 `preview` 事件，作为后续文件预览组件的挂载点（本组件不实现非图片预览）。
4. **拖拽区宽高自定义**：`drag` 模式下通过 `dragWidth` / `dragHeight` 设置区域宽高（数字按 px，字符串如 `'100%'`、`'480px'` 原样生效）。

### 配置方式

```js
{
  prop: "photos",
  label: "现场照片",
  required: true,
  itemRender: {
    name: "UploadPro", // 内置控件，无需全局注册
    props: {
      listType: "picture-card", // text | picture | picture-card（默认 picture-card）
      multiple: true,
      limit: 8,
      accept: "image/*",
      maxSizeMb: 5, // 内置大小校验，超限自动拦截提示
      // 真实上传二选一：
      action: "/api/upload", // ① el-upload 原生 action
      httpRequest: (option) => request(option), // ② 自定义请求（option.file / option.onProgress）
      // 其余 el-upload 属性（headers/data/name/withCredentials/autoUpload/beforeUpload…）
      // 未在 UploadPro 显式声明的，一律透传给内部 el-upload
    },
    events: {
      // 非图片预览触发：payload = { file, name, url, index, fileList }
      preview: ({ name, url }) => filePreviewRef.value.open({ name, url }),
      // el-upload 原生事件同样可用：success / error / remove / progress / change / exceed
    },
  },
}
```

### UploadPro Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `modelValue` (v-model) | Array | `[]` | 成功文件数组：`string[]`（URL）或 `{ name, url }[]`（`valueFormat` 控制输出） |
| `listType` | String | `picture-card` | 同 el-upload：`text` / `picture` / `picture-card` |
| `showFileList` | Boolean | `true` | 同 el-upload |
| `drag` | Boolean | `false` | 同 el-upload，拖拽上传 |
| `multiple` / `accept` / `limit` / `disabled` / `autoUpload` | - | el-upload 默认 | 常用 el-upload 属性显式透出 |
| `pasteable` | Boolean | `true` | 照片墙是否显示粘贴入口（`+` 号下方文字，仅 picture-card 生效） |
| `pasteText` | String | `点击此处粘贴图片` | 粘贴入口文案 |
| `dragWidth` / `dragHeight` | Number/String | `""` | 拖拽区宽高；数字 → px，字符串原样；不传用 el-upload 默认 |
| `dragText` | String | `将文件拖到此处，或点击上传` | 拖拽区文案（支持简单 HTML） |
| `buttonText` / `buttonType` | String | `点击上传` / `primary` | text / picture 模式触发按钮 |
| `tip` | String | `""` | el-upload 下方提示（也可用 `#tip` 插槽） |
| `maxSizeMb` | Number | `0` | 单文件大小上限（MB），内置 beforeUpload 拦截；0 不限制 |
| `responseKey` | String | `data.url` | 成功响应中 URL 的 lodash-get 路径；取不到回退 `response.url` / 字符串响应 |
| `resolveResponse` | Function | - | `(response, file) => { name, url } | url`，自定义响应解析，优先级最高 |
| `valueFormat` | String | `file` | `file` → `{name,url}[]`；`url` → `string[]` |
| `showExceedMessage` / `showErrorMessage` | Boolean | `true` | 超限 / 失败默认提示开关 |

> 其余 el-upload 属性（`action` / `headers` / `method` / `data` / `name` / `withCredentials` / `httpRequest` / `directory` / `crossorigin`）经 `$attrs` 原样透传内部 `el-upload`；`beforeUpload` / `beforeRemove` 由组件包装（内置大小校验 + 用户钩子串联，用户钩子照常生效）。

### 事件

| 事件 | 说明 |
|---|---|
| `update:modelValue` | 成功文件列表变化（仅 success 项），用于 v-model |
| `preview` | **非图片文件预览触发**（眼睛图标 / 文件名点击）；payload `{ file, name, url, index, fileList }` —— 后续预览组件挂载点 |
| `success` / `error` / `remove` / `progress` / `change` / `exceed` | 与 el-upload 同名事件，参数签名一致 |

### 实例方法（ref）

el-upload 暴露的 **5 个方法全部提供便捷代理**：

- `uploadRef` —— 原始 el-upload 实例（需要更底层访问时使用）
- `abort(file?)` —— 取消上传请求（不传 file 取消全部）
- `submit()` —— 手动上传已入队文件（配合 `autoUpload: false`）
- `clearFiles(states?)` —— 清空文件列表（可按状态过滤）
- `handleStart(rawFile)` —— 编程式添加文件到队列
- `handleRemove(file)` —— 编程式移除文件（传 UploadFile 或原始 File）
- `pasteImages(files)` —— 编程式粘贴：直接传入 `File[]`（仅图片）走同一上传链路

### 插槽

| 插槽 | 说明 |
|---|---|
| 默认插槽 | 整体自定义触发区（对应 el-upload 的 default 插槽）；不传时按模式渲染内置内容：拖拽文案 / 照片墙 `+` / 上传按钮 |
| `tip` | 上传区下方提示内容；不传时渲染 `tip` prop 文案 |
| `file` | 由组件内部接管（照片墙缩略图 / 列表行 + 眼睛图标 + 状态角标），不对外透出 |

### v-model 数据形态

```js
// 默认 valueFormat='file'
photos: [
  { name: "a.png", url: "https://example.com/a.png" },
];
// valueFormat='url'
photos: ["https://example.com/a.png"]; // 文件名按 URL 末段自动推导
```

编辑回填时直接把历史文件数组传入即可（自动归一化为 success 态，el-upload 不会重新上传）。字段无需手动声明空数组，`autoFillDefaults` 会为 `UploadPro` 字段补 `[]`。

### 多上传项与粘贴投递

同一表单可配置任意多个上传项；每个 `UploadPro` 实例的文件列表、图片预览、粘贴入口相互独立。粘贴采用**单入口 + 焦点投递**：点击卡片内粘贴入口（或聚焦到墙内）后按 `Ctrl+V`，只投递到当前实例，不会一次粘贴触发多路上传；粘贴入口的点击已阻止冒泡，不会误弹文件选择窗；粘贴内容非图片时不拦截，保持浏览器原生行为。

> 完整示例见 [FormProUploadDemo.vue](../../../views/FormProUploadDemo.vue)（照片墙 / 单图 / 附件眼睛事件 / 缩略图 / 两个不同尺寸拖拽区）。

---

## 13. 运行时动态增删改 items（addItems / removeItems / updateItems）

表单配置并非总是静态的：某字段没填时另一个字段要**禁用/隐藏**、某下拉的选项要**等接口返回后才有**（耗时不确定）。三个实例方法直接对 `items` 做**原地增删改**（保持数组引用，父级 `ref` 自动响应式更新），单个与批量统一入口。

> 纯函数版本同样从 `utils.js` 导出（`addItems / removeItems / updateItems`），第一个参数为 items 数组，可脱离组件使用。

### API

| 方法 | 签名 | 说明 |
|---|---|---|
| `addItems(entries, position?)` | `entries: Object \| Object[]`；`position` 见下 | 新增一项或多项，返回 items 引用。新增字段的 formData 默认值**立即自动补全**（§5） |
| `removeItems(target)` | `target: prop \| prop[] \| (item)=>boolean` | 删除一项或多项，返回被删除项数组；被删字段的 **formData 键同步清理**，提交不留孤儿值 |
| `updateItems(target, patch)` | `patch: Object \| (item)=>Object` | 更新一项或多项，返回命中项数组。顶层键整体赋值；键含 `.` 时按路径深设（lodash `set`） |

**target 选择器**（三个方法统一）：

```js
"email"                       // 单个：按 item.prop 精确匹配
["zip", "address"]            // 批量：多个 prop
(it) => it.temporary === true // 谓词：还能选中无 prop 的分组头 / 插入项
```

**position（addItems）**：

| 取值 | 含义 |
|---|---|
| `'end'`（默认） | 追加到末尾 |
| `'start'` | 插入开头 |
| `number` | 插入到该索引（越界自动钳制到 `[0, length]`） |
| `{ before: 'prop' }` / `{ after: 'prop' }` | 插到某字段前/后；锚点不存在时回退追加末尾 |

### 场景一：未满足条件时禁用 / 显示其他字段

> 「某字段没填时禁用/只读其他字段」是高频联动，已下沉为声明式配置 `disabledWhen / readonlyWhen`（见 §14）——优先用声明式；本节命令式 `updateItems` 适用于按钮点击等非数据驱动的场景。

```js
// —— 禁用：点路径只改 disabled，placeholder 等兄弟 props 不受影响 ——
// 单个
formRef.value.updateItems("company", { "itemRender.props.disabled": true });
formRef.value.updateItems("company", { "itemRender.props.disabled": false }); // 恢复
// 批量：一次禁用多个，未在数组中的字段不受影响
formRef.value.updateItems(["company", "jobTitle", "taxNo"], {
  "itemRender.props.disabled": true,
});
formRef.value.updateItems(["company", "jobTitle", "taxNo"], {
  "itemRender.props.disabled": false, // 批量恢复
});

// —— 隐藏：visible:false 的项不渲染，后续项自动前移回流 ——
// 单个
formRef.value.updateItems("zip", { visible: false });
formRef.value.updateItems("zip", { visible: true }); // 恢复
// 批量：一次隐藏 / 显示多个（隐藏字段值是否随提交移除见 §6）
formRef.value.updateItems(["zip", "address"], { visible: false });
formRef.value.updateItems(["zip", "address"], { visible: true });
```

> 批量操作对**控件类型无要求**：target 里的 prop 可以混合 Input / Select / DatePicker 等，patch 会统一写到每个命中项；各控件是否消费 `disabled` 属性由 Element Plus 自身决定。

点路径支持任意深度，例如 `'itemRender.props.disabled'`、`'rules[0].required'`；**顶层键是整体赋值**，因此 `itemRender`、`options` 等会整体替换而非按索引合并。需要按每项当前值动态决定补丁时传函数：

```js
formRef.value.updateItems(
  (it) => it.prop?.startsWith("tmp_"),
  (it) => ({ tip: `临时字段 ${it.label}` }),
);
```

#### 批量禁用 / 隐藏的测试用例说明

这两类联动既有**纯函数级**断言（不依赖组件，验证配置被正确改写），也有**真实组件级**断言（挂载 FormPro + Element Plus，验证 DOM 真的禁用 / 不渲染）：

| 层级 | 用例 | 断言要点 |
|---|---|---|
| 单元 | 批量 + 点路径禁用 | `updateItems(["a","c"], {"itemRender.props.disabled":true})` 后仅 a/c 的 props 增加 `disabled:true`；b 完全不变；a/c 各自原有的 `placeholder` 等兄弟 props 保留；返回值仅含 a/c |
| 单元 | 批量隐藏与恢复 | `updateItems(["a","c"], {visible:false})` 后，走真实渲染链路 `splitIntoGroups → resolveVisibleEntries` 只剩 b；`collectHiddenValueProps` 正确收集到 a/c；再批量 `visible:true` 后顺序还原为 a、b、c |
| 集成 | 批量点路径禁用 | 3 个真实 ElInput，批量禁用其中 2 个后 DOM 中带 `disabled` 属性的 input 数量 0→2，第 3 个可正常输入；批量恢复后 2→0 |
| 集成 | 批量 visible 隐藏 | `["name","enabled"]` 一次隐藏后 ElFormItem 只剩「年龄」（中间项移除后后续项自动回流）；批量恢复后渲染顺序仍为 姓名、年龄、启用 |

- 单元用例见 [formProUtils.test.js](../../../tests/unit/formProUtils.test.js) 的 `updateItems` describe（「批量 + 点路径」「批量隐藏」两组）。
- 集成用例见 [FormPro.test.js](../../../tests/integration/FormPro.test.js) 的 `运行时动态配置：addItems / removeItems / updateItems` describe（「批量点路径一次禁用多个控件」「批量 visible=false 一次隐藏多项」两组）。
- 边界已覆盖：未命中项不受影响、禁用后再恢复不残留属性、隐藏恢复后渲染顺序与原配置一致、混合控件类型统一写入。
- 谓词形态 target（`(item)=>boolean`）与 prop 数组走同一条匹配 / 写入路径，行为完全相同；单元 describe 中「谓词更新命中的字段项」已对谓词批量更新另有覆盖。

### 场景二：下拉 options 依赖另一字段，接口耗时不确定

> 「选择/输入/切换 → 请求接口 → 刷新另一字段选项」已下沉为声明式配置 `optionsSource`（见 §14）——内置清值、loading、防竞态、防抖，免去下面这段样板代码；本节命令式写法仍适用于需要在事件里编排多步副作用的复杂场景。

接口返回时机不可控，**返回后直接写入配置**即可——无需 ref 中转，也不关心请求耗时多久：

```js
const onGroupChange = async (group) => {
  formData.value.resource = ""; // 先清旧值
  formRef.value.updateItems("resource", {
    "itemRender.props.loading": true,
    "itemRender.options": [],
  });
  const options = await fetchResources(group); // 耗时不确定
  // 防竞态：返回时若用户已切换分组，丢弃过期结果
  if (formData.value.resourceGroup !== group) return;
  formRef.value.updateItems("resource", {
    "itemRender.props.loading": false,
    "itemRender.options": options, // 数组整体替换
  });
};
```

> 与 §7 的两种既有方式如何取舍：options 依赖字段**同步联动**用函数形态 `options: (ctx) => [...]`；**一次性后端加载**用 ref；需要在交互事件（change）里**命令式拉取并带 loading / 防竞态**时，用本节的 `updateItems`。

### 场景三：动态插入 / 删除整块字段

```js
// 单个：插到「出生日期」之后
formRef.value.addItems(
  { prop: "emergency", label: "紧急联系人", itemRender: { name: "ElInput" } },
  { after: "birthday" },
);

// 批量：一次插入多项（保持数组顺序）
formRef.value.addItems([fieldA, fieldB], { before: "address" });

// 批量删除：formData 中对应键一并清理
formRef.value.removeItems(["emergency", "favColor", "notify"]);
```

### 性能与实现说明

- 三个方法均为**单次 O(n) 遍历**：批量操作先一次性建立 `prop → 索引` 映射（`Map`），批量删除收集索引后倒序 `splice`，不存在逐项 `find` 的 O(n·k) 开销。
- 原地修改（`splice` / 属性赋值），不产生新数组引用，Vue 响应式只触发一次相关更新。
- 纯函数实现与 Vue/EP 解耦（基于 lodash-es 的 `castArray / isFunction / isPlainObject / isNumber / set`），可在工具脚本、单测中直接复用。

---

## 14. 声明式联动：optionsSource / disabledWhen / readonlyWhen

§13 的两类高频联动——「某字段没填时禁用/只读其他字段」「交互后请求接口刷新另一字段选项」——在父级手写时每个联动点都要重复约 15 行「change 事件 + 清空值 + loading + updateItems + 防竞态」样板代码。已下沉为组件内部的**声明式配置**：父级零事件处理器，全部由 items 声明。

> 完整演示见 [FormProLinkageDemo.vue](../../views/FormProLinkageDemo.vue)（路由 `/form-linkage`）。

### ① optionsSource：声明式异步选项

「输入/选择/切换 → 请求接口 → 刷新本字段 options」一个配置搞定：

```js
{
  prop: "resource",
  label: "资源实例",
  disabledWhen: (ctx) => !ctx.data.resourceGroup, // 未选资源组时禁用（见 ②）
  itemRender: { name: "ElSelect", props: { placeholder: "请先选择资源组" } },
  optionsSource: {
    deps: ["resourceGroup"],                 // 依赖字段：任一变化重新拉取；也支持 (data) => [data.a, data.b]
    when: (data) => !!data.resourceGroup,    // 可选：不满足时清空 options、不发请求（默认恒 true）
    fetch: (ctx) => fetchResources(ctx.deps[0]), // ctx = { data, value, prop, deps }，返回 Promise<Option[]>
    // clearValue: true,                     // 可选：deps 变化时自动清空本字段值（默认 true；false 保留已选值）
    // debounce: 400,                        // 可选：防抖毫秒（输入类依赖用；首次拉取不防抖）
  },
}
```

**内置行为**（无需父级操心）：

| 行为 | 说明 |
|---|---|
| 挂载即拉取 | `immediate`：挂载时对每项拉取一次（`when` 不满足则仅清空 options，不发请求） |
| 自动清值 | 依赖变化时先把本字段值清为控件空值（Switch→false / Checkbox→[] / 其余→""），同步回抛父级；`clearValue:false` 可关闭 |
| loading | 拉取期间自动切换 `itemRender.props.loading` |
| 防竞态 | 每个字段独立的请求序号，快速连续切换依赖时**仅最新一次**结果生效，过期结果丢弃 |
| 防抖 | `debounce` 窗口期内的连续变化合并为一次请求（挂载首次拉取不经过防抖） |
| 状态清理 | 字段被 `removeItems` 删除或组件卸载时，自动清理计时器并使在途请求失效 |

三种触发源同构——区别只在 `deps` 指向的字段控件类型：

```js
// 输入 → 防抖搜索
optionsSource: { deps: ["keyword"], debounce: 400, fetch: (ctx) => api.search(ctx.deps[0]) }
// 选择 → 立即拉取
optionsSource: { deps: ["group"], fetch: (ctx) => api.list(ctx.deps[0]) }
// 切换 → when 守卫
optionsSource: { deps: ["enabled"], when: (d) => d.enabled === true, fetch: () => api.listAll() }
```

> 与 `itemRender.options` **互斥**：配置 `optionsSource` 后 options 由其接管（静态 options 会在首次拉取/守卫时被覆盖）。

### ② disabledWhen / readonlyWhen：动态禁用 / 只读

```js
{ prop: "contact", label: "联系人", itemRender: { name: "ElInput" } },
{
  prop: "phone",
  label: "联系电话",
  disabledWhen: (ctx) => !ctx.data.contact,   // 联系人为空时禁用
  itemRender: { name: "ElInput" },
},
{
  prop: "note",
  label: "备用说明",
  readonlyWhen: (ctx) => !ctx.data.contact,   // 联系人为空时只读
  itemRender: { name: "ElInput" },
},
// 多条件：部门 / 职位任一未选时禁用
{
  prop: "entryDate",
  label: "入职日期",
  disabledWhen: (ctx) => !ctx.data.dept || !ctx.data.position,
  itemRender: { name: "ElDatePicker", props: { type: "date", valueFormat: "YYYY-MM-DD" } },
},
```

- `ctx = { value, prop, data }`（与函数形态 options 一致），`data` 为当前表单数据。
- 求值发生在 render 期间，**依赖字段变化时自动重渲染**，无需 `watch` + `updateItems`。
- 与静态 `itemRender.props.disabled / readonly` 为「或」关系：静态 `true` 恒生效，动态侧只追加不覆盖。
- `readonly` 仅对支持该属性的控件有效（ElInput 等）；ElSelect / ElDatePicker 等选择类控件请用 `disabledWhen`。

---

## 15. 父子数据同步：三方合并（同 tick 双向写入不丢失）

FormPro 内部维护一份 `formData`（为补全默认值、隐藏值保留等能力），与父级 `v-model` 双向同步。同一 tick 内可能同时存在两股写入：

1. **子级待发出的 emit**：用户在控件里操作，`setField` 已改内部数据，但 emit 尚未 flush；
2. **父级直接写入**：如 change 事件处理器里 `formData.value.xxx = ""`。

早期版本中，①的 emit 基于子级旧状态生成快照，会**覆盖**②刚写入的值——表现为「父级改 formData + updateItems 同一 tick 不生效，必须 `nextTick` 才能生效」。

现已在内部改为**三方合并**：记录最近一次父子达成一致的数据快照 `lastSyncedData`，同步时逐键对比判定「父级改了 / 子级改了 / 都改了（父级优先）/ 都没改」，并在**回抛前先把父级的在途写入合并进内部**再生成快照。效果：

- change 事件里直接改 `formData.value` + `updateItems` **即时生效，父级无需 nextTick**；
- 同 tick 内子级改 x、父级改 y，两侧修改都保留，互不覆盖；
- `removeItems` 删除的字段键不会被在途快照「复活」。

对父级完全透明——既有代码行为不变，只是不再需要 `nextTick` 兜底。

---

## 16. 紧凑型表单（compact）

开启 `compact` 后表单以更紧凑的密度渲染，适用于弹窗内、高密度录入等场景；默认 `false`，完全向后兼容，仅显式开启时生效（与 `border` 组合时边框表格样式优先，不受间隔收紧影响）。

```html
<FormPro v-model="formData" :items="items" compact :error-tip-duration="3" />
```

与常规表单的差异：

| 维度 | 常规 | 紧凑（compact） |
|---|---|---|
| item 垂直间隔 | 18px | **6px**；若所在可视行内**任一项配置了 `tip`**，则整行保持默认间隔——tip 文案悬浮于控件下方（绝对定位），需要原生间隔容纳，且保证同行各项水平对齐 |
| label 与控件距离 | label 右内边距 12px / label-top 下外边距 8px | **减半**：`labelPosition` 为 `left`/`right` 时右内边距 6px；`top` 时下外边距 4px |
| 校验错误提示 | 控件下方 `.el-form-item__error` 文案 | **el-tooltip** 锚定在 item 右上角（`placement="top-end"`）：error 主色调背景、白色文字、内边距 2px；z-index 按「所在层」动态计算——位于 el-dialog 内时取**该 dialog 遮罩层 z-index + 1**（无论其 z-index 多大都浮在本层内容之上，但允许被后续打开的嵌套 dialog 遮挡，不越层）；不在 dialog 内时为 32 位整型最大值 |
| 错误提示时长 | 持续显示 | 展示 `errorTipDuration` 秒（默认 **3**）后自动隐藏；`<=0` 表示不自动隐藏 |

行为细节：

- 错误 tooltip 由 `validate` 事件驱动：校验不通过即显示并重新计时；字段恢复通过、`clearValidate` / `resetFields` 时立即隐藏。tooltip 为受控模式，hover / 点击等交互不会改变其显隐。
- 自动隐藏**只收起气泡，从不清除校验状态**——`el-form-item` 的 `is-error` 类保留，控件的错误样式（如输入框红色边框）在 tooltip 隐藏后不变，直到重新校验通过。
- 紧凑模式下原生错误文案由样式隐藏，原有「错误文案 title 悬浮补全」等能力随之不参与渲染，其余能力（tip 填写提示、分组、动态显隐等）不受影响。

---

