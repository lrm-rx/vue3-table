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
 *     // —— 分组标记（出现后，后续 prop 项归入该分组，直到下一个分组或末尾）——
 *     group: true,            // 标记为分组头
 *     title: '基本信息',       // 分组标题
 *     fold: false,            // 是否默认折叠（true=收起）
 *     // —— 普通表单项 ——
 *     prop: 'username',       // 字段名（v-model 键，对应 el-form-item 的 prop）
 *     label: '用户名',         // el-form-item label
 *     span: 12,               // 该项栅格占位（优先级 > 表单级 span）
 *     required: true,         // 必填（驱动 onlyRequired 过滤 + 显示星号）
 *     rules: [],              // el-form-item 校验规则（也可由 el-form rules 统一提供）
 *     visible: true,          // 静态显隐
 *     visibleMethod: (data) => boolean,  // 动态显隐（data 为当前表单数据）
 *     removeValueOnHidden: true, // 隐藏时是否移除其值（提交时不传）；覆盖表单级 removeHiddenValues
 *     // 控件渲染三选一（优先级 render > slot > itemRender）：
 *     render: (h, ctx) => h(...),   // JSX 渲染函数；ctx = { value, prop, data, form }
 *     slot: 'username',             // 引用外部具名插槽 #username，props { value, prop, data, form }
 *     itemRender: {                 // 配置式渲染（element-plus 组件名 + props + options）
 *       name: 'ElInput',
 *       props: { placeholder: '请输入' },
 *       options: [{ label, value }],  // ElSelect/ElRadio/ElCheckbox 选项
 *       events: { change: () => {} },
 *     },
 *   }
 *
 *   // 插入项（无 prop，在表单项之间插入任意组件/元素，不包裹 el-form-item）：
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
 * 判断一个 item 是否为「折叠触发节点」（vxe-form 的 collapseNode：渲染展开/收起按钮）。
 * 内部使用。
 */
const isCollapseNode = (item) => !!item && item.collapseNode === true;

/**
 * 判断一个 item 是否为「可折叠项」（vxe-form 的 folding：默认收起时隐藏）。
 * 内部使用。
 */
const isFoldingItem = (item) => !!item && item.folding === true;

/**
 * 判断一个 item 是否为「插入项」（无 prop 且非分组头，在表单项之间插入元素）。
 */
export const isInsertItem = (item) =>
  !!item && !isGroupItem(item) && item.prop === undefined;

/**
 * 判断一个 item 是否为「字段项」（带 prop 的普通表单项）。
 */
export const isFieldItem = (item) =>
  !!item && !isGroupItem(item) && item.prop !== undefined;

/**
 * 判定字段项是否必填：item.required 显式为 true，
 * 或其 rules（含 el-form 统一 rules[prop]）中存在 required:true。
 */
export const isItemRequired = (item, formRules = {}) => {
  if (!item || item.prop === undefined) return false;
  if (item.required === true) return true;
  const rules = [
    ...(Array.isArray(item.rules) ? item.rules : []),
    ...(Array.isArray(formRules[item.prop]) ? formRules[item.prop] : []),
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
 * 仅判定字段项是否因「可见性配置」（visible / visibleMethod）被隐藏。
 * 与 isItemVisible 的区别：不考虑 onlyRequired，也不考虑分组折叠。
 * 用于「提交时移除隐藏项的值」——onlyRequired 隐藏的项需要保留其值。
 */
export const isHiddenByVisibility = (item, data = {}) => {
  if (!isFieldItem(item)) return false;
  if (item.visible === false) return true;
  if (typeof item.visibleMethod === "function" && item.visibleMethod(data) === false)
    return true;
  return false;
};

/**
 * 收集所有「因可见性隐藏且需要在提交时移除值」的字段 prop 集合。
 *
 * @param {Array}  items                 表单配置数组
 * @param {Object} data                  当前表单数据（用于 visibleMethod 判定）
 * @param {Boolean} removeHiddenValues   表单级默认开关（item.removeValueOnHidden 可单独覆盖）
 * @returns {Set<string>} 需要移除值的字段 prop 集合
 *
 * 规则：
 *  - 仅统计 isHiddenByVisibility 为 true 的字段（visible / visibleMethod 隐藏）；
 *  - onlyRequired 导致的隐藏不计入（其值需保留）；
 *  - 每项是否移除：item.removeValueOnHidden 显式指定时优先，否则跟随表单级 removeHiddenValues。
 */
export const collectHiddenValueProps = (
  items = [],
  data = {},
  removeHiddenValues = false,
) => {
  const set = new Set();
  for (const item of items) {
    if (isGroupItem(item)) continue;
    if (!isHiddenByVisibility(item, data)) continue;
    const shouldRemove =
      item.removeValueOnHidden != null
        ? !!item.removeValueOnHidden
        : !!removeHiddenValues;
    if (shouldRemove) set.add(item.prop);
  }
  return set;
};

/**
 * 收集配置中所有「字段项」的 prop（去重，保持出现顺序）。
 * 用于自动补全初始值、统一处理等场景。
 */
export const collectFieldProps = (items = []) => {
  const set = new Set();
  for (const item of items) {
    if (isFieldItem(item)) set.add(item.prop);
  }
  return [...set];
};

/**
 * 根据字段项的控件类型推导一个「合理的空默认值」，避免用户逐个声明 ""。
 * 推导规则（基于 itemRender.name，忽略大小写）：
 *   - Switch        → false
 *   - CheckboxGroup → []
 *   - 其余（Input/Select/Radio/DatePicker/InputNumber…）→ ""
 * 若 item 显式声明了 defaultValue，则优先使用它（作为该项的固定默认值）。
 */
export const deriveDefaultValue = (item) => {
  if (item && item.defaultValue !== undefined) return item.defaultValue;
  const name = String(item?.itemRender?.name || "").toLowerCase();
  if (name.includes("switch")) return false;
  if (name.includes("checkbox")) return [];
  return "";
};

/**
 * 基于 items 配置生成「完整初始值对象」：
 * 每个字段项都有值（显式 defaultValue 或按控件类型推导的空默认值），
 * 再用 overrides（用户传入的 modelValue）覆盖——用户只写有意义的非空默认值即可。
 *
 * @param {Array} items      表单配置
 * @param {Object} overrides 用户提供的初始值（优先级最高，已存在的键不被默认值覆盖）
 * @returns {Object} 补全后的初始值对象（新对象，不修改入参）
 */
export const buildInitialData = (items = [], overrides = {}) => {
  const base = {};
  for (const item of items) {
    if (!isFieldItem(item)) continue;
    base[item.prop] = deriveDefaultValue(item);
  }
  return { ...base, ...(overrides || {}) };
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
  { data, onlyRequired, formRules, formSpan, foldingCollapsed = true } = {},
) => {
  const out = [];
  for (const item of blockItems) {
    // 折叠触发节点：始终可见，单独标记（不受 onlyRequired / 显隐影响）
    // 默认占位为整行 24（不随 columns 推导），可由 item.span 单独覆盖
    if (isCollapseNode(item)) {
      out.push({ kind: "collapseNode", item, span: resolveSpan(item, GRID_COLS) });
      continue;
    }
    // 可折叠项：处于收起状态时直接隐藏
    if (isFoldingItem(item) && foldingCollapsed) continue;
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
