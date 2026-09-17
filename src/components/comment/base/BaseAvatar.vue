<script setup>
/**
 * BaseAvatar 头像
 * 基于 element-plus ElAvatar 二次封装：
 *  - 图片地址为空或加载失败时，兜底展示「昵称首字 + 昵称哈希色块」
 *  - 统一圆形头像与点击态，供评论 / 回复 / 输入区复用
 */
import { computed, ref, watch } from "vue";

const props = defineProps({
  // 头像图片地址，为空时直接使用兜底
  src: { type: String, default: "" },
  // 用户昵称（兜底文字 + 色块哈希来源）
  name: { type: String, default: "" },
  // 头像尺寸
  size: { type: [Number, String], default: 40 },
  // 形状：circle / square
  shape: { type: String, default: "circle" },
  // 是否可点击（hover 反馈）
  clickable: { type: Boolean, default: false },
});

// 图片是否加载失败：src 变化时重置
const imgFailed = ref(false);
watch(
  () => props.src,
  () => {
    imgFailed.value = false;
  },
);

const onError = () => {
  imgFailed.value = true;
};

// 兜底色块（B站默认头像为彩色块 + 字符），按昵称哈希取色
const AVATAR_COLORS = [
  "#fb7299",
  "#00a1d6",
  "#7ad66b",
  "#ffb14d",
  "#a47de2",
  "#ff7a7a",
  "#36c5b0",
  "#5b8ff9",
];
const fallbackColor = computed(() => {
  const key = props.name || "?";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
});

// 兜底字符：取昵称第一个字符
const fallbackChar = computed(() => (props.name || "?").slice(0, 1));

// 无 src 或加载失败时使用兜底内容
const useFallback = computed(() => !props.src || imgFailed.value);
</script>

<template>
  <el-avatar
    class="biz-avatar"
    :class="{ 'is-clickable': clickable, 'is-fallback': useFallback }"
    :src="useFallback ? undefined : src"
    :size="size"
    :shape="shape"
    @error="onError"
  >
    <span class="biz-avatar__char" :style="{ backgroundColor: fallbackColor }">
      {{ fallbackChar }}
    </span>
  </el-avatar>
</template>

<style scoped lang="scss">
.biz-avatar {
  flex: none;
  background: transparent;
  vertical-align: middle;

  &.is-clickable {
    cursor: pointer;
  }

  .biz-avatar__char {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #fff;
    font-weight: 500;
    user-select: none;
  }
}
</style>
