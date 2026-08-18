# vue3-vxe-table

基于 **vxe-grid v4** 二次封装的高级表格组件 `TablePro`，集成远程/静态数据模式、表头过滤、列排序、单元格编辑、单/多选、工具栏、列个性化设置等常用能力，并对配置做了大量简化。

## 技术栈

- Vue 3 + Vite + JSX（`@vitejs/plugin-vue-jsx`）
- vxe-table `~4.20.12` + vxe-pc-ui `~4.17.1`
- Element Plus（编辑控件、分页、加载遮罩）
- Sass（modern API）

## 目录结构

```
src/
├─ components/tablePro/
│  ├─ index.vue              # TablePro 主组件
│  ├─ renderers.js           # 表头过滤渲染器（FilterInput / FilterCheckbox / FilterDateRange / FilterNumberRange）
│  ├─ filter-config.js       # 过滤默认值与激活判断
│  ├─ cell-renderers.js       # 单元格编辑渲染器（ElInput / ElSelect / ElRadio / ... ）
│  └─ components/
│     ├─ FilterPanel.vue      # 过滤面板（共用，4 种过滤器仅 name 不同）
│     ├─ FilterInput.vue
│     ├─ FilterCheckbox.vue
│     ├─ FilterDateRange.vue
│     ├─ FilterNumberRange.vue
│     └─ Pagination.vue
├─ hooks/
│  ├─ useTable.js             # 远程数据请求封装
│  └─ useSelection.js         # 单选/多选收集
└─ api/                       # 示例接口
```

## 核心特性

- **配置简化**：列里写 `filterType: 'FilterInput'` 即自动注入完整过滤配置；公共列配置（`showOverflow` / `minWidth`）已内置默认值
- **JSX 渲染**：列 `render: (params, h) => VNode` 即可自定义只读单元格，无需在 template 写具名插槽
- **可编辑单元格**：`editRender` 支持对象式 / 函数式 / 字符串插槽式三种配置，自动对接 Element Plus 控件
- **远程 + 静态双模式**：传 `requestApi` 进入远程模式（内置 `useTable`），否则使用 `data` 静态模式
- **表头过滤 4 种**：FilterInput / FilterCheckbox / FilterDateRange / FilterNumberRange，支持远程选项接口
- **远程排序参数可定制**：`sortParamConfig` 控制排序参数 key 名与格式（含合并模式 `orderBy=field desc`）
- **vxe-grid 原生能力透传**：列拖拽排序、固定左/右、显示隐藏、缩放、查找替换、右键菜单等

---

## 快速开始

### 静态数据模式

```vue
<script setup>
import { ref } from "vue";

const columns = ref([
  { type: "seq", width: 60, title: "序号" },
  { field: "username", title: "姓名" },
  { field: "age", title: "年龄" },
]);

const data = ref([
  { id: 1, username: "张三", age: 20 },
  { id: 2, username: "李四", age: 25 },
]);
</script>

<template>
  <TablePro :columns="columns" :data="data" height="auto" />
</template>
```

### 远程数据模式

```vue
<script setup>
import { ref } from "vue";
import { getUserListApi } from "@/api";

const columns = ref([
  { field: "username", title: "姓名", sortable: true, filterType: "FilterInput" },
]);

const initParam = ref({
  pageNum: 1,
  pageSize: 20,
  sortField: "createTime",
  sortOrder: "desc",
});

const onDataCallback = (data) => {
  // 对返回数据二次处理
  return data;
};

const onRequestError = (err) => console.error(err);
</script>

<template>
  <TablePro
    :columns="columns"
    :request-api="getUserListApi"
    :request-auto="true"
    :data-callback="onDataCallback"
    :request-error="onRequestError"
    :init-param="initParam"
    height="auto"
  />
</template>
```

---

## 列配置（columns）

