<script setup>
/**
 * FormPro 基于 el-form 二次封装的配置式表单组件。
 *
 * 特性：
 *  0. 对齐 vxe-form 配置式表单能力（items / span / folding / visibleMethod / itemRender ...）
 *  1. 完整保留 el-form 全部属性、实例方法与事件（含自定义事件）：
 *     - 属性：inheritAttrs=false，未声明属性经 formProps 透传到 <el-form>
 *     - 方法：defineExpose 暴露 formRef 及 validate/resetFields/clearValidate/scrollToField/validateField
 *     - 事件：透传 attrs 中的监听器到 <el-form>，自定义事件照常触发
 *  2. 24 栅格分列：表单级 columns（列数）推导默认 span（24/列数），或直接用 span 指定默认值；每项 span 覆盖（项级优先级更高）
 *  3. 分组可展开/折叠：items 中插入 { group:true, title, fold } 分组头
 *  4. onlyRequired 动态切换：仅显示必填（item.required 或 rules 含 required）项
 *  5. JSX 渲染：item.render(ctx, h) 渲染控件（ctx 在前，h 极少使用时可省略）
 *  6. 表单项间插入组件/元素：无 field 的项即为插入项，用 slot 或 render 渲染
 *  7. 条件显隐自动回流：隐藏项不渲染，el-col 流式布局后续项自动前移
 *  8. 运行时动态配置：实例方法 addItems / removeItems / updateItems 增删改 items（联动禁用/显隐、异步 options）
 *  9. 紧凑模式（compact）：item 垂直间隔收紧（无 tip 行 18px→6px，含 tip 行保持默认）、
 *     label 与控件距离减半、校验错误改用 el-tooltip 在 item 右上角展示（error 主色调背景、
 *     白色文字、2px 内边距、任意 el-dialog 之上），errorTipDuration 秒后自动隐藏
 *
 * 约束：v-model 推荐用 ref 承载（不可变替换 + update:modelValue 事件语义）。
 * 父级坚持 reactive 时，请改用 :model-value + mutable-model（原地合并写入、不 emit），
 * 勿用 v-model——其编译的 formData = $event 赋值对 reactive 代理会抛错（const）/丢响应式（let）。
 * 组件无法自动区分 ref(obj).value 与 reactive(obj)（同为 reactive 代理），故需显式声明。
 */
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  useAttrs,
} from "vue";
import { isEqual } from "lodash-es";
import {
  splitIntoGroups,
  GRID_COLS,
  collectHiddenValueProps,
  buildInitialData,
  deriveDefaultValue,
  isFieldItem,
  resolveOptionsSourceDeps,
  resolveOptionsSourceTrigger,
  shouldFetchOptions,
  mergeModelValue,
  addItems as addItemsConfig,
  removeItems as removeItemsConfig,
  updateItems as updateItemsConfig,
  objectToFormData,
} from "./utils.js";
import FormBlock from "./FormBlock.vue";

defineOptions({ name: "FormPro", inheritAttrs: false });

const props = defineProps({
  // 表单数据（v-model）
  modelValue: { type: Object, default: () => ({}) },
  // 配置项数组
  items: { type: Array, default: () => [] },
  // 表单分几列：设置后每项默认 span = 24 / columns（如 3 → 8，4 → 6）；
  // item.span 仍可单独覆盖。优先级：item.span > columns 推导 > span
  columns: { type: Number, default: 0 },
  // 默认每项栅格占位（24 栅格）；columns 未设置时生效，item.span 优先级更高
  span: { type: Number, default: 24 },
  // el-row 间距
  gutter: { type: [Number, Array], default: 12 },
  // 仅显示必填项
  onlyRequired: { type: Boolean, default: false },
  // 表单级：标题是否带冒号（item.titleColon 可单独覆盖）
  titleColon: { type: Boolean, default: false },
  // 表单级：label 是否统一加粗（item.titleBold 可单独覆盖，项级优先级更高）
  titleBold: { type: Boolean, default: false },
  // 表单级：分组是否显示折叠/展开按钮（group.collapsible 可单独覆盖）；默认 true
  groupCollapsible: { type: Boolean, default: true },
  // 提交时是否移除「因 visible / visibleMethod 隐藏」的字段值（默认 false 不移除）。
  // 注意：onlyRequired 导致的隐藏不受影响（其值保留）；每项可用 item.removeValueOnHidden 单独覆盖。
  removeHiddenValues: { type: Boolean, default: false },
  // 自动补全初始值：根据 items 配置为未声明的字段填充合理默认值（Switch→false，CheckboxGroup→[]，其余→""），
  // 免去逐个声明 ""。item.defaultValue 可指定固定默认值；用户在 modelValue 中已提供的值始终优先。默认 true。
  autoFillDefaults: { type: Boolean, default: true },
  // 原地同步模式（兼容 reactive 承载）：开启后不 emit update:modelValue，
  // 字段变更直接原地合并写入 props.modelValue（要求其为可变对象，通常配合 reactive 使用）。
  // 用法：<FormPro :model-value="formData" mutable-model />（勿再写 v-model / @update:modelValue）。
  // 默认 false：emit 新快照由父级整体替换（ref + v-model 的推荐用法）。
  mutableModel: { type: Boolean, default: false },
  // 边框表格样式：开启后表单渲染为带边框的表格外观（外框 + 单元格网格线 + label 表头底色），
  // 适用于信息录入/详情描述类表单。默认 false，保持原外观（向后兼容）。推荐配合 gutter=0 使用。
  border: { type: Boolean, default: false },
  // 紧凑型表单：item 垂直间隔收紧（无 tip 行 18px→6px；行内任一项配置 tip 则整行保持默认，
  // 保证同行水平对齐）；label 与输入类组件的距离减半；校验错误提示不再显示在控件下方，
  // 改用 el-tooltip 在 item 右上角展示（placement="top-end"、error 主色调背景、白色文字、
  // 2px 内边距、任意 el-dialog 之上），errorTipDuration 秒后自动隐藏——隐藏仅收起提示气泡，
  // 控件的校验错误样式（如红色边框）保持不变。默认 false。
  compact: { type: Boolean, default: false },
  // 紧凑模式：校验错误 tooltip 展示时长（秒），超时后自动隐藏；默认 3；
  // 传 <=0 表示不自动隐藏（由下一次校验 / clearValidate / resetFields 收敛）。
  errorTipDuration: { type: Number, default: 3 },
});

