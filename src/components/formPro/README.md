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
| `groupCollapsible` | Boolean | `true` | 分组默认是否可折叠（`group.collapsible` 可覆盖） |
| `removeHiddenValues` | Boolean | `false` | 移除因 `visible`/`visibleMethod` 隐藏的字段值（见 §6） |
| `autoFillDefaults` | Boolean | `true` | 按 items 自动补全缺失字段的默认值（见 §5） |

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
| `defaultValue` | 该字段固定默认值（autoFill 时优先级最高） |
| `itemRender` | `{ name, props, options }` 渲染内置控件（ElInput/ElSelect/...） |
| `render(h, ctx)` | JSX 自定义渲染控件，`ctx = { value, data }` |
| `slot` | 引用外部具名插槽渲染（字段控件 / 插入项 / 分组标题扩展区） |
| `visible` / `visibleMethod(data)` | 条件显隐（`visibleMethod` 返回 `false` 表示隐藏） |
| `removeValueOnHidden` | 项级：隐藏时是否移除值（覆盖表单级 `removeHiddenValues`） |
| `folding` | 是否为折叠表单项（配合 `collapseNode`） |
| `itemProps` | 透传给 `<el-form-item>` 的额外属性 |
| `titlePrefix`/`titleSuffix`/`titlePrefixTip`/`titleSuffixTip`/`titleBold` | 标题前后缀图标与提示 |

**分组头**：`{ group: true, title, fold, collapsible, allToggle, render, slot }`。

**插入项**：无 `prop`，用 `slot` 或 `render` 在表单项之间插入任意内容（`span: 24` 占整行）。

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
- `formData` —— 内部完整数据（含隐藏字段值）

---

## 5. 初始值自动补全（autoFillDefaults）

表单项很多时，不必把每个字段的空默认值都写出来。开启 `autoFillDefaults`（默认开）后，组件按 `items` 配置**自动补全缺失字段**的默认值：

| 控件 | 默认值 |
|---|---|
| `ElSwitch` | `false` |
| `ElCheckboxGroup` | `[]` |
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

## 7. ⚠️ 注意：watch formData → 改 items 会不会死循环？

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

## 8. 事件

`defineEmits` 仅声明 `update:modelValue`；`inheritAttrs: false`，其余 `onXxx` 监听器全部进入 `$attrs` 并原样透传到内部 `<el-form>`。因此 **el-form 的原生事件（如 `validate`）及任意自定义事件均正常触发**，无需手动重 emit。
