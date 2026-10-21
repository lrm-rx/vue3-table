<script setup lang="jsx">
/**
 * FormPro 内部：渲染单个「分组块」（匿名组或具名分组）。
 * 拆分为子组件，使 index.vue 模板保持简洁，同时 JSX 渲染逻辑独立可测。
 */
import { computed, ref, useSlots, h, resolveComponent, mergeProps, isRef, toRaw } from "vue";
import { ElRow, ElCol, ElFormItem, ElIcon, ElTooltip, ElTag } from "element-plus";
import { ArrowRight, ArrowDown, ArrowUp } from "@element-plus/icons-vue";
import {
  GRID_COLS,
  resolveVisibleEntries,
  resolveFieldOptions,
  resolveDynamicControlState,
  resolveGroupTitleStyle,
  resolveVisualRowIndexes,
  collectTipRows,
} from "./utils.js";
import UploadPro from "./UploadPro.vue";

// FormPro 内置控件映射：itemRender.name 命中时直接使用随包组件，
// 无需在 main.js 全局注册（render 函数中 resolveComponent 无法命中
// unplugin-vue-components 的按需自动导入）。
const BUILTIN_ITEM_RENDERS = {
  uploadpro: UploadPro,
};

const resolveItemRenderComponent = (name) => {
  const hit = BUILTIN_ITEM_RENDERS[String(name || "").toLowerCase()];
  return hit || resolveComponent(name);
};