const emit = defineEmits(["update:modelValue"]);

const formRef = ref(null);

// 内部表单数据：与 modelValue 双向同步（开启 autoFillDefaults 时按 items 配置补全缺失字段的默认值）
const formData = reactive(
  props.autoFillDefaults
    ? buildInitialData(props.items, props.modelValue)
    : { ...(props.modelValue || {}) },
);

// 「字段 prop → el-form-item 完整实例」映射：由各 FormBlock 渲染时回填，
// 用于对外暴露每个 form-item 的全部实例能力（size/validateMessage/validateState/
// validate/clearValidate/resetField/setInitialValue）。
const formItemRefs = reactive({});
// 按 prop 取单个 el-form-item 实例（拿不到时返回 undefined）
const getFormItem = (prop) => formItemRefs[prop];

// 「字段 prop → 内置 UploadPro 实例」映射：由各 FormBlock 渲染时回填，
// 用于对外暴露上传实例及其实例方法（abort / submit / clearFiles / handleStart /
// handleRemove / pasteImages / getRawFiles / getRemovedFiles），多上传项按字段区分
const uploadRefs = reactive({});
// 按 prop 取单个 UploadPro 实例（拿不到时返回 undefined）
const getUpload = (prop) => uploadRefs[prop];

// 「字段 prop → 当前校验错误信息」映射：由 el-form 的 validate 事件同步。
// 用于驱动字段「填写提示」(item.tip) 的显隐：无错误时显示 tip（success 色），
// 校验不通过时隐藏 tip、让位给 el-form-item 的错误提示。
const fieldErrors = reactive({});
// el-form 校验事件：(prop, isValid, message) —— 字段校验状态变化时触发
const onFormValidate = (prop, isValid, message) => {
  if (isValid) {
    delete fieldErrors[prop];
    hideErrorTip(prop);
  } else {
    fieldErrors[prop] = message || "";
    if (props.compact) showErrorTip(prop);
  }
};

// —— 紧凑模式（compact）：校验错误 tooltip 显隐 ——
// errorTipVisible: prop → tooltip 是否可见。由 el-form 的 validate 事件驱动：
// 校验不通过时显示，errorTipDuration 秒后自动隐藏；字段恢复通过或 clearValidate /
// resetFields 时立即隐藏。
// 注意：只控制 tooltip 气泡显隐，从不清除 el-form-item 的校验状态（is-error）——
// tooltip 隐藏后控件的错误样式（如红色边框）保持不变。
const errorTipVisible = reactive({});
const errorTipTimers = {};

const clearErrorTipTimer = (prop) => {
  if (errorTipTimers[prop] != null) {
    clearTimeout(errorTipTimers[prop]);
    delete errorTipTimers[prop];
  }
};

const showErrorTip = (prop) => {
  errorTipVisible[prop] = true;
  clearErrorTipTimer(prop);
  const duration = Number(props.errorTipDuration);
  if (!(duration > 0)) return; // <=0 / 非法值：不自动隐藏
  errorTipTimers[prop] = setTimeout(() => {
    clearErrorTipTimer(prop);
    delete errorTipVisible[prop];
  }, duration * 1000);
};

const hideErrorTip = (prop) => {
  clearErrorTipTimer(prop);
  delete errorTipVisible[prop];
};

const hideAllErrorTips = () => {
  for (const prop of Object.keys(errorTipVisible)) hideErrorTip(prop);
};

// —— 单位后缀对齐：统一「单位槽宽」 ——
// 表单内存在静态字符串后缀（单位，如「元 / 个 / 岁」）时，测量所有单位文本的实际宽度取最大值，
// 作为统一单位槽宽，经 CSS 变量 --form-pro-unit-slot 下发给所有表单项：
//   - 带单位的控件：单位后缀固定为该槽宽，控件右边缘随之前移；
//   - 不带单位的控件：FormBlock 在右侧渲染等宽占位符（.form-pro__field-suffix--reserve），
//     控件右边缘同样前移——上下各 item 的控件右边缘对齐（垂直方向整齐）。
// 函数形态后缀（动态描述文本，宽度随值变化）不参与测量、也不预留，避免把输入框挤窄。
// 测量对象是单位文本内部 span（.form-pro__field-affix-text），不受槽宽样式影响，避免循环测量。
const unitSlotWidth = ref(0);
const unitSlotStyle = computed(() =>
  unitSlotWidth.value > 0
    ? { "--form-pro-unit-slot": `${unitSlotWidth.value}px` }
    : {},
);

