<script setup>
/**
 * FormPro —— 基于 el-form 二次封装的配置式表单组件。
 *
 * 特性：
 *  0. 对齐 vxe-form 配置式表单能力（items / span / folding / visibleMethod / itemRender ...）
 *  1. 完整保留 el-form 全部属性、实例方法与事件（含自定义事件）：
 *     - 属性：inheritAttrs=false，未声明属性经 formProps 透传到 <el-form>
 *     - 方法：defineExpose 暴露 formRef 及 validate/resetFields/clearValidate/scrollToField/validateField
 *     - 事件：透传 attrs 中的监听器到 <el-form>，自定义事件照常触发
 *  2. 24 栅格分列：表单级 span 默认值 + 每项 span 覆盖（项级优先级更高）
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
import { splitIntoGroups } from "./utils.js";
import FormBlock from "./FormBlock.vue";

defineOptions({ name: "FormPro", inheritAttrs: false });

const props = defineProps({
  // 表单数据（v-model）
  modelValue: { type: Object, default: () => ({}) },
  // 配置项数组
  items: { type: Array, default: () => [] },
  // 默认每项栅格占位（24 栅格）；item.span 优先级更高
  span: { type: Number, default: 24 },
  // el-row 间距
  gutter: { type: [Number, Array], default: 0 },
  // 仅显示必填项
  onlyRequired: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const formRef = ref(null);

// —— 内部表单数据：与 modelValue 双向同步 ——
const formData = reactive({ ...(props.modelValue || {}) });

const syncFromParent = (val) => {
  const next = { ...(val || {}) };
  if (isEqual(next, formData)) return;
  for (const k of Object.keys(formData)) delete formData[k];
  Object.assign(formData, next);
};
// 父级 modelValue 变化 → 同步进内部 formData（值未变则跳过，避免回环）
watch(
  () => props.modelValue,
  (val) => syncFromParent(val),
  { deep: true },
);

// 内部 formData 变化 → 向父级回抛（值未变则跳过，避免回环）
watch(
  formData,
  (val) => {
    const snapshot = { ...val };
    if (isEqual(snapshot, props.modelValue)) return;
    emit("update:modelValue", snapshot);
  },
  { deep: true },
);

// —— el-form 透传属性：剥离已声明 props，其余（labelWidth/labelPosition/rules/inline...）透传 ——
const OWN_PROPS = ["modelValue", "items", "span", "gutter", "onlyRequired"];
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

// —— 分组折叠状态：以分组标题为 key ——
const collapsedMap = reactive({});
const isGroupCollapsed = (groupItem) => {
  const key = groupItem?.title || "__default__";
  if (collapsedMap[key] === undefined) return !!groupItem?.fold;
  return collapsedMap[key];
};
const toggleGroup = (groupItem) => {
  const key = groupItem?.title || "__default__";
  collapsedMap[key] = !isGroupCollapsed(groupItem);
};
watch(
  () => props.items,
  () => {
    for (const k of Object.keys(collapsedMap)) delete collapsedMap[k];
  },
);

const blocks = computed(() => splitIntoGroups(props.items));

// —— 暴露 el-form 实例与全部常用方法 ——
defineExpose({
  formRef,
  validate: (...args) => formRef.value?.validate?.(...args),
  validateField: (...args) => formRef.value?.validateField?.(...args),
  resetFields: (...args) => formRef.value?.resetFields?.(...args),
  clearValidate: (...args) => formRef.value?.clearValidate?.(...args),
  scrollToField: (...args) => formRef.value?.scrollToField?.(...args),
  formData,
});
</script>

<template>
  <el-form ref="formRef" v-bind="formPropsComputed">
    <FormBlock
      v-for="(block, idx) in blocks"
      :key="block.group ? block.group.title || idx : idx"
      :block="block"
      :form-data="formData"
      :only-required="onlyRequired"
      :form-rules="formRules"
      :form-span="span"
      :gutter="gutter"
      :collapsed="block.group ? isGroupCollapsed(block.group) : false"
      @toggle-group="block.group && toggleGroup(block.group)"
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
.form-pro {
  &__group {
    margin-bottom: 12px;
  }
  &__group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    cursor: pointer;
    user-select: none;
    font-weight: 600;
    color: var(--el-text-color-primary);

    &:hover {
      color: var(--el-color-primary);
    }
  }
  &__group-arrow {
    transition: transform 0.2s;
    font-size: 14px;
  }
  &__group-title {
    font-size: 14px;
  }
  &__group-body {
    padding-top: 4px;
  }
}
</style>