const props = defineProps({
  block: { type: Object, required: true },
  formData: { type: Object, required: true },
  onlyRequired: { type: Boolean, default: false },
  formRules: { type: Object, default: () => ({}) },
  formSpan: { type: Number, default: GRID_COLS },
  gutter: { type: [Number, Array], default: 0 },
  collapsed: { type: Boolean, default: false },
  // 分组是否可折叠（显示折叠/展开按钮）；不可折叠时分组恒展开且标题不可点击
  collapsible: { type: Boolean, default: true },
  // 所有「可折叠」分组是否都已折叠（驱动「展开全部 / 折叠全部」按钮文案）
  allCollapsed: { type: Boolean, default: false },
  // 表单级：标题是否带冒号（item.titleColon 可单独覆盖）
  titleColon: { type: Boolean, default: false },
  // 表单级：label 是否统一加粗（item.titleBold 可单独覆盖，项级优先级更高）
  titleBold: { type: Boolean, default: false },
  // 由父级传入的「字段 prop → 当前校验错误信息」映射，用于驱动 item.tip 填写提示的显隐
  fieldErrors: { type: Object, default: () => ({}) },
  // 由父级传入的「字段 prop → el-form-item 实例」映射，渲染时回填，供父级暴露
  formItemRefs: { type: Object, default: () => ({}) },
  // 边框表格样式开关：开启后在行/列单元格上追加修饰类，由 index.vue 的样式绘制边框
  border: { type: Boolean, default: false },
  // 紧凑型表单开关：控制「间隔收紧列」的修饰类，并在校验失败时以 el-tooltip 展示错误提示
  // （tooltip 样式与自动隐藏由 index.vue 承担：样式类 form-pro__error-popper、errorTipVisible 显隐驱动）
  compact: { type: Boolean, default: false },
  // 紧凑模式：字段 prop → 校验错误 tooltip 是否可见（由 index.vue 的 validate 事件 + 定时器驱动）
  errorTipVisible: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["toggle-group", "toggle-all"]);
const slots = useSlots();

// item 级折叠（vxe-form folding）：默认收起，collapseNode 按钮切换
const foldingCollapsed = ref(true);

const entries = computed(() =>
  props.collapsed
    ? []
    : resolveVisibleEntries(props.block.items, {
        data: props.formData,
        onlyRequired: props.onlyRequired,
        formRules: props.formRules,
        formSpan: props.formSpan,
        foldingCollapsed: foldingCollapsed.value,
      }),
);

const setField = (field, v) => {
  props.formData[field] = v;
};

// —— 紧凑模式（compact）：可视行划分 ——
// el-row 内所有 el-col 流式换行，DOM 上没有「行」结构；按累计 span ≤ 24 还原可视行，
// 用于「行内任一项配置了 tip → 整行保持默认间隔」的判定（见 index.vue 样式注释）。
const entryRowIndexes = computed(() =>
  resolveVisualRowIndexes(entries.value, GRID_COLS),
);
const tipRows = computed(() =>
  collectTipRows(entries.value, entryRowIndexes.value),
);

const renderFieldControl = (item) => {
  const ctx = {
    value: props.formData[item.prop],
    prop: item.prop,
    data: props.formData,
  };
  if (typeof item.render === "function") return item.render(ctx, h);
  const slotName = item.slot || item.prop;
  if (slots[slotName]) return slots[slotName](ctx);
  const ir = item.itemRender;
  if (ir && ir.name) return renderByItemRender(ir, item, ctx);
  return <span>{ctx.value ?? ""}</span>;
};

const pickOptionComponent = (name) => {
  const n = String(name).toLowerCase();
  if (n.includes("select")) return resolveComponent("el-option");
  if (n.includes("radio")) return resolveComponent("el-radio");
  if (n.includes("checkbox")) return resolveComponent("el-checkbox");
  return null;
};

const renderByItemRender = (ir, item, ctx) => {
  const comp = resolveItemRenderComponent(ir.name);
  // 内部 v-model 绑定放在 ir.props 之后，确保用户在 itemRender.props 中误写
  // modelValue / onUpdate:modelValue 不会破坏组件的双向同步。
  const bindProps = {
    ...(ir.props || {}),
    modelValue: ctx.value,
    "onUpdate:modelValue": (v) => setField(item.prop, v),
  };
  // 动态禁用 / 只读：item.disabledWhen / item.readonlyWhen 依据当前表单数据求值（ctx 同 options 函数形态），
  // 与静态 itemRender.props.disabled / readonly 为「或」关系（静态 true 恒生效，动态侧只追加不覆盖）。
  // 求值发生在 render 期间，依赖字段变化时自动重渲染（与函数形态 options 同理）。
  const dynState = resolveDynamicControlState(item, ctx);
  if (dynState.disabled) bindProps.disabled = true;
  if (dynState.readonly) bindProps.readonly = true;
  const children = [];
  // 解析 options：支持 静态数组 / 函数(ctx) / 响应式 ref 三种形态。
  // 先解包 ref（Vue 耦合），再交给纯函数 resolveFieldOptions 处理数组/函数。
  // 读取发生在 render 期间 → ref 与函数内读取的响应式数据都会被 Vue 追踪依赖，
  // 后端数据到位或联动字段变化时自动重渲染。
  const rawOptions = isRef(ir.options) ? ir.options.value : ir.options;
  const optionsList = resolveFieldOptions(rawOptions, ctx);
  if (optionsList.length) {
    const optComp = pickOptionComponent(ir.name);
    if (optComp) {
      const isOptionTag = /select/i.test(ir.name);
      for (const opt of optionsList) {
        // el-option：value 必填，label 为显示文本；
        // el-radio / el-checkbox：label 即值，显示文本走默认插槽
        const optProps = isOptionTag
          ? { value: opt.value, label: opt.label }
          : { label: opt.value };
        children.push(
          h(optComp, { key: opt.value, ...optProps, ...(opt.props || {}) }, () =>
            isOptionTag ? undefined : opt.label,
          ),
        );
      }
    }
  }
  let node = h(comp, bindProps, children.length ? () => children : undefined);
  if (ir.events && typeof ir.events === "object") {
    const ev = {};
    for (const [k, fn] of Object.entries(ir.events)) {
      ev[`on${k.charAt(0).toUpperCase()}${k.slice(1)}`] = fn;
    }
    node = h(node.type, mergeProps(node.props || {}, ev), node.children);
  }
  return node;
};

// —— 标题渲染：冒号 / 加粗 / 溢出隐藏 / 前后缀图标（对齐 vxe-form title* 能力）——
const withTip = (node, tip) =>
  tip ? h(ElTooltip, { content: tip }, () => node) : node;

const renderTitleIcon = (icon) => {
  if (icon == null) return null;
  // 传入图标组件（如 @element-plus/icons-vue）→ 用 ElIcon 包裹；否则原样渲染
  // toRaw 防御：调用方若把组件对象塞进 reactive/ref，此处剥离响应式代理，避免
  // "Vue received a Component that was made a reactive object" 性能警告。
  const comp = typeof icon === "function" || (icon && typeof icon === "object") ? toRaw(icon) : icon;
  const inner =
    typeof comp === "function" || (comp && typeof comp === "object")
      ? h(comp)
      : comp;
  return h(ElIcon, { class: "form-pro__title-icon" }, () => inner);
};

const buildLabel = (item) => {
  const colon = item.titleColon != null ? item.titleColon : props.titleColon;
  // label 加粗：项级 titleBold 显式设置时优先（true/false 均生效），否则跟随表单级 titleBold
  const bold = item.titleBold != null ? !!item.titleBold : props.titleBold;
  const ellipsis =
    item.titleOverflow === "ellipsis" || item.titleOverflow === true;
  const prefixNode = withTip(
    renderTitleIcon(item.titlePrefix),
    item.titlePrefixTip,
  );
  const suffixNode = withTip(
    renderTitleIcon(item.titleSuffix),
    item.titleSuffixTip,
  );
  const contentStyle = {};
  if (bold) contentStyle.fontWeight = 700;
  if (ellipsis) {
    Object.assign(contentStyle, {
      display: "inline-block",
      maxWidth: item.titleWidth ? `${item.titleWidth}px` : "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      verticalAlign: "middle",
    });
  }
  const children = [
    prefixNode
      ? h("span", { class: "form-pro__title-prefix" }, [prefixNode])
      : null,
    h(
      "span",
      { class: "form-pro__title-content", style: contentStyle },
      item.label,
    ),
    suffixNode
      ? h("span", { class: "form-pro__title-suffix" }, [suffixNode])
      : null,
    colon ? h("span", { class: "form-pro__title-colon" }, ":") : null,
  ].filter(Boolean);
  return h("span", { class: "form-pro__title" }, children);
};

// —— 控件前后缀（prefix / suffix）：在 el-form-item 内容区、控件的前后渲染文本/元素 ——
// 支持两种形态：
//   ① 字符串 → 渲染为纯文本（如 "￥"、"个"、"元"）
//   ② 函数 (ctx, h) => VNode → 自定义渲染，ctx = { value, prop, data }，
//      可读取当前字段值与表单数据，实现「有 xxx 个」等动态文本。
// 应用场景：输入框前加货币符号、后加单位；或展示与当前值联动的描述文本。
const resolveFieldAffix = (val, ctx) => {
  if (val == null || val === "") return null;
  if (typeof val === "function") return val(ctx, h);
  return h("span", { class: "form-pro__field-affix-text" }, String(val));
};

const renderFieldContent = (item) => {
  const ctx = {
    value: props.formData[item.prop],
    prop: item.prop,
    data: props.formData,
  };
  const control = renderFieldControl(item);
  const prefixNode = resolveFieldAffix(item.prefix, ctx);
  const suffixNode = resolveFieldAffix(item.suffix, ctx);
  // 无前后缀时直接返回控件，保持原有 DOM 结构不变（零侵入）
  if (!prefixNode && !suffixNode) return control;
  const children = [
    prefixNode
      ? h("span", { class: "form-pro__field-prefix" }, [prefixNode])
      : null,
    h("div", { class: "form-pro__field-control" }, [control]),
    suffixNode
      ? h("span", { class: "form-pro__field-suffix" }, [suffixNode])
      : null,
  ].filter(Boolean);
  return h("div", { class: "form-pro__field-control-wrap" }, children);
};

// —— 紧凑模式：校验错误 tooltip ——
// compact 下原生 .el-form-item__error 由样式隐藏（见 index.vue），错误信息改用 el-tooltip
// 锚定在 el-form-item 根元素右上角（placement="top-end"）展示：
//   - 受控模式：只传 visible 布尔值、不传 onUpdate:visible → trigger 交互（hover/click/
//     点击外部）全部失效，显隐完全由父级 errorTipVisible 驱动（validate 事件触发，
//     errorTipDuration 秒后自动隐藏）；
//   - zIndex 按「所在层」动态计算：表单位于 el-dialog 内时取该 dialog 遮罩层
//     （.el-overlay）的 z-index + 1 —— 无论该 dialog 的 z-index 多大 tooltip 都浮在其
//     内容之上；而后续打开的嵌套 dialog 会由 EP 分配更高的 z-index，tooltip 允许被其
//     遮挡（只需覆盖所在层，不越层）。不在 dialog 内时退化为 32 位整型最大值；
//   - 仅控制 tooltip 显隐，el-form-item 的 is-error 校验状态不受影响——tooltip 隐藏后
//     控件的错误样式（如红色边框）保持不变。
const MAX_Z_INDEX = 2147483647;

const resolveErrorTipZIndex = (prop) => {
  const inst = props.formItemRefs?.[prop];
  // formItemRefs 存的是 el-form-item 组件实例，$el 为其根元素
  const el = inst?.$el ?? inst;
  // 沿 DOM 向上找所在 el-dialog 的遮罩层（tooltip teleport 到 body，与其平级比较 z-index）
  const overlay = el?.closest?.(".el-overlay");
  if (overlay) {
    const z = parseInt(overlay.style?.zIndex, 10);
    if (Number.isFinite(z)) return z + 1;
  }
  return MAX_Z_INDEX;
};

const renderErrorTip = (item) => {
  if (!props.compact) return null;
  const message = props.fieldErrors?.[item.prop];
  if (!message) return null;
  return h(ElTooltip, {
    visible: !!(props.errorTipVisible && props.errorTipVisible[item.prop]),
    virtualTriggering: true,
    // el-form-item 组件实例即可：ElPopperTrigger 内部经 unrefElement 解包出根元素，
    // 以其右上角（top-end）为锚点定位
    virtualRef: props.formItemRefs?.[item.prop],
    placement: "top-end",
    effect: "dark",
    content: message,
    popperClass: "form-pro__error-popper",
    zIndex: resolveErrorTipZIndex(item.prop),
    showAfter: 0,
    hideAfter: 0,
  });
};

const renderFieldEntry = (entry, idx) => {
  const { item, span, required } = entry;
  // 填写/选择提示 tip：位于校验错误提示同一位置（控件下方），颜色为 success 主色调。
  // 显示时机：只要当前字段未触发校验不通过（fieldErrors 中无该 prop）就一直显示；
  // 一旦校验不通过则隐藏 tip，让位给 el-form-item 的错误提示。
  const tip = item.tip;
  const hasError = !!(props.fieldErrors && props.fieldErrors[item.prop]);
  const showTip = tip != null && tip !== "" && !hasError;
  const formItem = h(
    ElFormItem,
    {
      // 把该 el-form-item 的完整实例回填到父级传入的映射（按 prop 索引），
      // 供 FormPro 暴露 getFormItem(prop) / formItemRefs。
      ref: (el) => {
        if (el) props.formItemRefs[item.prop] = el;
        else delete props.formItemRefs[item.prop];
      },
      label: item.label,
      prop: item.prop,
      required,
      rules: item.rules,
      ...(item.itemProps || {}),
    },
    {
      label: () => buildLabel(item),
      default: () => {
        const nodes = [renderFieldContent(item)];
        if (showTip) {
          nodes.push(h("div", { class: "form-pro__field-tip", title: tip }, tip));
        }
        return nodes;
      },
    },
  );
  // 紧凑模式：所在可视行不含 tip 项 → 间隔收紧（6px，样式见 index.vue）；
  // 行内任一项配置了 tip → 整行保持默认间隔（含 tip 行的 col 不加修饰类）
  const rowIdx = entryRowIndexes.value[idx] ?? 0;
  const colClass = {
    "form-pro__col--tight": props.compact && !tipRows.value.has(rowIdx),
  };
  const errorTipNode = renderErrorTip(item);
  return h(
    ElCol,
    { span, class: colClass },
    () => (errorTipNode ? [formItem, errorTipNode] : formItem),
  );
};

const renderCollapseNode = (entry) => {
  const { item, span } = entry;
  const collapsed = foldingCollapsed.value;
  const toggle = () => {
    foldingCollapsed.value = !collapsed;
  };
  // 默认展开/收起按钮；支持 item.render / item.slot 自定义
  let content;
  if (typeof item.render === "function") {
    content = item.render({ collapsed, toggle, data: props.formData }, h);
  } else if (item.slot && slots[item.slot]) {
    content = slots[item.slot]({ collapsed, toggle, data: props.formData });
  } else {
    content = h(
      "span",
      {
        class: "form-pro__collapse-btn",
        onClick: toggle,
      },
      () => [
        collapsed ? "展开" : "收起",
        h(ElIcon, { class: "form-pro__collapse-arrow" }, () =>
          h(collapsed ? ArrowDown : ArrowUp),
        ),
      ],
    );
  }
  const wrap = h(
    "div",
    {
      style: { textAlign: item.align || "right" },
    },
    [content],
  );
  // span 控制占位宽度；未设置时默认 24（整行），由 utils 解析保证。
  return h(ElCol, { span }, () => wrap);
};

const renderInsertEntry = (entry) => {
  const { item, span } = entry;
  let content = null;
  if (typeof item.render === "function") {
    content = item.render({ data: props.formData }, h);
  } else if (item.slot && slots[item.slot]) {
    content = slots[item.slot]({ data: props.formData });
  }
  // 始终用 el-col 包裹：保证 span=24 时内容（如表格）能撑满整行宽度
  return <ElCol span={span}>{content}</ElCol>;
};

const render = () => {
  const { group } = props.block;
  const colNodes = entries.value.map((e, idx) => {
    if (e.kind === "field") return renderFieldEntry(e, idx);
    if (e.kind === "collapseNode") return renderCollapseNode(e);
    return renderInsertEntry(e);
  });
  const row = (
    <ElRow
      gutter={props.gutter}
      class={{ "form-pro__row": true, "form-pro__row--border": props.border }}
    >
      {colNodes}
    </ElRow>
  );
  if (!group) return row;
  const canCollapse = props.collapsible !== false;
  const headerClass = canCollapse
    ? "form-pro__group-header"
    : "form-pro__group-header is-static";
  const toggle = () => canCollapse && emit("toggle-group");
  // 分组标题与右侧按钮之间的扩展区域：支持 group.render（JSX）/ group.slot（具名插槽）
  // 渲染提示信息等元素；该区域独立于可点击区，点击不会触发分组折叠。
  const renderGroupExtra = () => {
    const ctx = { group, collapsed: props.collapsed, data: props.formData };
    if (typeof group.render === "function") return group.render(ctx, h);
    if (group.slot && slots[group.slot]) return slots[group.slot](ctx);
    return null;
  };
  const groupExtra = renderGroupExtra();
  return (
    <div class="form-pro__group" data-collapsed={props.collapsed}>
      <div class={headerClass}>
        {/* 可点击区：箭头 + 标题（独立命中区，点击切换分组折叠） */}
        <div class="form-pro__group-header-main" onClick={canCollapse ? toggle : undefined}>
          {canCollapse ? (
            <ElIcon class="form-pro__group-arrow">
              {props.collapsed ? <ArrowRight /> : <ArrowDown />}
            </ElIcon>
          ) : null}
          {/* 分组标题：titleStyle 自定义颜色/字号等；titleBold 控制加粗（true→700 / false→400 / 默认继承 600） */}
          <span class="form-pro__group-title" style={resolveGroupTitleStyle(group)}>
            {group.title}
          </span>
          {slots[`group-${group.title}`]
            ? slots[`group-${group.title}`]({ group, collapsed: props.collapsed })
            : null}
        </div>
        {/* 扩展区：标题与右侧按钮之间，渲染提示信息等（render / slot） */}
        {groupExtra ? (
          <span class="form-pro__group-header-extra">{groupExtra}</span>
        ) : null}
        {/* 右侧仅保留「展开全部 / 折叠全部」按钮（allToggle）；单组折叠已由标题区点击承载，
            不再渲染多余的「展开/收起」按钮。allToggle 按钮复用 form-pro__group-toggle 的靠右样式。 */}
        {canCollapse && group.allToggle ? (
          <span
            class="form-pro__group-toggle form-pro__group-toggle-all"
            onClick={() => emit("toggle-all")}
          >
            <ElTag type="primary" effect="plain" size="small">
              {props.allCollapsed ? "展开全部" : "折叠全部"}
            </ElTag>
          </span>
        ) : null}
      </div>
      {!props.collapsed && <div class="form-pro__group-body">{row}</div>}
    </div>
  );
};

defineExpose({ entries });
</script>

<template>
  <component :is="render" />
</template>

<style lang="scss" scoped>
// FormBlock 的 DOM 全部由 render 函数（h()）动态生成，深层子节点不会带上 scoped 的 data-v 属性，
// 因此这些类必须用 :deep() 才能命中（依赖组件根节点携带的作用域属性做祖先匹配）。
:deep(.form-pro__title) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
:deep(.form-pro__title-prefix) {
  margin-right: 4px;
  display: inline-flex;
  align-items: center;
}
:deep(.form-pro__title-suffix) {
  margin-left: 4px;
  display: inline-flex;
  align-items: center;
}
:deep(.form-pro__title-icon) {
  display: inline-flex;
  align-items: center;
  cursor: help;
  color: var(--el-text-color-secondary);
}
:deep(.form-pro__title-colon) {
  margin-left: 2px;
  font-weight: normal;
}
// 控件前后缀容器：prefix + 控件 + suffix 横向排列、垂直居中。
// 控件槽位拉满前后缀之间的剩余空间，使「有/无前后缀」的 item 右边缘对齐（上下整齐）；
// suffix 随之位于内容区右端。仅在配置了 prefix / suffix 时渲染；无前后缀时 DOM 与原结构一致（零侵入）。
// （DOM 由 render 函数生成，需 :deep 命中）
:deep(.form-pro__field-control-wrap) {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
:deep(.form-pro__field-prefix),
:deep(.form-pro__field-suffix) {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--el-text-color-regular);
  font-size: var(--el-font-size-base, 14px);
  line-height: 1;
  white-space: nowrap;
}
// 控件槽位：拉满剩余空间（flex:1 1 auto），与无前后缀 item 的控件右边缘对齐。
// min-width:0 允许内部控件在空间不足时正确收缩。
:deep(.form-pro__field-control) {
  flex: 1 1 auto;
  min-width: 0;
}
// el-input-number 默认固定 150px（EP 样式），与 el-input / el-select / el-date-editor 等
// 拉满内容区的控件混排时右边缘不对齐（上下 item 参差不齐）；此处统一拉满。
// 仅作用于 FormPro 直接渲染的控件根（内容区直接子级 / 前后缀槽位直接子级），
// 不影响用户自定义 render/slot 内部的嵌套控件。
:deep(.el-form-item__content > .el-input-number),
:deep(.form-pro__field-control > .el-input-number) {
  width: 100%;
}
// 前后缀纯文本节点（字符串形态）的样式占位
:deep(.form-pro__field-affix-text) {
  display: inline;
}
// 字段「填写/选择提示」：与 el-form-item 错误提示共用同一位置（控件正下方，绝对定位），
// 颜色为 success 主色调。仅在字段未校验失败时渲染；校验失败时由 el-form-item 错误提示占据该位置。
// （DOM 由 render 函数生成，需 :deep 命中；定位参照 .el-form-item__content 的 position:relative）
:deep(.form-pro__field-tip) {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-width: 100%;
  color: var(--el-color-success);
  font-size: 12px;
  line-height: 1.4;
  padding-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
// 校验错误提示（el-form 原生 .el-form-item__error）：空间不足时单行省略为 …，
// 完整文本通过 title 属性悬浮展示（title 由 index.vue 的校验事件注入）。
:deep(.el-form-item__error) {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:deep(.form-pro__collapse-btn) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  user-select: none;
  padding-left: 6px;
  font-size: var(--el-form-label-font-size, var(--el-font-size-base));
  line-height: var(--el-form-item-label-height, var(--el-component-size));
  height: var(--el-form-item-label-height, var(--el-component-size));
  color: var(--el-text-color-regular);

  &:hover {
    color: var(--el-color-primary);
  }
}
:deep(.form-pro__collapse-arrow) {
  font-size: 12px;
  transition: transform 0.2s;
}
// 分组样式：分组 DOM 同样由本组件 render 函数生成，需用 :deep() 命中
:deep(.form-pro__group) {
  margin-bottom: 12px;
}
:deep(.form-pro__group-header) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
// 可点击区（箭头 + 标题）：承载折叠/展开点击；悬浮时文本与箭头颜色不变，仅保留手型提示可点击
:deep(.form-pro__group-header-main) {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
// 不可折叠：无手型
:deep(.form-pro__group-header.is-static .form-pro__group-header-main) {
  cursor: default;
}
// 分组标题前的折叠/展开图标：primary 主色调并视觉加粗。
// Element 箭头图标为填充型 SVG（无描边），通过叠加同色细描边实现加粗观感
:deep(.form-pro__group-arrow) {
  transition: transform 0.2s;
  font-size: 14px;
  color: var(--el-color-primary);

  svg {
    stroke: currentColor;
    stroke-width: 64;
  }
}
:deep(.form-pro__group-title) {
  font-size: 14px;
}
// 分组标题与右侧按钮之间的扩展区（提示信息等）：由 header flex 容器负责垂直居中与间距，
// 自身仅需 inline-flex 使内部元素（图标/文字）按一行排列
:deep(.form-pro__group-header-extra) {
  display: inline-flex;
  align-items: center;
}
// 折叠/展开按钮（el-tag）：靠右显示；自身作为 flex 容器让内部 el-tag 垂直居中
// （el-tag 为 inline-flex，默认按行内基线对齐会在 block 容器内偏下，需显式 align-items）
:deep(.form-pro__group-toggle) {
  margin-left: auto;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
// 「展开全部 / 折叠全部」按钮
:deep(.form-pro__group-toggle-all) {
  margin-left: 6px;
}
:deep(.form-pro__group-body) {
  padding-top: 4px;
}
</style>