const measureUnitSlot = () => {
  const root = formRef.value?.$el;
  if (!root) return;
  let max = 0;
  root
    .querySelectorAll(
      ".form-pro__field-suffix--unit > .form-pro__field-affix-text",
    )
    .forEach((el) => {
      max = Math.max(max, el.getBoundingClientRect().width);
    });
  // 取整上取：槽宽不小于任一本单位文本宽度，保证后缀不溢出
  unitSlotWidth.value = max > 0 ? Math.ceil(max) : 0;
};

// 合并同一轮内的多次 DOM 变化为一次测量（分组展开、items 增删、显隐切换等）
let measureUnitSlotPending = false;
const scheduleMeasureUnitSlot = () => {
  if (measureUnitSlotPending) return;
  measureUnitSlotPending = true;
  nextTick(() => {
    measureUnitSlotPending = false;
    measureUnitSlot();
  });
};

// 给 el-form 原生错误提示（.el-form-item__error）自动补全 title：空间不足被省略为 … 时，
// 鼠标悬浮可查看完整错误文本。用 MutationObserver 监听错误元素的出现与文本变化，
// 不依赖校验事件时机（初始校验、异步校验、重新校验均能覆盖）。
// 同一观察器顺带在 DOM 结构变化后重新测量单位槽宽（分组展开/收起、动态增删 items 等）。
let errorTitleObserver = null;
onMounted(() => {
  const root = formRef.value?.$el;
  if (!root) return;
  const syncErrorTitles = () => {
    root.querySelectorAll(".el-form-item__error").forEach((el) => {
      const text = el.textContent || "";
      if (text && el.getAttribute("title") !== text) el.setAttribute("title", text);
    });
  };
  syncErrorTitles();
  measureUnitSlot();
  errorTitleObserver = new MutationObserver((records) => {
    syncErrorTitles();
    // 只有「涉及单位后缀的结构变化」才重测，避免表单内嵌表格/富内容频繁更新时
    // 每次都做一次全表单查询 + 强制布局读取：
    //   - 节点增删：新增/移除的子树中包含单位后缀（分组展开收起、items 增删、显隐切换）；
    //   - 文本变化：变化节点位于单位后缀内部（updateItems 修改静态 suffix 文本）。
    // 动态函数后缀逐键更新（不在 --unit 内）不触发测量。
    const needMeasure = records.some((r) => {
      if (r.type === "characterData") {
        return !!r.target.parentElement?.closest?.(
          ".form-pro__field-suffix--unit",
        );
      }
      if (r.type !== "childList") return false;
      for (const node of [...r.addedNodes, ...r.removedNodes]) {
        if (node.nodeType !== 1) continue;
        if (
          node.matches(".form-pro__field-suffix--unit") ||
          node.querySelector(".form-pro__field-suffix--unit")
        ) {
          return true;
        }
      }
      return false;
    });
    if (needMeasure) scheduleMeasureUnitSlot();
  });
  errorTitleObserver.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
});
onBeforeUnmount(() => errorTitleObserver?.disconnect());
// 卸载时清理紧凑模式的错误提示定时器
onBeforeUnmount(() => {
  for (const prop of Object.keys(errorTipTimers)) clearErrorTipTimer(prop);
});

// —— 声明式异步选项 optionsSource ——
// item.optionsSource = {
//   deps: string[] | (data) => any[],    // 依赖字段（任一变化时重新拉取）
//   fetch: (ctx) => Promise<Option[]>,   // ctx = { data, value, prop, deps }
//   when: (data) => boolean,             // 可选：不满足时清空 options、不发请求（默认恒 true）
//   clearValue: boolean,                 // 可选：deps 变化时清空本字段值（默认 true）
//   debounce: number,                    // 可选：防抖毫秒（输入类依赖用），默认 0
// }
// 内置能力：loading 切换（itemRender.props.loading）、防竞态（仅最新一次拉取生效）、
// 依赖变化自动清空本字段值并同步父级。与 itemRender.options 互斥（optionsSource 接管 options）。
// 典型场景：「输入/选择/切换 → 请求接口 → 刷新另一字段选项」，免去父级手写
// change 事件 + updateItems + 防竞态样板代码。
const optionsSourceState = new Map(); // prop → { deps: any[], token: number, timer: timeout|null }

const execOptionsSource = async (item, st) => {
  const src = item.optionsSource;
  const prop = item.prop;
  const token = ++st.token;
  // when 不满足：清空选项并返回（不发请求）
  if (!shouldFetchOptions(src, formData)) {
    updateItemsConfig(props.items, prop, {
      "itemRender.props.loading": false,
      "itemRender.options": [],
    });
    return;
  }
  updateItemsConfig(props.items, prop, { "itemRender.props.loading": true });
  try {
    const list = await src.fetch({
      data: formData,
      value: formData[prop],
      prop,
      deps: st.deps,
    });
    if (token !== st.token) return; // 防竞态：过期结果丢弃
    updateItemsConfig(props.items, prop, {
      "itemRender.props.loading": false,
      "itemRender.options": Array.isArray(list) ? list : [],
    });
  } catch {
    if (token !== st.token) return;
    updateItemsConfig(props.items, prop, { "itemRender.props.loading": false });
  }
};