`columns` 是 vxe-grid 原生 `columns` 的超集，TablePro 在原基础上扩展了 4 个简写字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `field` | string | 数据字段名 |
| `title` | string | 列标题 |
| `type` | `'seq' \| 'checkbox' \| 'radio' \| 'expand'` | 特殊列类型 |
| `width` / `minWidth` | number | 列宽 |
| `fixed` | `'left' \| 'right'` | 固定列 |
| `sortable` | boolean | 是否可排序 |
| `align` / `headerAlign` | `'left' \| 'center' \| 'right'` | 对齐方式 |
| `children` | array | 父分组列的子列（多级表头） |
| **`filterType`** | `'FilterInput' \| 'FilterCheckbox' \| 'FilterDateRange' \| 'FilterNumberRange'` | **TablePro 扩展**：自动注入完整过滤配置 |
| **`defParamKey`** | string | **TablePro 扩展**：自定义该列过滤参数的 key 名（默认为 `field`） |
| **`render`** | `(params, h) => VNode` \| `string` | **TablePro 扩展**：只读单元格 JSX 渲染，或字符串引用外部具名插槽 |
| **`headerRender`** | `(params, h) => VNode` \| `string` | **TablePro 扩展**：表头 JSX 渲染，或字符串引用外部具名插槽 |
| **`editRender`** | `object` \| `function` \| `string` | **TablePro 扩展**：可编辑单元格配置（详见下文） |
| `filterRender` | object | vxe 原生过滤渲染器配置（一般由 `filterType` 自动注入，需自定义时手写） |
| `filters` | array | vxe 原生过滤配置（一般由 `filterType` 自动注入） |
| `slots` | object | vxe 原生列 slots（`default` / `header` / `edit`） |

### 公共列配置（defaultColumnConfig）

对所有列自动合并（列自身配置优先级更高），内置默认值：

```js
{ showOverflow: "tooltip", minWidth: 120 }
```

可通过 `:default-column-config` 覆盖或扩展。

---

## 单元格编辑（editRender）

支持三种形式，**优先级：用户显式 `slots.edit` > `editRender`**：

### 1. 对象式（推荐）

通过 `name` 映射到 Element Plus 组件，自动管理本地编辑态 + 选项回退：

```js
{
  field: "username",
  editRender: { name: "ElInput" },            // 简单输入框
}
{
  field: "department",
  editRender: { name: "ElSelect" },            // 下拉（选项从 editOptions 注入）
}
{
  field: "status",
  editRender: {
    name: "ElSwitch",
    props: {                                   // Element Plus 组件 props
      activeValue: 1,
      inactiveValue: 0,
      inlinePrompt: true,
    },
  },
}
```

支持的 `name`：

| name | 组件 | 需 options |
| --- | --- | --- |
| `ElInput` / `ElInputNumber` | 输入框 / 数字输入框 | 否 |
| `ElSelect` | 下拉选择 | 是 |
| `ElRadio` / `ElRadioButton` | 单选 / 按钮单选 | 是 |
| `ElCheckbox` / `ElCheckboxButton` | 多选 / 按钮多选 | 是 |
| `ElDatePicker` / `ElTimePicker` | 日期 / 时间选择 | 否 |
| `ElSwitch` / `ElRate` | 开关 / 评分 | 否 |

### 2. 函数式 JSX（完全自定义）

```js
{
  field: "phone",
  editRender: (params, h) => {
    const { row, field } = params;
    return (
      <ElInput
        modelValue={row[field]}
        onUpdate:modelValue={(v) => { row[field] = v; }}
        placeholder="请输入手机号"
        clearable
      />
    );
  },
}
```

`params` 标准化字段：`row / column / field / cellValue / rowIndex / columnIndex / $table`。函数式下编辑态值需用户自行管理（如直接 `v-model` 绑 `row[field]`），退出编辑由 vxe `edit-closed` 统一提交。

### 3. 字符串式（引用外部具名插槽）

```js
{
  field: "email",
  editRender: "edit_email",    // 引用 <template #edit_email>
}
```

```vue
<template #edit_email="{ row }">
  <el-input v-model="row.email" placeholder="请输入邮箱" clearable />
</template>
```

### 编辑选项与公共 props

- `:edit-options="{ [field]: [{ label, value, disabled? }] }"`：Select / Radio / Checkbox 等需要 options 的控件选项数组（推荐单独传递，不污染 columns）
- `:cell-edit-props="{ [field]: { placeholder, size, disabled, clearable, ... } }"`：各列编辑控件的额外公共 props（优先级最高）

### 编辑完成事件

```vue
<TablePro @cell-edit-change="onCellEditChange" />
```

