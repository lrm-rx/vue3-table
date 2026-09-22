<script setup>
/**
 * BaseAvatar 头像
 * 基于 element-plus ElAvatar 二次封装：
 *  - 图片地址为空或加载失败时，兜底展示「昵称首字 + 昵称哈希色块」
 */
import { computed, ref, watch } from "vue";

const props = defineProps({
  src: { type: String, default: "" },
  name: { type: String, default: "" },
  size: { type: [Number, String], default: 40 },
  shape: { type: String, default: "circle" },
  clickable: { type: Boolean, default: false },
});

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

const fallbackChar = computed(() => (props.name || "?").slice(0, 1));

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