// 深监听 formData：逐项比对依赖快照，变化时先同步清空本字段值（联动父级），再拉取新选项；
// immediate：挂载即对每项拉取一次（when 不满足则仅清空选项）。
// 登记在回抛 watcher 之前：依赖变化引发的「清值」先于「回抛」执行，父级一次收敛。
watch(
  formData,
  () => {
    const seen = new Set();
    for (const item of props.items) {
      if (!isFieldItem(item) || !item.optionsSource) continue;
      seen.add(item.prop);
      const src = item.optionsSource;
      const nextDeps = resolveOptionsSourceDeps(src.deps, formData);
      let st = optionsSourceState.get(item.prop);
      if (st && isEqual(st.deps, nextDeps)) continue;
      const isFirst = !st;
      if (!st) {
        st = { deps: nextDeps, token: 0, timer: null };
        optionsSourceState.set(item.prop, st);
      } else {
        st.deps = nextDeps;
      }
      const trigger = resolveOptionsSourceTrigger(src, isFirst);
      // 依赖变化（非首次登记）：清空本字段值（按控件类型推导空值）
      if (trigger.clearValue) {
        const cleared = deriveDefaultValue(item);
        if (!isEqual(formData[item.prop], cleared)) {
          formData[item.prop] = cleared;
        }
      }
      if (trigger.delay > 0) {
        clearTimeout(st.timer);
        st.timer = setTimeout(() => execOptionsSource(item, st), trigger.delay);
      } else {
        execOptionsSource(item, st);
      }
    }
    // 清理已被 removeItems 删除的字段状态（含未触发的防抖计时器）
    for (const [prop, st] of optionsSourceState) {
      if (!seen.has(prop)) {
        clearTimeout(st.timer);
        optionsSourceState.delete(prop);
      }
    }
  },
  { deep: true, immediate: true },
);
// 卸载时：取消未触发的防抖计时器，并使在途 fetch 的防竞态 token 失效（结果不再写入）
onBeforeUnmount(() => {
  for (const st of optionsSourceState.values()) {
    clearTimeout(st.timer);
    st.token++;
  }
});

// 一次性「静默」开关：fillMissingDefaults 补默认值引发的 formData 变化，
// 不向父级回抛（避免「watch formData → 改 items → 补默认值 → formData 再变」多余触发父级 watcher）。
let suppressEmit = false;

// 为 formData 补全 items 中存在但 data 中缺失的字段默认值（非破坏式：已有值不覆盖）。
// 用于 items 动态新增字段时，自动补齐其初始值。补默认值时静默，不回抛父级。
const fillMissingDefaults = () => {
  if (!props.autoFillDefaults) return;
  let changed = false;
  for (const item of props.items) {
    if (!isFieldItem(item)) continue;
    if (formData[item.prop] === undefined) {
      formData[item.prop] = deriveDefaultValue(item);
      changed = true;
    }
  }
  if (changed) {
    suppressEmit = true;
    // 下一个 tick 复位，确保同一轮 flush 内的所有 emit-watch 都跳过
    nextTick(() => {
      suppressEmit = false;
    });
  }
};

// 最近一次「父子双向同步达成一致」的数据快照（浅拷贝），用于三方合并。
// 背景：同一 tick 内可能同时存在「子级待发出的 emit」（如 setField 刚改了字段）
// 与「父级直接写入 formData」（如 change 事件里清空另一字段）两股修改。
// 通过对比 lastSyncedData 可判定每个键是「父级改了 / 子级改了 / 都改了 / 都没改」，
// 避免任一侧修改被另一侧静默覆盖（父级写入丢失、必须 nextTick 才能生效的 bug 即源于此）。
let lastSyncedData = { ...formData };

const syncFromParent = (val) => {
  // 三方合并：以 lastSyncedData 为基准逐键判定父/子侧修改（规则见 utils.mergeModelValue）
  const merged = mergeModelValue({
    current: formData,
    incoming: val,
    base: lastSyncedData,
    items: props.items,
    autoFillDefaults: props.autoFillDefaults,
  });
  // merged 即同步后两侧将达成的一致状态（merged 与父级值不一致时，子级随后会 emit 收敛父级）
  lastSyncedData = { ...merged };
  if (isEqual(merged, formData)) return;
  for (const k of Object.keys(formData)) delete formData[k];
  Object.assign(formData, merged);
};
// 父级 modelValue 变化 → 同步进内部 formData（值未变则跳过，避免回环）
watch(
  () => props.modelValue,
  (val) => syncFromParent(val),
  { deep: true },
);

// 回抛父级统一入口：
// - 默认（ref + v-model）：emit update:modelValue，父级以新快照整体替换（不可变语义）；
// - mutableModel（reactive 承载）：原地合并写入 props.modelValue、不 emit——
//   模板 v-model 编译的 formData = $event 赋值对 reactive 代理会抛错（const）/ 丢响应式（let），
//   故父级改用 :model-value + mutable-model，由组件直接原地写回；
//   原地写入会触发上方 props.modelValue 深 watch → syncFromParent，与 emit 路径同样收敛。
const pushModelValue = (snapshot) => {
  if (isEqual(snapshot, props.modelValue)) return;
  if (props.mutableModel) {
    const target = props.modelValue;
    if (!target || typeof target !== "object") return;
    for (const k of Object.keys(target)) if (!(k in snapshot)) delete target[k];
    Object.assign(target, snapshot);
    return;
  }
  emit("update:modelValue", snapshot);
};

