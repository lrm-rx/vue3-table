import { castArray, isFunction, isNumber, isPlainObject, set as lodashSet } from "lodash-es";

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
 *     tip: '请输入真实姓名',    // 填写/选择提示：位于「校验错误提示」同一位置（控件下方），
 *                              //   颜色为 success 主色调；只要字段未校验不通过就一直显示，
 *                              //   一旦校验失败则隐藏、让位给错误提示。传空串等同不配置。
 *     visible: true,          // 静态显隐
 *     visibleMethod: (data) => boolean,  // 动态显隐（data 为当前表单数据）
 *     removeValueOnHidden: true, // 隐藏时是否移除其值（提交时不传）；覆盖表单级 removeHiddenValues
 *     // 控件渲染三选一（优先级 render > slot > itemRender）：
 *     render: (ctx, h) => h(...),  // JSX 渲染函数；ctx = { value, prop, data, form }
 *     slot: 'username',             // 引用外部具名插槽 #username，props { value, prop, data, form }
 *     itemRender: {                 // 配置式渲染（element-plus 组件名 + props + options）
 *       name: 'ElInput',
 *       props: { placeholder: '请输入' },
 *       options: [{ label, value }],  // ElSelect/ElRadio/ElCheckbox 选项，支持三种形态：
 *                                    //   ① 静态数组；② (ctx)=>Option[] 函数（ctx.data 联动）；
 *                                    //   ③ 响应式 ref（后端异步数据到位自动重渲染）
 *       events: { change: () => {} },
 *     },
 *     // 控件前后缀（在控件的前/后渲染文本或元素，非 label 区域）：
 *     prefix: '￥',                  // 字符串 → 渲染为纯文本（如货币符号、单位前缀）
 *     suffix: '元',                  // 字符串 → 渲染为纯文本（如单位、量词后缀）
 *     // 也可传函数 (ctx, h) => VNode，ctx = { value, prop, data }，
 *     // 可读取当前字段值实现动态文本，如 suffix: (ctx) => `有 ${ctx.value} 个`
 *   }
 *
 *   // 插入项（无 prop，在表单项之间插入任意组件/元素，不包裹 el-form-item）：
 *   { slot: 'divider' }            // 引用外部具名插槽
 *   { render: (ctx, h) => h('div', '分隔') }  // JSX
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
 * 解析 itemRender.options：支持「静态数组 / 函数」两种形态，
 * 统一返回选项数组（非法形态兜底为空数组）。
 *
 * 设计目的——解决选择类组件的 options 赋值痛点：
 *   1. 静态数组：options: [{ label, value }]（原有能力，原样兼容）
 *   2. 函数（级联联动）：options: (ctx) => Option[]
 *      —— ctx = { data, value, prop }，data 为当前表单数据，
 *         据此可实现「A 字段变化 → B 字段选项联动」。
 *   3. 后端异步数据：由调用方把接口结果写入响应式 ref，再以
 *      options: () => someRef.value 或直接传 ref 的形式提供；
 *      因解析发生在 render 期间，读取 ref 会被 Vue 追踪依赖，
 *      数据到位后自动重渲染，无需手动刷新。
 *
 * 注意：函数若返回 Promise / 非数组（如尚未加载完成），此处按空数组处理，
 *       渲染不会报错；异步数据请用 ref 承载，不要让 options 直接返回 Promise。
 *
 * @param {Array|Function} options  选项配置
 * @param {Object} ctx              渲染上下文 { data, value, prop }
 * @returns {Array} 选项数组
 */
export const resolveFieldOptions = (options, ctx = {}) => {
  if (typeof options === "function") {
    const resolved = options(ctx);
    return Array.isArray(resolved) ? resolved : [];
  }
  if (Array.isArray(options)) return options;
  return [];
};

/**
 * 根据字段项的控件类型推导一个「合理的空默认值」，避免用户逐个声明 ""。
 * 推导规则（基于 itemRender.name，忽略大小写）：
 *   - Switch        → false
 *   - CheckboxGroup → []
 *   - Upload / UploadPro（el-upload 系列）→ []
 *   - 其余（Input/Select/Radio/DatePicker/InputNumber…）→ ""
 * 若 item 显式声明了 defaultValue，则优先使用它（作为该项的固定默认值）。
 */
