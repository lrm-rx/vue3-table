/**
 * FormPro 配置处理纯函数（与渲染解耦，便于单测）。
 *
 * 配置模型（与 vxe-form 配置式表单对齐 + 扩展）：
 *
 *   // 表单级 props：
 *   //   modelValue / v-model : 表单数据对象
 *   //   items                : 配置数组（见下）
 *   //   span                 : 默认每项占位列数（24 栅格），默认 24
 *   //   gutter               : el-row 间距，默认 0
 *   //   onlyRequired         : 仅显示必填项，默认 false
 *   //   其余属性全部透传给 el-form（labelWidth / labelPosition / rules / inline / disabled ...）
 *
 *   // item 配置：
 *   {
 *     // —— 分组标记（出现后，后续 field 项归入该分组，直到下一个分组或末尾）——
 *     group: true,            // 标记为分组头
 *     title: '基本信息',       // 分组标题
 *     fold: false,            // 是否默认折叠（true=收起）
 *     // —— 普通表单项 ——
 *     field: 'username',      // 字段名（v-model 键）
 *     label: '用户名',         // el-form-item label
 *     span: 12,               // 该项栅格占位（优先级 > 表单级 span）
 *     required: true,         // 必填（驱动 onlyRequired 过滤 + 显示星号）
 *     rules: [],              // el-form-item 校验规则（也可由 el-form rules 统一提供）
 *     visible: true,          // 静态显隐
 *     visibleMethod: (data) => boolean,  // 动态显隐（data 为当前表单数据）
 *     // 控件渲染三选一（优先级 render > slot > itemRender）：
 *     render: (h, ctx) => h(...),   // JSX 渲染函数；ctx = { value, field, data, form }
 *     slot: 'username',             // 引用外部具名插槽 #username，props { value, field, data, form }
 *     itemRender: {                 // 配置式渲染（element-plus 组件名 + props + options）
 *       name: 'ElInput',
 *       props: { placeholder: '请输入' },
 *       options: [{ label, value }],  // ElSelect/ElRadio/ElCheckbox 选项
 *       events: { change: () => {} },
 *     },
 *   }
 *
 *   // 插入项（无 field，在表单项之间插入任意组件/元素，不包裹 el-form-item）：
 *   { slot: 'divider' }            // 引用外部具名插槽
 *   { render: (h) => h('div', '分隔') }  // JSX
 *   { span: 24 }  // 可带 span 控制占位宽度，默认 24（整行）
 */

/** 24 栅格总数 */
export const GRID_COLS = 24;

/**
 * 判断一个 item 是否为分组头。
 */
export const isGroupItem = (item) => !!item && item.group === true;

/**
 * 判断一个 item 是否为「插入项」（无 field 且非分组头，在表单项之间插入元素）。
 */
export const isInsertItem = (item) =>
  !!item && !isGroupItem(item) && item.field === undefined;

/**
 * 判断一个 item 是否为「字段项」（带 field 的普通表单项）。
 */
export const isFieldItem = (item) =>
  !!item && !isGroupItem(item) && item.field !== undefined;

/**
 * 判定字段项是否必填：item.required 显式为 true，
 * 或其 rules（含 el-form 统一 rules[field]）中存在 required:true。
 */
export const isItemRequired = (item, formRules = {}) => {
  if (!item || item.field === undefined) return false;
  if (item.required === true) return true;
  const rules = [
    ...(Array.isArray(item.rules) ? item.rules : []),
    ...(Array.isArray(formRules[item.field]) ? formRules[item.field] : []),
  ];
  return rules.some((r) => r && r.required === true);
};

/**
 * 判定字段项当前是否可见：
 *   visible === false  → 隐藏
 *   visibleMethod(data) === false → 隐藏
 *   onlyRequired && 非必填 → 隐藏
 *   分组折叠 → 分组内所有项隐藏（由渲染层处理，此处只看单 item）
 */
export const isItemVisible = (item, { data, onlyRequired, formRules } = {}) => {
  if (!item) return false;
  if (item.visible === false) return false;
  if (typeof item.visibleMethod === "function" && item.visibleMethod(data) === false)
    return false;
  if (onlyRequired && isFieldItem(item) && !isItemRequired(item, formRules))
    return false;
  return true;
};

/**
 * 解析 item 的栅格占位：item.span 优先，否则回退表单级 span（默认 24）。
 * 越界值钳制到 [1, 24]。
 */
export const resolveSpan = (item, formSpan = GRID_COLS) => {
  const raw = item?.span != null ? item.span : formSpan;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > GRID_COLS) return GRID_COLS;
  return Math.round(n);
};

/**
 * 将扁平 items 配置切分为「分组块」。
 * 返回结构：[{ group: groupItem|null, items: fieldOrInsertItems[] }]
 * 分组头之前的项归入匿名组（group: null）。
 */
export const splitIntoGroups = (items = []) => {
  const blocks = [];
  let current = { group: null, items: [] };
  for (const item of items) {
    if (isGroupItem(item)) {
      blocks.push(current);
      current = { group: item, items: [] };
    } else {
      current.items.push(item);
    }
  }
  blocks.push(current);
  // 丢弃完全空的匿名组
  return blocks.filter((b) => b.group || b.items.length > 0);
};

/**
 * 计算（在给定数据下）某分组块内「实际可见」的有序条目列表，
 * 直接用于渲染：隐藏项被排除，后续项自然前移（el-col 流式布局自动回流）。
 *
 * 返回的每个条目带解析后的 span，供渲染层直接使用。
 */
export const resolveVisibleEntries = (
  blockItems = [],
  { data, onlyRequired, formRules, formSpan } = {},
) => {
  const out = [];
  for (const item of blockItems) {
    // 插入项：始终可见（不受 onlyRequired 影响），除非显式 visible:false / visibleMethod 隐藏
    if (isInsertItem(item)) {
      if (item.visible === false) continue;
      if (
        typeof item.visibleMethod === "function" &&
        item.visibleMethod(data) === false
      )
        continue;
      out.push({ kind: "insert", item, span: resolveSpan(item, formSpan) });
      continue;
    }
    // 字段项
    if (isItemVisible(item, { data, onlyRequired, formRules })) {
      out.push({
        kind: "field",
        item,
        span: resolveSpan(item, formSpan),
        required: isItemRequired(item, formRules),
      });
    }
  }
  return out;
};