// 内部 formData 变化 → 向父级回抛（值未变则跳过，避免回环）
// 当 removeHiddenValues 开启时，回抛数据会排除「因 visible / visibleMethod 隐藏」的字段值
// （onlyRequired 隐藏的字段不受影响，值保留）。
// suppressEmit 为 true 时（fillMissingDefaults 静默补默认值）跳过本次回抛并复位。
// 回抛前先 syncFromParent 拉取父级「同 tick 直接写入」的修改（三方合并），
// 否则本 watcher 基于子级旧状态生成的 snapshot 会覆盖父级尚未同步进来的写入，
// 表现为「change 事件里父级改 formData + updateItems 不生效，必须 nextTick」。
watch(
  formData,
  () => {
    if (suppressEmit) return;
    syncFromParent(props.modelValue);
    pushModelValue(buildSubmitData(formData));
  },
  { deep: true },
);

// 当前需移除值的隐藏字段 prop 集合（随 items / formData / removeHiddenValues 响应式变化）
const hiddenValueProps = computed(() =>
  collectHiddenValueProps(props.items, formData, props.removeHiddenValues),
);

/**
 * 构造「提交用」数据：基于给定数据对象，移除被隐藏字段的值。
 * 不修改入参，返回新对象。removeHiddenValues 关闭时原样返回浅拷贝。
 */
const buildSubmitData = (source) => {
  const base = { ...(source || {}) };
  const removeSet = hiddenValueProps.value;
  if (removeSet.size === 0) return base;
  for (const prop of removeSet) delete base[prop];
  return base;
};

// 隐藏字段集合变化（含初始化）时，主动向父级回抛一次过滤后的数据，
// 保证父级 v-model 数据实时不含隐藏字段值（保存/提交即不传）。
watch(
  hiddenValueProps,
  () => {
    if (suppressEmit) return;
    pushModelValue(buildSubmitData(formData));
  },
  { immediate: true },
);

/**
 * 对外暴露：获取当前提交数据（已按 removeHiddenValues 规则移除隐藏字段值）。
 * 应用场景：保存/提交时调用，避免把 visibleMethod 隐藏项的值传给后端。
 */
const getSubmitData = () => buildSubmitData(formData);

/**
 * 对外暴露：对象 → FormData（multipart/form-data 提交）。
 * 不传 source 时默认取 getSubmitData()（已按 removeHiddenValues 过滤）。
 * 文件（File / Blob，含 UploadPro 绑定值里的 { raw: File } 文件项）以二进制 append，
 * 不会被字符串化；嵌套对象 / 数组的键格式见 objectToFormData。
 *
 * @param {Object} [source] 待转换对象，默认提交数据
 * @param {Object} [options] 见 objectToFormData（arrayFormat: 'repeat' | 'bracket'）
 * @returns {FormData}
 *
 * @example
 * const fd = formRef.value.toFormData(); // 当前表单（含待上传文件二进制）
 * const fd2 = formRef.value.toFormData({ name: "张三", avatar: file });
 */
const toFormData = (source = getSubmitData(), options = {}) =>
  objectToFormData(source, options);

// el-form 透传属性：剥离已声明 props，其余（labelWidth/labelPosition/rules/inline...）透传
const OWN_PROPS = ["modelValue", "items", "columns", "span", "gutter", "onlyRequired", "titleColon", "titleBold", "groupCollapsible", "removeHiddenValues", "autoFillDefaults", "border", "compact", "errorTipDuration"];
const attrs = useAttrs();
const formPropsComputed = computed(() => {
  const out = { model: formData };
  for (const [k, v] of Object.entries(attrs)) {
    if (!OWN_PROPS.includes(k)) out[k] = v;
  }
  return out;
});

// el-form 统一 rules（用于 onlyRequired 判定必填）
const formRules = computed(() => attrs.rules || {});

// 每项默认栅格占位：columns 推导（24/列数）优先，否则用 span
const formSpanComputed = computed(() => {
  const cols = Number(props.columns);
  if (cols > 0) return Math.max(1, Math.floor(GRID_COLS / cols));
  return props.span;
});

// 分组折叠状态：以「分组在 blocks 中的索引」为 key（唯一），避免重复标题共享折叠态 / v-for key 碰撞。
const collapsedMap = reactive({});
const groupKey = (t) => t || "__default__";

// 取某分组对象在 blocks 中的索引（唯一身份）；找不到返回 -1
const groupIndexOf = (groupItem) =>
  groupItem ? blocks.value.findIndex((b) => b.group === groupItem) : -1;

const isGroupCollapsed = (groupItem) => {
  const idx = groupIndexOf(groupItem);
  if (idx === -1) return !!groupItem?.fold;
  if (collapsedMap[idx] === undefined) return !!groupItem?.fold;
  return collapsedMap[idx];
};

// 某分组是否可折叠：group.collapsible 优先，否则回退表单级 groupCollapsible（默认 true）
const isGroupCollapsible = (groupItem) => {
  if (!groupItem) return false;
  if (groupItem.collapsible != null) return !!groupItem.collapsible;
  return !!props.groupCollapsible;
};

const toggleGroup = (groupItem) => {
  if (!isGroupCollapsible(groupItem)) return;
  const idx = groupIndexOf(groupItem);
  if (idx === -1) return;
  collapsedMap[idx] = !isGroupCollapsed(groupItem);
};