export const deriveDefaultValue = (item) => {
  if (item && item.defaultValue !== undefined) return item.defaultValue;
  const name = String(item?.itemRender?.name || "").toLowerCase();
  if (name.includes("switch")) return false;
  if (name.includes("checkbox")) return [];
  if (name.includes("upload")) return [];
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

// ===================== 运行时 items 增删改（动态配置） =====================
// 典型联动场景：
//   ① 某字段未填写时，禁用 / 隐藏其他字段 → updateItems 写 disabled / visible；
//   ② 下拉 options 依赖另一字段、经接口（耗时不确定）获取 → 请求返回后
//      updateItems 写 'itemRender.options'。
// 三个方法均「原地修改」items 数组（保持引用，父级 ref 自动响应），
// 单/批量统一入口，O(n) 单次遍历完成，避免逐项 find 的 O(n·k) 开销。

/**
 * 把「目标选择器」归一化为 item 谓词：
 *   string            → 按 item.prop 精确匹配（单个）
 *   (string|number)[] → 批量匹配多个 prop
 *   Function          → 原样作为谓词 (item) => boolean（可定位无 prop 的分组头/插入项）
 */
const toItemMatcher = (target) => {
  if (isFunction(target)) return target;
  const props = new Set(castArray(target));
  return (item) => item != null && props.has(item.prop);
};

/**
 * 建立 prop → 索引 的一次性映射（O(n)），定位锚点时避免反复 indexOf。
 * 无 prop 的项（分组头 / 插入项）不入表，需用谓词选择器定位。
 */
const buildPropIndex = (items) => {
  const map = new Map();
  for (let i = 0; i < items.length; i++) {
    const prop = items[i]?.prop;
    if (prop !== undefined && !map.has(prop)) map.set(prop, i);
  }
  return map;
};

/**
 * 解析新增位置为数组索引（与 addItems 拆平，保持各函数嵌套层级浅）。
 * 'end'（默认）追加末尾 | 'start' 开头 | number 指定索引（越界钳制）
 * | { before: prop } / { after: prop } 锚点定位，锚点不存在回退末尾。
 */
const resolveInsertIndex = (items, position) => {
  if (position === "start") return 0;
  if (isNumber(position)) return Math.min(Math.max(position, 0), items.length);
  if (isPlainObject(position)) {
    const { before, after } = position;
    const anchor = before !== undefined ? before : after;
    const at = buildPropIndex(items).get(anchor);
    if (at === undefined) return items.length;
    return after !== undefined ? at + 1 : at;
  }
  return items.length;
};

/**
 * 新增配置项（单个或批量），原地 splice 进 items。
 *
 * @param {Array}          items    配置数组（原地修改并返回）
 * @param {Object|Array}   entries  单个 item 或 item 数组（null/undefined 项自动过滤）
 * @param {string|number|Object} [position='end'] 插入位置，见 resolveInsertIndex
 * @returns {Array} 同一个 items 引用
 *
 * @example
 * addItems(items, { prop: 'phone', label: '电话', itemRender: { name: 'ElInput' } }, { after: 'email' })
 * addItems(items, [itemA, itemB], { before: 'address' })
 */
export const addItems = (items, entries, position = "end") => {
  if (!Array.isArray(items)) return items;
  const list = castArray(entries).filter((it) => it != null);
  if (!list.length) return items;
  items.splice(resolveInsertIndex(items, position), 0, ...list);
  return items;
};

/**
 * 删除配置项（单个或批量），原地修改。
 *
 * @param {Array}                 items   配置数组（原地修改）
 * @param {string|number|Array|Function} target 目标选择器，见 toItemMatcher
 * @returns {Array} 实际被删除的项（按原顺序）；无命中返回 []
 *
 * @example
 * removeItems(items, 'phone')
 * removeItems(items, ['phone', 'address'])
 * removeItems(items, (it) => it.temporary === true)
 */
export const removeItems = (items, target) => {
  if (!Array.isArray(items) || target == null) return [];
  const match = toItemMatcher(target);
  const hitIndexes = [];
  for (let i = 0; i < items.length; i++) {
    if (match(items[i])) hitIndexes.push(i);
  }
  const removed = hitIndexes.map((i) => items[i]);
  // 倒序删除：splice 的索引位移只影响更大的未处理索引，一次循环完成
  for (let k = hitIndexes.length - 1; k >= 0; k--) items.splice(hitIndexes[k], 1);
  return removed;
};

/**
 * 应用单个补丁：顶层键整体赋值（options 等数组整体替换，不按 lodash.merge 做索引合并）；
 * 键含 "." 时按路径深设（lodash set），便于只改嵌套属性而不影响兄弟字段。
 */
const applyItemPatch = (item, patch) => {
  if (!isPlainObject(patch)) return;
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes(".")) lodashSet(item, key, value);
    else item[key] = value;
  }
};

/**
 * 更新配置项（单个或批量），原地修改。
 *
 * @param {Array}                 items  配置数组（原地修改）
 * @param {string|number|Array|Function} target 目标选择器，见 toItemMatcher
 * @param {Object|Function}      patch  补丁对象，或 (item) => 补丁对象 的生成函数：
 *   - 顶层键整体赋值：{ visible: false }、{ required: true }
 *   - 点路径深设：{ 'itemRender.props.disabled': true }、
 *                 { 'itemRender.options': newOptions }（数组整体替换）
 * @returns {Array} 命中并被更新的项数组（引用即 items 内原对象）
 *
 * @example
 * updateItems(items, 'email', { 'itemRender.props.disabled': true })
 * updateItems(items, ['zip', 'address'], { visible: false })
 * updateItems(items, 'city', { 'itemRender.options': await fetchCities(province) })
 */
export const updateItems = (items, target, patch) => {
  if (!Array.isArray(items) || target == null || patch == null) return [];
  const match = toItemMatcher(target);
  const touched = [];
  for (const item of items) {
    if (!match(item)) continue;
    applyItemPatch(item, isFunction(patch) ? patch(item) : patch);
    touched.push(item);
  }
  return touched;
};
