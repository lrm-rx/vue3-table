<script setup>
/**
 * BaseButton 评论区操作按钮
 * 基于 element-plus ElButton 二次封装：
 *  - 统一评论区视觉：小号、默认 text 无边框，active 时点亮为 B站粉
 *  - filled（type=primary）使用 B站粉主题变量，替代 EP 默认蓝
 *  - 适用于：最热/最新 Tab、点赞、回复、查看全部回复、发布
 */
import { computed } from "vue";

const props = defineProps({
  // EP 按钮类型：'' / primary / success / danger …
  type: { type: String, default: "" },
  // 尺寸
  size: { type: String, default: "small" },
  // 原生 type
  nativeType: { type: String, default: "button" },
  // 禁用
  disabled: { type: Boolean, default: false },
  // 加载中
  loading: { type: Boolean, default: false },
  // text 无边框样式（评论区操作按钮默认开启）
  text: { type: Boolean, default: true },
  // 激活态（已点赞 / 当前 Tab）：点亮为 B站粉
  active: { type: Boolean, default: false },
});

const emit = defineEmits(["click"]);

// filled 主按钮：把 EP primary 蓝色变量在组件内替换为 B站粉，
// 同时覆盖其明暗衍生变量，保证 hover / active / disabled 态一致
const themeVars = computed(() =>
  props.type === "primary"
    ? {
        "--el-color-primary": "#fb7299",
        "--el-color-primary-light-3": "#fc98b4",
        "--el-color-primary-light-5": "#fcb3c7",
        "--el-color-primary-light-7": "#fdcedb",
        "--el-color-primary-light-8": "#fddce5",
        "--el-color-primary-light-9": "#feebf0",
        "--el-color-primary-dark-2": "#e55f84",
      }
    : {},
);

const onClick = (event) => {
  emit("click", event);
};
</script>

<template>
  <el-button
    class="biz-button"
    :class="{ 'is-active': active }"
    :style="themeVars"
    :type="type"
    :size="size"
    :native-type="nativeType"
    :disabled="disabled"
    :loading="loading"
    :text="text"
    @click="onClick"
  >
    <slot />
  </el-button>
</template>

<style scoped lang="scss">
.biz-button {
  // text 操作按钮的常规色与 B站评论区一致
  --el-button-text-color: #61666d;
  --el-button-hover-text-color: #fb7299;
  font-weight: 400;

  // 激活态：点赞 / 当前 Tab
  &.is-active {
    color: #fb7299;

    &:hover,
    &:focus {
      color: #fb7299;
    }
  }
}
</style>