// 对外暴露的动态折叠方法（按分组标题操作；标题重复时命中第一个匹配分组）——
// 按标题取分组在 blocks 中的索引
const findGroupIndex = (title) =>
  blocks.value.findIndex((b) => b.group && groupKey(b.group.title) === groupKey(title));

/** 设置某个分组的折叠状态 */
const setGroupCollapsed = (title, collapsed) => {
  const idx = findGroupIndex(title);
  if (idx === -1) return;
  collapsedMap[idx] = !!collapsed;
};
/** 切换某个分组 */
const toggleGroupByTitle = (title) => {
  const idx = findGroupIndex(title);
  if (idx === -1) return;
  const g = blocks.value[idx]?.group || { title };
  collapsedMap[idx] = !isGroupCollapsed(g);
};
/** 批量设置多个分组的折叠状态 */
const setGroupsCollapsed = (titles, collapsed) => {
  (titles || []).forEach((t) => setGroupCollapsed(t, collapsed));
};
/** 折叠 / 展开全部分组 */
const setAllGroupsCollapsed = (collapsed) => {
  blocks.value.forEach((b, idx) => {
    if (b.group) collapsedMap[idx] = !!collapsed;
  });
};
const collapseAllGroups = () => setAllGroupsCollapsed(true);
const expandAllGroups = () => setAllGroupsCollapsed(false);
/** 是否所有「可折叠」分组都处于折叠态（用于「展开全部 / 折叠全部」按钮文案） */
const allGroupsCollapsed = computed(() => {
  const collapsible = blocks.value.filter((b) => b.group && isGroupCollapsible(b.group));
  return collapsible.length > 0 && collapsible.every((b) => isGroupCollapsed(b.group));
});
/** 一键切换全部分组：全部折叠时展开，否则全部折叠 */
const toggleAllGroups = () =>
  allGroupsCollapsed.value ? expandAllGroups() : collapseAllGroups();

watch(
  () => props.items,
  () => {
    for (const k of Object.keys(collapsedMap)) delete collapsedMap[k];
    // items 动态变化（如新增字段）时，补齐缺失字段的默认值
    fillMissingDefaults();
  },
);

const blocks = computed(() => splitIntoGroups(props.items));

// FormPro 自身暴露的成员（分组折叠、提交数据等）
const ownExposed = {
  formRef,
  formData,
  // 每个字段对应的 el-form-item 完整实例映射（prop → 实例），可访问其全部 expose
  formItemRefs,
  // 按 prop 取单个 el-form-item 实例
  getFormItem,
  // 每个上传字段对应的 UploadPro 完整实例映射（prop → 实例）
  uploadRefs,
  // 按 prop 取单个 UploadPro 实例（拿不到时返回 undefined）
  getUpload,
  // —— UploadPro 实例方法代理：首个参数为字段 prop，多上传项按字段区分 ——
  // 字段未渲染（隐藏 / 折叠 / 非上传字段）时静默跳过；数据类方法回退空数组
  abort: (prop, file) => uploadRefs[prop]?.abort?.(file),
  submit: (prop) => uploadRefs[prop]?.submit?.(),
  clearFiles: (prop, states) => uploadRefs[prop]?.clearFiles?.(states),
  handleStart: (prop, rawFile) => uploadRefs[prop]?.handleStart?.(rawFile),
  handleRemove: (prop, file) => uploadRefs[prop]?.handleRemove?.(file),
  pasteImages: (prop, files) => uploadRefs[prop]?.pasteImages?.(files),
  getRawFiles: (prop) => uploadRefs[prop]?.getRawFiles?.() ?? [],
  getRemovedFiles: (prop, field, valuesOnly) =>
    uploadRefs[prop]?.getRemovedFiles?.(field, valuesOnly) ?? [],
  // 获取提交数据：按 removeHiddenValues 规则移除隐藏字段值（保存/提交时使用）
  getSubmitData,
  // 对象 → FormData（默认取提交数据；File/Blob 以二进制追加，用于 multipart 上传）
  toFormData,
  // —— 运行时动态增删改 items（配置项联动：禁用/显隐/异步 options 等）——
  // 原地修改父级传入的 items 数组（保持引用，父级 ref 自动响应式更新）。
  // position：'end' | 'start' | number | { before: prop } | { after: prop }
  addItems(entries, position) {
    addItemsConfig(props.items, entries, position);
    // 立即为新增字段补全 formData 默认值，无需等待 items watcher 的下一个 tick
    fillMissingDefaults();
    return props.items;
  },
  // target：prop | prop[] | (item)=>boolean；返回被删除的项
  removeItems(target) {
    const removed = removeItemsConfig(props.items, target);
    // 同步清理被删字段的值，避免提交数据残留「孤儿值」（删除响应式键自动回抛父级）
    for (const item of removed) {
      if (isFieldItem(item) && item.prop in formData) delete formData[item.prop];
    }
    return removed;
  },
  // patch：顶层键整体赋值，或点路径深设（如 'itemRender.props.disabled' / 'itemRender.options'）；
  // 也支持 (item)=>patch。返回命中并更新的项
  updateItems(target, patch) {
    return updateItemsConfig(props.items, target, patch);
  },
  // 分组动态折叠：按标题操作单个 / 多个 / 全部分组
  setGroupCollapsed,
  toggleGroup: toggleGroupByTitle,
  setGroupsCollapsed,
  collapseAllGroups,
  expandAllGroups,
  toggleAllGroups,
  // 所有「可折叠」分组是否均已折叠（响应式只读状态，getter 实时求值）：
  // 供外部「展开全部 / 折叠全部」按钮（如 FormGroupToggle 组件）驱动文案，
  // 外部在 render 中读取时会被 Vue 追踪依赖，分组状态变化自动重渲染
  get allGroupsCollapsed() {
    return allGroupsCollapsed.value;
  },
  // 包装 el-form 的 resetFields / clearValidate：这两个方法清除校验状态时「不触发」validate 事件，
  // 需同步清除内部 fieldErrors，否则 item.tip 填写提示会因残留错误状态而无法恢复显示。
  // 同步收敛紧凑模式的错误 tooltip（含未触发的自动隐藏定时器）。
  resetFields() {
    for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
    hideAllErrorTips();
    return formRef.value?.resetFields?.();
  },
  clearValidate(props) {
    if (props == null) {
      for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
      hideAllErrorTips();
    } else {
      (Array.isArray(props) ? props : [props]).forEach((p) => {
        delete fieldErrors[p];
        hideErrorTip(p);
      });
    }
    return formRef.value?.clearValidate?.(props);
  },
};