```js
const onCellEditChange = ({ row, column, field, value, cellValue }) => {
  // value: 新值；cellValue: 旧值
};
```

### 权限控制：全局禁用编辑（`editable` prop）

通过 `:editable="false"` 全局关闭单元格编辑能力（典型用于无编辑权限的用户）：

```vue
<TablePro :columns="columns" :editable="hasEditPermission" />
```

`editable=false` 时组件行为：

- **表头不显示编辑图标**：不设置 `col.editable`，vxe-grid 不会渲染编辑态标识
- **点击单元格不进入编辑态**：不传 `editConfig` 给 vxe-grid，即使列配置了 `editRender` 也不会触发编辑（不会渲染禁用态的输入控件，符合"不可见即不可编辑"的权限要求）
- **对象式 `editRender` 的 label 回退仍生效**：`slots.default` 仍按 `editOptions` 显示 label 文本（仅显示，不可编辑）
- **函数式 / 字符串式 `editRender`**：完全不构建 `slots.edit`，`editRender` 仍会被删除以避免 vxe 校验警告
- **`editOptions` / `cellEditProps`**：可正常传递（用于 label 回退显示），不会触发编辑

---

## 表头过滤（filterType）

列上配置 `filterType` 即自动注入完整过滤配置（`filters` + `filterRender`），无需手写：

| filterType | 面板组件 | data 结构 | 参数 key |
| --- | --- | --- | --- |
| `FilterInput` | 输入框 | `{ value: '' }` | `[field]: '关键字'` |
| `FilterCheckbox` | 多选 + 搜索 | `{ values: [], search: '' }` | `[field]: ['v1', 'v2']` |
| `FilterDateRange` | 日期区间 | `{ values: [start, end] }` | `[startField, endField]` 或 `[field]` 数组 |
| `FilterNumberRange` | 数字区间 | `{ values: [min, max] }` | 同上，`paramMode` 控制呈现 |

### 自定义参数 key

```js
{ field: "role", defParamKey: "roleList", filterType: "FilterCheckbox" }
// 提交参数：{ roleList: ['admin', 'developer'] }
```

### 日期/数字区间参数模式（filterRender.props.paramMode）

| paramMode | 参数呈现 |
| --- | --- |
| `'array'`（默认） | `age: [min, max]` |
| `'split'` | `ageMin: min, ageMax: max` |
| `'both'` | 两种都传 |

日期区间可通过 `filterRender.props.startKey` / `endKey` 自定义字段名（默认 `[field]Start` / `[field]End`）。

### 远程过滤选项

```vue
<TablePro
  :request-filter-api="(params) => getFilterOptionsApi(params)"
  :filter-data-callback="(data) => data"
  :filter-option-keys="{ label: 'name', value: 'code' }"
/>
```

`requestFilterAPI` 接收 `{ field, filters }`，返回 Promise<选项数组>。FilterCheckbox 列打开过滤面板时自动拉取。

### 过滤相关方法/事件

- 暴露方法：`getFilterParams()`、`getFilterSortState()`、`resetAllFilter()`、`resetColumnFilter({ field })`
- 事件：`@filter-confirm`、`@filter-reset`、`@filter-reset-all`、`@reset-filter`

---

## 排序（sortConfig）

默认配置：`{ remote: true, multiple: false, trigger: 'button' }`。

### 远程排序参数定制（sortParamConfig）

```js
// 默认（非合并模式）
:sort-param-config="{}"
// 单字段：params.sortField='createTime'  params.sortOrder='desc'
// 多字段：params.sortField='a,b'         params.sortOrder='asc,desc'

// 合并模式
:sort-param-config="{
  combined: true,
  combinedKey: 'orderBy',
  combinedSeparator: ' ',          // 字段与方向之间
  combinedMultiSeparator: ','     // 多字段项之间
}"
// 单字段：params.orderBy='createTime desc'
// 多字段：params.orderBy='createTime desc,username asc'
```

### 默认排序（initParam）

```js
const initParam = ref({
  sortField: "createTime",
  sortOrder: "desc",
});
```

---

## 选择（单选 / 多选）

列配置 `{ type: 'checkbox' }` 或 `{ type: 'radio' }` 即可启用。`rowConfig.keyField` 默认为 `'id'`，用于行唯一标识。

