<script setup>
/**
 * FormGroupToggle —— 配合 FormPro 使用的「折叠全部 / 展开全部」一键切换按钮。
 *
 * 背景：分组头内的 allToggle 按钮（已移除）在表单出现垂直滚动条后会随内容滚走、
 * 不可见；本组件与 FormPro 完全解耦，可放置在任意位置（顶部工具栏 / fixed 悬浮条等），
 * 仅通过 form 属性绑定 FormPro 实例即可使用——父级零 JS 样板代码。
 *
 * 用法：
 *   <script setup>
 *   import FormPro from "@/components/formPro/index.vue";
 *   import FormGroupToggle from "@/components/formPro/FormGroupToggle.vue";
 *   const formRef = ref();
 *   <／script>
 *
 *   <FormGroupToggle :form="formRef" />
 *   <FormPro ref="formRef" v-model="formData" :items="items" />
 *
 * 工作原理：
 *  - 文案由 FormPro 暴露的响应式只读状态 allGroupsCollapsed 驱动：
 *    所有可折叠分组均已折叠 → 「展开全部」，否则 → 「折叠全部」；
 *  - 点击调用 FormPro 实例方法 toggleAllGroups()（内部按当前状态自动选择展开/折叠）。
 *
 * 扩展：
 *  - expandText / collapseText 定制文案；
 *  - el-tag 的 type / size / effect 等属性经 $attrs 透传（默认值同 el-tag：type="primary" effect="light"）；
 *  - 默认插槽可完全自定义按钮内容（作用域参数：{ allCollapsed, toggle }）。
 */
import { computed } from "vue";

defineOptions({ name: "FormGroupToggle", inheritAttrs: false });

const props = defineProps({
  // FormPro 组件实例（模板 ref：直接写 :form="formRef"，模板会自动解包 ref）
  // 挂载前为 null，此时禁用（不可点击）
  form: { type: Object, default: null },
  // 全部折叠后的按钮文案
  expandText: { type: String, default: "展开全部" },
  // 未全部折叠时的按钮文案
  collapseText: { type: String, default: "折叠全部" },
});

// 所有「可折叠」分组是否均已折叠（读取 FormPro 暴露的响应式 getter，状态变化自动更新文案）
const allCollapsed = computed(() => !!props.form?.allGroupsCollapsed);
const text = computed(() =>
  allCollapsed.value ? props.expandText : props.collapseText,
);
// form 未就绪（挂载前为 null）时不可点击
const toggle = () => {
  if (!props.form) return;
  props.form.toggleAllGroups?.();
};
</script>

<template>
  <el-tag
    v-bind="$attrs"
    :class="['form-group-toggle', { 'is-disabled': !form }]"
    @click="toggle"
  >
    <slot :all-collapsed="allCollapsed" :toggle="toggle">{{ text }}</slot>
  </el-tag>
</template>

<style scoped lang="scss">
/* el-tag 默认不可点击：补手型与禁选；禁用态（form 未就绪）降透明度 + 禁用手型 */
.form-group-toggle {
  cursor: pointer;
  user-select: none;

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}
</style>