// 把 el-form 实例的「全部」方法/属性合并到暴露对象上：
// validate / validateField / resetFields / clearValidate / scrollToField /
// getField / fields / setInitialValues 及未来新增，无需手动逐个枚举，保证与 el-form 完全对齐。
// （用普通对象而非 Proxy，避免破坏外部通过组件实例访问 $parent/$root 等能力，如测试工具）
const mergeElFormApi = () => {
  const inst = formRef.value;
  if (!inst) return;
  for (const key of Object.keys(inst)) {
    if (key in ownExposed) continue; // 自身方法优先，不被覆盖
    const val = inst[key];
    ownExposed[key] = typeof val === "function" ? val.bind(inst) : val;
  }
};
watch(formRef, mergeElFormApi, { immediate: true });

defineExpose(ownExposed);
</script>

<template>
  <el-form
    ref="formRef"
    v-bind="formPropsComputed"
    :class="['form-pro', { 'form-pro--border': border, 'form-pro--compact': compact }]"
    :style="unitSlotStyle"
    @validate="onFormValidate"
  >
    <FormBlock
      v-for="(block, idx) in blocks"
      :key="idx"
      :block="block"
      :form-data="formData"
      :only-required="onlyRequired"
      :form-rules="formRules"
      :form-span="formSpanComputed"
      :gutter="gutter"
      :title-colon="titleColon"
      :title-bold="titleBold"
      :field-errors="fieldErrors"
      :border="border"
      :compact="compact"
      :unit-slot-width="unitSlotWidth"
      :error-tip-visible="errorTipVisible"
      :collapsible="block.group ? isGroupCollapsible(block.group) : true"
      :collapsed="block.group ? (isGroupCollapsible(block.group) ? isGroupCollapsed(block.group) : false) : false"
      :form-item-refs="formItemRefs"
      :upload-refs="uploadRefs"
      @toggle-group="block.group && isGroupCollapsible(block.group) && toggleGroup(block.group)"
    >
      <!-- 透传所有插槽给 FormBlock（字段插槽 #field、插入项插槽、分组标题插槽 group-xxx）-->
      <template v-for="(_, name) in $slots" #[name]="scope">
        <slot :name="name" v-bind="scope" />
      </template>
    </FormBlock>
    <slot />
  </el-form>
</template>

<style lang="scss" scoped>
// —— FormPro 根（el-form）基础样式 ——
// 1. box-sizing: border-box：用户经 class/style 透传添加的 border / padding 会计入宽度，
//    不再因 content-box 把边框/内边距叠加到总宽上而撑破父容器、触发水平滚动条。
// 2. overflow-x: clip：裁切 el-row 因 gutter 产生的负 margin（左右各 gutter/2）空白溢出。
//    注意这不是 overflow:hidden——clip 不创建滚动容器、不允许程序化滚动，仅裁切绘制溢出；
//    被裁切的只有 el-row 的空白 margin 区域，列内容（el-col 及其 padding）不受影响。
//    这样即使 FormPro 直接放在无 padding 的容器中，也不会因 el-row 负 margin 产生水平滚动条。
// 3. width/max-width: 100%：显式约束表单不超出父容器宽度，与 border-box 配合确保不溢出。
.form-pro {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: clip;

  // label-position="top"（el-form 或 el-form-item 上设置均可，EP 统一解析后
  // 加 el-form-item--label-top 类）：label 与控件（输入类等组件）的垂直距离
  // 与紧凑模式一致（8px → 4px），不受 compact 开关影响。
  :deep(.el-form-item--label-top .el-form-item__label) {
    margin-bottom: 4px;
  }
}

// —— 紧凑型表单（compact 模式）——
// 1. 垂直间隔收紧：无 tip 可视行的 el-form-item 间隔 18px → 6px。
//    行内任一项配置了 tip 的行整体不加收紧类（FormBlock 侧按可视行判定）——tip 文案
//    悬浮于控件下方（绝对定位），需要原生间隔容纳，且保证同行各项水平对齐。
//    以 :not(.form-pro--border) 排除边框表格模式：border 自身将间隔归零（见下方样式），
//    不受紧凑模式影响。
.form-pro--compact:not(.form-pro--border) {
  :deep(.form-pro__col--tight .el-form-item) {
    margin-bottom: 6px;
  }
}

