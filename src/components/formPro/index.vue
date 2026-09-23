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
 *  5. JSX 渲染：item.render(h, ctx) 渲染控件
 *  6. 表单项间插入组件/元素：无 field 的项即为插入项，用 slot 或 render 渲染
 *  7. 条件显隐自动回流：隐藏项不渲染，el-col 流式布局后续项自动前移
 */
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  useAttrs,
  useSlots,
} from "vue";
import { isEqual } from "lodash-es";
import {
  splitIntoGroups,
  GRID_COLS,
  collectHiddenValueProps,
  buildInitialData,
  deriveDefaultValue,
  isFieldItem,
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
  gutter: { type: [Number, Array], default: 0 },
  // 仅显示必填项
  onlyRequired: { type: Boolean, default: false },
  // 表单级：标题是否带冒号（item.titleColon 可单独覆盖）
  titleColon: { type: Boolean, default: false },
  // 表单级：分组是否显示折叠/展开按钮（group.collapsible 可单独覆盖）；默认 true
  groupCollapsible: { type: Boolean, default: true },
  // 提交时是否移除「因 visible / visibleMethod 隐藏」的字段值（默认 false 不移除）。
  // 注意：onlyRequired 导致的隐藏不受影响（其值保留）；每项可用 item.removeValueOnHidden 单独覆盖。
  removeHiddenValues: { type: Boolean, default: false },
  // 自动补全初始值：根据 items 配置为未声明的字段填充合理默认值（Switch→false，CheckboxGroup→[]，其余→""），
  // 免去逐个声明 ""。item.defaultValue 可指定固定默认值；用户在 modelValue 中已提供的值始终优先。默认 true。
  autoFillDefaults: { type: Boolean, default: true },
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

const syncFromParent = (val) => {
  const incoming = { ...(val || {}) };
  // buildInitialData 会为所有字段补默认值；但父级 val 可能因 removeHiddenValues
  // 剔除了隐藏字段的键——此时不应把内部已有的隐藏字段值重置为默认值（会丢失用户输入）。
  // 因此：内部存在而 val 中缺失的键，保留内部值。
  const base = props.autoFillDefaults
    ? buildInitialData(props.items, incoming)
    : incoming;
  for (const k of Object.keys(formData)) {
    if (!(k in incoming) && formData[k] !== undefined) {
      base[k] = formData[k];
    }
  }
  if (isEqual(base, formData)) return;
  for (const k of Object.keys(formData)) delete formData[k];
  Object.assign(formData, base);
};
// 父级 modelValue 变化 → 同步进内部 formData（值未变则跳过，避免回环）
watch(
  () => props.modelValue,
  (val) => syncFromParent(val),
  { deep: true },
);

// 内部 formData 变化 → 向父级回抛（值未变则跳过，避免回环）
// 当 removeHiddenValues 开启时，回抛数据会排除「因 visible / visibleMethod 隐藏」的字段值
// （onlyRequired 隐藏的字段不受影响，值保留）。
// suppressEmit 为 true 时（fillMissingDefaults 静默补默认值）跳过本次回抛并复位。
watch(
  formData,
  (val) => {
    if (suppressEmit) return;
    const snapshot = buildSubmitData(val);
    if (isEqual(snapshot, props.modelValue)) return;
    emit("update:modelValue", snapshot);
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
    const snapshot = buildSubmitData(formData);
    if (isEqual(snapshot, props.modelValue)) return;
    emit("update:modelValue", snapshot);
  },
  { immediate: true },
);

/**
 * 对外暴露：获取当前提交数据（已按 removeHiddenValues 规则移除隐藏字段值）。
 * 应用场景：保存/提交时调用，避免把 visibleMethod 隐藏项的值传给后端。
 */
const getSubmitData = () => buildSubmitData(formData);

// el-form 透传属性：剥离已声明 props，其余（labelWidth/labelPosition/rules/inline...）透传
const OWN_PROPS = ["modelValue", "items", "columns", "span", "gutter", "onlyRequired", "titleColon", "groupCollapsible", "removeHiddenValues", "autoFillDefaults"];
const attrs = useAttrs();
const slots = useSlots();
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
  // 获取提交数据：按 removeHiddenValues 规则移除隐藏字段值（保存/提交时使用）
  getSubmitData,
  // 分组动态折叠：按标题操作单个 / 多个 / 全部分组
  setGroupCollapsed,
  toggleGroup: toggleGroupByTitle,
  setGroupsCollapsed,
  collapseAllGroups,
  expandAllGroups,
  toggleAllGroups,
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
  <el-form ref="formRef" v-bind="formPropsComputed">
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
      :collapsible="block.group ? isGroupCollapsible(block.group) : true"
      :collapsed="block.group ? (isGroupCollapsible(block.group) ? isGroupCollapsed(block.group) : false) : false"
      :all-collapsed="allGroupsCollapsed"
      :form-item-refs="formItemRefs"
      @toggle-group="block.group && isGroupCollapsible(block.group) && toggleGroup(block.group)"
      @toggle-all="toggleAllGroups"
    >
      <!-- 透传所有插槽给 FormBlock（字段插槽 #field、插入项插槽、分组标题插槽 group-xxx）-->
      <template v-for="(_, name) in $slots" #[name]="scope">
        <slot :name="name" v-bind="scope" />
      </template>
    </FormBlock>
    <slot />
  </el-form>
</template>