通过 `ref` 暴露的 `useSelection` 收集结果：

```js
const tableProRef = ref();

// 多选
tableProRef.value.selectedList;        // 选中行数组
tableProRef.value.selectedListIds;    // 选中 id 数组
tableProRef.value.isSelected(row);    // 某行是否选中
tableProRef.value.clearSelection();   // 清空选择

// 单选
tableProRef.value.selectedRow;        // 选中行
tableProRef.value.selectedId;         // 选中 id
```

事件：`@checkbox-change`、`@checkbox-all`、`@radio-change`。

---

## 工具栏

| prop | 默认 | 说明 |
| --- | --- | --- |
| `showToolbar` | `true` | 是否显示工具栏 |
| `showRefresh` | `true` | 内置刷新按钮 |
| `showColumnSetting` | `true` | 列个性化设置按钮（拖拽排序 / 固定 / 显示隐藏） |
| `showExport` | `true` | 导出 CSV 按钮 |
| `showSearch` | `true` | 工具栏右侧搜索框 |
| `showDensity` | `true` | 密度切换 |
| `showResetFilter` | `true` | 重置所有过滤条件按钮 |
| `customStorage` | `false` | 是否记忆列状态到 localStorage（需配合 `tableId`） |
| `toolbarConfig` | `{}` | 额外 vxe toolbar 配置（与默认合并） |
| `customConfig` | `{}` | 额外 vxe custom 配置 |

事件：`@refresh`、`@export`、`@search`、`@density-change`、`@toolbar-button-click`。

---

## 插槽

### 工具栏插槽

```vue
<template #toolbarButtons="{ selectedList, clearSelection }">
  <el-button type="primary">批量操作</el-button>
</template>

<template #toolbarToolSuffix>
  <!-- 工具栏右侧自定义内容 -->
</template>
```

### 单元格 / 表头插槽（具名）

约定前缀：`cell_` / `edit_` / `header_`，自动透传到对应列：

```vue
<TablePro :columns="columns">
  <!-- 对应 columns[i].render: 'cell_phone' 或列 field 为 phone -->
  <template #cell_phone="{ row }">
    <el-tag>{{ row.phone }}</el-tag>
  </template>

  <!-- 对应 columns[i].editRender: 'edit_email' -->
  <template #edit_email="{ row }">
    <el-input v-model="row.email" />
  </template>

  <!-- 对应 columns[i].headerRender: 'header_phone' -->
  <template #header_phone="{ column }">
    <span style="color: var(--el-color-primary)">{{ column.title }}</span>
  </template>
</TablePro>
```

也可在列配置中直接写 `render: 'cell_role'`（字符串引用外部具名插槽名）。

---

## 暴露方法（defineExpose）

通过 `ref` 调用：

| 方法 | 说明 |
| --- | --- |
| `gridRef` | vxe-grid 实例（直接调用 vxe 原生方法） |
| `getData()` | 获取当前全量数据 |
| `getCheckboxRecords()` | 多选选中行 |
| `getRadioRecord()` | 单选选中行 |
| `setCheckboxRow(rows, checked)` | 设置多选 |
| `clearCheckboxRow()` / `clearRadioRow()` | 清空选择 |
| `clearSelection()` | 清空单选 + 多选 |
| `scrollTo(x, y)` / `scrollToRow(row)` / `scrollToColumn(col)` | 滚动定位 |
| `clearSort()` / `clearFilter()` | 清空排序 / 过滤 |
| `exportData(opts)` | 导出 |
| `resetAllFilter()` / `resetColumnFilter({ field })` | 重置过滤 |
| `getFilterParams()` | 当前过滤扁平参数（不含排序） |
| `getFilterSortState()` | 当前「过滤 + 排序」组合状态 |
| `currentPager` | 当前分页配置（computed） |
| `getTableList()` / `search()` / `reset()` | 远程模式数据请求（useTable） |
| `tableData` / `pageable` / `searchParam` | 远程模式响应式状态 |

---

## Props 速查

| prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `columns` | Array | `[]` | 列配置 |
| `data` | Array | `[]` | 静态数据 |
| `height` | String \| Number | `'auto'` | 表格高度 |
| `stripe` | Boolean | `true` | 斑马纹 |
| `border` | Boolean \| String | `true` | 边框 |
| `round` | Boolean | `false` | 圆角 |
| `tableId` | String | `''` | 列状态记忆隔离（开启 customStorage 必填） |
| `rowConfig` | Object | `{ keyField: 'id' }` | 行配置 |
| `checkboxConfig` / `radioConfig` | Object | `{}` | 多选 / 单选配置 |
| `sortConfig` | Object | `{ remote: true, multiple: false, trigger: 'button' }` | 排序配置 |
| `sortParamConfig` | Object | `{}` | 排序参数 key 定制 |
| `filterConfig` | Object | `{ remote: true, transfer: true }` | 过滤配置 |
| `treeConfig` / `expandConfig` / `columnConfig` | Object | `{}` | 树 / 展开 / 列配置 |
| `editConfig` | Object | `{ trigger: 'click', mode: 'cell', showStatus: true, keepSource: true }` | 编辑配置 |
| `editable` | Boolean | `true` | 全局可编辑开关（权限控制），`false` 时所有列不可编辑：表头无编辑图标、点击不进入编辑态（详见下文） |
| `pagination` | Boolean | `true` | 是否显示分页 |
| `pagerConfig` | Object | `{ currentPage: 1, pageSize: 10, total: 0 }` | 分页配置（v-model:pagerConfig） |
| `defaultColumnConfig` | Object | `{ showOverflow: 'tooltip', minWidth: 120 }` | 公共列配置 |
| `editOptions` | Object | `{}` | 编辑控件选项数组 |
| `cellEditProps` | Object | `{}` | 编辑控件公共 props |
| `requestApi` | Function | `null` | 远程数据接口（传入即进入远程模式） |
| `requestAuto` | Boolean | `true` | 挂载后是否自动请求 |
| `dataCallback` | Function | `null` | 返回数据二次处理 |
| `requestError` | Function | `null` | 请求错误监听 |
| `requestFilterAPI` | Function | `null` | 过滤选项远程接口 |
| `filterDataCallback` | Function | `null` | 过滤选项数据回调 |
| `filterOptionKeys` | Object | `{ label: 'label', value: 'value' }` | 过滤选项 label/value 键名 |
| `initParam` | Object | `{}` | 默认参数（pageNum / pageSize / sortField / sortOrder / filters） |
| `showToolbar` / `showRefresh` / `showColumnSetting` / `showExport` / `showSearch` / `showDensity` / `showResetFilter` | Boolean | `true` | 工具栏开关 |
| `customStorage` | Boolean | `false` | 列状态记忆 |
| `toolbarConfig` / `customConfig` | Object | `{}` | 额外 vxe 配置 |

---

## 事件

### TablePro 自身事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `refresh` | `{ filters, sorts, ... }` | 工具栏刷新 |
| `export` | - | 导出按钮 |
| `search` | keyword | 工具栏搜索 |
| `density-change` | size | 密度切换 |
| `toolbar-button-click` | `{ code, ... }` | 工具栏自定义按钮 |
| `update:pagerConfig` | newPager | 分页 v-model 同步 |
| `page-change` | newPager | 分页变化 |
| `sort-change` | payload | 排序变化 |
| `checkbox-change` / `checkbox-all` / `radio-change` | `{ row, ... }` | 选择变化 |
| `cell-click` / `cell-dblclick` / `row-click` / `row-dblclick` | `{ row, column, ... }` | 单元格 / 行交互 |
| `filter-confirm` / `filter-reset` / `filter-reset-all` / `reset-filter` | payload | 过滤确认 / 重置 |
| `cell-edit-change` | `{ row, column, field, value, cellValue }` | 单元格编辑完成 |

### vxe-grid 透传事件

包括但不限于：`ready`、`data-rendered`、`scroll`、`filter-change`、`filter-visible`、`edit-activated`、`edit-closed`、`cell-area-*`、`custom-*`、`fnr-*` 等全部 vxe-grid 原生事件（父组件可按同名监听）。

---

## 完整示例

参见 [src/App.vue](src/App.vue)，演示了 filterType 简化、render JSX 渲染、editRender 三种形式、editOptions/cellEditProps、远程模式、远程过滤选项、initParam 默认参数、cell-edit-change 事件等全部能力。
