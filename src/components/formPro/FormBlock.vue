<script setup lang="jsx">
/**
 * FormPro 内部：渲染单个「分组块」（匿名组或具名分组）。
 * 拆分为子组件，使 index.vue 模板保持简洁，同时 JSX 渲染逻辑独立可测。
 */
import { computed, ref, useSlots, h, resolveComponent, mergeProps } from "vue";
import { ElRow, ElCol, ElFormItem, ElIcon, ElTooltip, ElTag } from "element-plus";
import { ArrowRight, ArrowDown, ArrowUp } from "@element-plus/icons-vue";
import {
  GRID_COLS,
  resolveVisibleEntries,
} from "./utils.js";

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
  // 由父级传入的「字段 prop → el-form-item 实例」映射，渲染时回填，供父级暴露
  formItemRefs: { type: Object, default: () => ({}) },
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

const renderFieldControl = (item) => {
  const ctx = {
    value: props.formData[item.prop],
    prop: item.prop,
    data: props.formData,
  };
  if (typeof item.render === "function") return item.render(h, ctx);
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
  const comp = resolveComponent(ir.name);
  const bindProps = {
    modelValue: ctx.value,
    "onUpdate:modelValue": (v) => setField(item.prop, v),
    ...(ir.props || {}),
  };
  const children = [];
  if (Array.isArray(ir.options) && ir.options.length) {
    const optComp = pickOptionComponent(ir.name);
    if (optComp) {
      const isOptionTag = /select/i.test(ir.name);
      for (const opt of ir.options) {
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
  const inner =
    typeof icon === "function" || (icon && typeof icon === "object")
      ? h(icon)
      : icon;
  return h(ElIcon, { class: "form-pro__title-icon" }, () => inner);
};

const buildLabel = (item) => {
  const colon = item.titleColon != null ? item.titleColon : props.titleColon;
  const bold = !!item.titleBold;
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

const renderFieldEntry = (entry) => {
  const { item, span, required } = entry;
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
      default: () => renderFieldControl(item),
    },
  );
  return h(ElCol, { span }, () => formItem);
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
    content = item.render(h, { collapsed, toggle, data: props.formData });
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
    content = item.render(h, { data: props.formData });
  } else if (item.slot && slots[item.slot]) {
    content = slots[item.slot]({ data: props.formData });
  }
  // 始终用 el-col 包裹：保证 span=24 时内容（如表格）能撑满整行宽度
  return <ElCol span={span}>{content}</ElCol>;
};

const render = () => {
  const { group } = props.block;
  const colNodes = entries.value.map((e) => {
    if (e.kind === "field") return renderFieldEntry(e);
    if (e.kind === "collapseNode") return renderCollapseNode(e);
    return renderInsertEntry(e);
  });
  const row = (
    <ElRow gutter={props.gutter} class="form-pro__row">
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
    if (typeof group.render === "function") return group.render(h, ctx);
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
          <span class="form-pro__group-title">{group.title}</span>
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
:deep(.form-pro__group-arrow) {
  transition: transform 0.2s;
  font-size: 14px;
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
