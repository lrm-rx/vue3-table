<script setup lang="jsx">
/**
 * FormPro 内部：渲染单个「分组块」（匿名组或具名分组）。
 * 拆分为子组件，使 index.vue 模板保持简洁，同时 JSX 渲染逻辑独立可测。
 */
import { computed, useSlots, h, resolveComponent, mergeProps } from "vue";
import { ElRow, ElCol, ElFormItem, ElIcon } from "element-plus";
import { ArrowRight, ArrowDown } from "@element-plus/icons-vue";
import {
  GRID_COLS,
  isInsertItem,
  isFieldItem,
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
});

const emit = defineEmits(["toggle-group"]);
const slots = useSlots();

const entries = computed(() =>
  props.collapsed
    ? []
    : resolveVisibleEntries(props.block.items, {
        data: props.formData,
        onlyRequired: props.onlyRequired,
        formRules: props.formRules,
        formSpan: props.formSpan,
      }),
);

const setField = (field, v) => {
  props.formData[field] = v;
};

const renderFieldControl = (item) => {
  const ctx = {
    value: props.formData[item.field],
    field: item.field,
    data: props.formData,
  };
  if (typeof item.render === "function") return item.render(h, ctx);
  const slotName = item.slot || item.field;
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
    "onUpdate:modelValue": (v) => setField(item.field, v),
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

const renderFieldEntry = (entry) => {
  const { item, span, required } = entry;
  return (
    <ElCol span={span}>
      <ElFormItem
        label={item.label}
        prop={item.field}
        required={required}
        rules={item.rules}
        {...(item.itemProps || {})}
      >
        {renderFieldControl(item)}
      </ElFormItem>
    </ElCol>
  );
};

const renderInsertEntry = (entry) => {
  const { item, span } = entry;
  let content = null;
  if (typeof item.render === "function") {
    content = item.render(h, { data: props.formData });
  } else if (item.slot && slots[item.slot]) {
    content = slots[item.slot]({ data: props.formData });
  }
  if (span >= GRID_COLS) return content;
  return <ElCol span={span}>{content}</ElCol>;
};

const render = () => {
  const { group } = props.block;
  const colNodes = entries.value.map((e) =>
    e.kind === "field" ? renderFieldEntry(e) : renderInsertEntry(e),
  );
  const row = (
    <ElRow gutter={props.gutter} class="form-pro__row">
      {colNodes}
    </ElRow>
  );
  if (!group) return row;
  return (
    <div class="form-pro__group" data-collapsed={props.collapsed}>
      <div class="form-pro__group-header" onClick={() => emit("toggle-group")}>
        <ElIcon class="form-pro__group-arrow">
          {props.collapsed ? <ArrowRight /> : <ArrowDown />}
        </ElIcon>
        <span class="form-pro__group-title">{group.title}</span>
        {slots[`group-${group.title}`]
          ? slots[`group-${group.title}`]({ group, collapsed: props.collapsed })
          : null}
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