// 2. label 与输入类组件的距离减半：
//    left/right（水平排列）：label 右内边距 12px → 6px；
//    top（上下排列）：label 下外边距 8px → 4px（右内边距维持 EP 默认 0）。
.form-pro--compact {
  :deep(.el-form-item__label) {
    padding-right: 6px;
  }
  :deep(.el-form-item--label-top .el-form-item__label) {
    margin-bottom: 4px;
    padding-right: 0;
  }

  // 3. 原生校验错误文案隐藏：错误提示改由 el-tooltip 在 item 右上角展示（见 FormBlock）。
  //    仅隐藏文案元素，el-form-item 的 is-error 校验状态不受影响（控件红色边框保持）。
  :deep(.el-form-item__error) {
    display: none;
  }
}

// —— 边框表格样式（border 模式）——
// .form-pro--border 挂在 <el-form> 根节点（本组件模板内，携带 scoped 属性）；
// 内部 el-row / el-col / el-form-item 由 FormBlock 的 render 函数动态生成，
// 深层节点不会带 scoped 属性，需用 :deep() 命中。
// 视觉：外层整框 + 圆角；每个单元格（el-col）右侧/下侧网格线；
//       label 区域带浅灰底色与右侧分隔线，呈现「表头单元格」观感。
// 内部交汇线为单线；外层右/下边与单元格线叠加为 2px，形成轻微框架强调。
.form-pro--border {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--el-bg-color);

  // 单元格：右、下网格线；box-sizing 保证边框计入宽度不撑破栅格
  :deep(.el-col) {
    border-right: 1px solid var(--el-border-color);
    border-bottom: 1px solid var(--el-border-color);
    box-sizing: border-box;
  }

  // 消除 el-form-item 默认底边距，使内容填满单元格高度
  :deep(.el-form-item) {
    margin-bottom: 0;
    height: 100%;
  }

  // label 单元格：浅灰底色 + 右侧分隔线，撑满单元格高度并垂直居中
  :deep(.el-form-item__label) {
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    box-sizing: border-box;
    background-color: var(--el-fill-color-light);
    border-right: 1px solid var(--el-border-color);
  }

  // 控件区：上下留白容纳错误/提示文案；允许换行，使文案在控件下方另起一行流式占位
  :deep(.el-form-item__content) {
    padding: 4px 10px;
    box-sizing: border-box;
    flex-wrap: wrap;
  }

  // —— 修复：校验错误提示被单元格边框裁切 ——
  // Element Plus 默认 .el-form-item__error 为 position:absolute、top:100%，
  // 会溢出到单元格之外，被下一行单元格背景与容器 overflow:hidden 裁切遮挡。
  // 边框模式下改为「单元格内流式占位」：相对定位 + 占满一行，文案在控件下方显示，
  // 单元格（行）随之增高，从根本上避免溢出裁切；不抬 z-index、不改层叠上下文。
  :deep(.el-form-item__error) {
    position: relative;
    top: auto;
    width: 100%;
    padding-top: 2px;
  }

  // 同理：填写提示 tip（.form-pro__field-tip）原亦为绝对定位 top:100%，
  // 边框模式下改为流式占位，避免被裁切。
  :deep(.form-pro__field-tip) {
    position: relative;
    top: auto;
    width: 100%;
    padding-top: 2px;
  }

  // 分组块在边框模式下去掉默认底边距，由单元格网格线统一分隔
  :deep(.form-pro__group) {
    margin-bottom: 0;
  }
  // 分组标题行：在边框表格内作为「分段标题」，占满整行、带底色
  :deep(.form-pro__group-header) {
    padding: 8px 12px;
    background-color: var(--el-fill-color-lighter, #fafafa);
    border-bottom: 1px solid var(--el-border-color);
  }
  :deep(.form-pro__group-body) {
    padding-top: 0;
  }
}
</style>

<style lang="scss">
// —— 紧凑模式：校验错误 tooltip（teleport 至 body 层，需全局作用域样式）——
// 背景 = error 主色调、白色文字、内边距收紧为 2px（EP 默认 5px 11px）；
// 选择器带 .el-popper.is-dark 前缀以覆盖 EP 同名规则。箭头同色。
// z-index 不在此处理：由 FormBlock 侧按「所在层」动态计算——位于 el-dialog 内时取该
// dialog 遮罩层 z-index + 1（浮于本层内容之上、允许被后续嵌套 dialog 遮挡）；
// 不在 dialog 内时为 32 位整型最大值（见 FormBlock.vue resolveErrorTipZIndex）。
.el-popper.is-dark.form-pro__error-popper {
  background: var(--el-color-error);
  border-color: var(--el-color-error);
  color: #fff;
  padding: 2px 6px;
  // EP 默认 line-height: 20px 相对 12px 字号偏大，气泡显得偏高、文字视觉重心偏上；
  // 收紧行高使上下间隙观感一致、整体更紧凑
  line-height: 16px;

  .el-popper__arrow::before {
    background: var(--el-color-error);
    border-color: var(--el-color-error);
  }

  // 三角箭头固定到气泡右侧：默认 popper 以整个 el-form-item 为锚点，箭头会向
  // 锚点中心对齐而偏在气泡左侧；气泡锚定在 item 右上角，箭头置于右侧更贴合指向。
  // popper 计算的内联 left 用 !important 覆盖为 right 定位
  .el-popper__arrow {
    left: auto !important;
    right: 12px;
  }
}
</style>

