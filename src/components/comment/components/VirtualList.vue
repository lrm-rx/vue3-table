<script setup>
/**
 * VirtualList 动态高度虚拟滚动列表
 *
 * 评论项高度不固定（正文长度 / 楼中楼数量 / 回复展开收起），因此采用：
 *  1. 视口为唯一滚动容器（固定高度、overflow:auto）
 *  2. phantom 占位层以「实测/估计高度之和」撑开真实滚动条
 *  3. content 层 translateY(offsetY) 只承载「窗口 + overscan」内的少量 DOM
 *  4. ResizeObserver 测量每项真实高度，按 key 缓存；排序变化后缓存仍可复用
 *  5. 视口上方的条目高度变化时补偿 scrollTop，避免内容跳变
 *  6. 接近底部抛出 load-more（配合外部 loading prop 做增量加载）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  buildOffsets,
  getVisibleRange,
  isNearBottom,
} from "../utils/virtualScroll.js";

const props = defineProps({
  // 列表数据
  items: { type: Array, default: () => [] },
  // 唯一键字段名（或取值函数）
  itemKey: { type: [String, Function], default: "id" },
  // 未测量项的估计高度（px）
  estimateHeight: { type: Number, default: 220 },
  // 窗口上下额外渲染的项数（快速滚动防白屏）
  overscan: { type: Number, default: 3 },
  // 视口高度（number=px 或 CSS 字符串）
  height: { type: [Number, String], default: 600 },
  // 外部加载中（抑制重复 load-more）
  loading: { type: Boolean, default: false },
  // 触发 load-more 的距底阈值
  bottomDistance: { type: Number, default: 80 },
  // 是否显示楼层序号列（显式开启，默认关闭）
  showIndex: { type: Boolean, default: false },
  // 楼层序号取值字段：item[indexField]；为空串或字段缺失时回退「展示位置 index + 1」
  indexField: { type: String, default: "floor" },
  // 序号列是否显示可点击排序表头（sticky 吸附在视口顶部）
  indexSortable: { type: Boolean, default: false },
  // 序号列当前排序方向：'asc' | 'desc' | null（null=跟随外部默认排序，箭头不高亮）
  indexSortOrder: { type: String, default: null },
});

const emit = defineEmits(["load-more", "scroll", "update:indexSortOrder", "index-sort"]);

const viewportRef = ref(null);

const scrollTop = ref(0);
const viewportHeight = ref(0);

// 已测量高度：key（原始类型） -> 高度
const measuredHeights = new Map();
// 高度缓存版本号：变化后驱动 offsets/窗口重算（Map 本身非响应式）
const version = ref(0);

// DOM 引用：key -> el、el -> key（dataset 只能存字符串，故单独反查）
const itemEls = new Map();
const elKeyMap = new Map();

const getKey = (item) =>
  typeof props.itemKey === "function"
    ? props.itemKey(item)
    : item?.[props.itemKey];

// 按展示顺序的 key 数组
const keys = computed(() => {
  version.value;
  return props.items.map(getKey);
});

// 前缀和：offsets[i] = 第 i 项顶部 y，offsets[n] = 总高度
const offsets = computed(() => {
  version.value;
  return buildOffsets(keys.value, measuredHeights, props.estimateHeight);
});

const totalHeight = computed(
  () => offsets.value[offsets.value.length - 1] ?? 0,
);

// 当前窗口 [start, end)
const range = computed(() =>
  getVisibleRange(
    offsets.value,
    scrollTop.value,
    viewportHeight.value,
    props.overscan,
  ),
);

// 楼层序号：优先取 item[indexField]（评论的固定楼层），缺失时按展示位置 index+1
const resolveIndexNo = (item, index) => {
  const field = props.indexField;
  if (field) {
    const v = item?.[field];
    if (v != null && v !== "") return v;
  }
  return index + 1;
};

const visibleEntries = computed(() => {
  const { start, end } = range.value;
  const list = [];
  for (let i = start; i < end; i++) {
    list.push({
      key: keys.value[i],
      item: props.items[i],
      index: i,
      no: resolveIndexNo(props.items[i], i),
    });
  }
  return list;
});

// content 层位移
const offsetY = computed(() => offsets.value[range.value.start] ?? 0);

// load-more 武装标记：触发一次后解除，数据真正增长后重新武装
const loadMoreArmed = ref(true);
watch(
  () => props.items.length,
  (len, oldLen) => {
    if (len > (oldLen ?? 0)) loadMoreArmed.value = true;
  },
);

// —— 序号列表头排序：三态循环 null（默认）→ asc（楼层升序）→ desc（楼层倒序）→ null ——
const onIndexSortClick = () => {
  const current = props.indexSortOrder;
  const next = current == null ? "asc" : current === "asc" ? "desc" : null;
  emit("update:indexSortOrder", next);
  emit("index-sort", next);
};

// —— 滚动 ——
const onScroll = (event) => {
  scrollTop.value = event.target.scrollTop;
  emit("scroll", { scrollTop: scrollTop.value });
  if (
    !props.loading &&
    loadMoreArmed.value &&
    isNearBottom(
      offsets.value,
      scrollTop.value,
      viewportHeight.value,
      props.bottomDistance,
    )
  ) {
    loadMoreArmed.value = false;
    emit("load-more");
  }
};

// —— 元素引用注册 / 注销 ——
const setItemEl = (key, el) => {
  if (el) {
    if (!itemEls.has(key)) {
      itemEls.set(key, el);
      elKeyMap.set(el, key);
      observer?.observe(el);
    }
  } else {
    const old = itemEls.get(key);
    if (old) {
      observer?.unobserve(old);
      itemEls.delete(key);
      elKeyMap.delete(old);
    }
  }
};

// —— 读取 ResizeObserver 回调中的高度 ——
const readEntryHeight = (entry, el) => {
  const box = Array.isArray(entry.borderBoxSize)
    ? entry.borderBoxSize[0]
    : entry.borderBoxSize;
  if (box?.blockSize > 0) return box.blockSize;
  if (entry.contentRect?.height > 0) return entry.contentRect.height;
  return el.offsetHeight;
};

// —— 应用测量结果（含滚动位置补偿）——
const applyMeasuredHeight = (key, newHeight) => {
  if (!(newHeight > 0)) return;
  const oldHeight = measuredHeights.get(key);
  if (oldHeight === newHeight) return;

  // 更新前该项顶部位置（用于判断是否在视口上方）
  const idx = keys.value.indexOf(key);
  const itemTop = idx >= 0 ? offsets.value[idx] : -1;

  measuredHeights.set(key, newHeight);
  version.value += 1;

  // 条目位于当前视口上方却改变了高度（如楼中楼展开 / 新增回复），
  // 需同步补偿 scrollTop，否则下方内容会整体上/下跳变
  const vp = viewportRef.value;
  if (vp && itemTop >= 0 && itemTop < scrollTop.value) {
    const delta = newHeight - (oldHeight ?? props.estimateHeight);
    vp.scrollTop = scrollTop.value + delta;
    scrollTop.value = vp.scrollTop;
  }
};

// —— ResizeObserver：同时观察视口自身与条目 ——
let observer = null;
const onResize = (entries) => {
  for (const entry of entries) {
    const el = entry.target;
    if (el === viewportRef.value) {
      const h = el.clientHeight;
      if (h !== viewportHeight.value) viewportHeight.value = h;
      continue;
    }
    const key = elKeyMap.get(el);
    if (key == null) continue;
    applyMeasuredHeight(key, readEntryHeight(entry, el));
  }
};

// 视口高度样式
const viewportStyle = computed(() => {
  const h = props.height;
  return { height: typeof h === "number" ? `${h}px` : h };
});

// —— 暴露给父组件 ——
// 切换排序 / 发表评论后回到顶部
const scrollToTop = () => {
  const vp = viewportRef.value;
  if (vp) vp.scrollTop = 0;
  scrollTop.value = 0;
};

// 清空测量缓存（更换全新数据集时可选调用）
const resetMeasured = () => {
  measuredHeights.clear();
  version.value += 1;
};

defineExpose({ scrollToTop, resetMeasured });

onMounted(() => {
  observer = new ResizeObserver(onResize);
  observer.observe(viewportRef.value);
  // 条目 ref 在 mounted 前已注册（此时 observer 尚未创建），挂载后补观察
  itemEls.forEach((el) => observer.observe(el));
  viewportHeight.value = viewportRef.value?.clientHeight ?? 0;
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  itemEls.clear();
  elKeyMap.clear();
});
</script>

<template>
  <div
    ref="viewportRef"
    class="biz-virtual-list"
    :style="viewportStyle"
    @scroll.passive="onScroll"
  >
    <!-- 楼层序号列表头：sticky 吸附视口顶部；流内占位，内容行从其下方开始排布 -->
    <div
      v-if="showIndex && indexSortable"
      class="biz-virtual-list__index-header"
    >
      <button
        type="button"
        class="biz-virtual-list__index-sort"
        :class="{
          'is-asc': indexSortOrder === 'asc',
          'is-desc': indexSortOrder === 'desc',
        }"
        :title="'按楼层排序'"
        :aria-label="'按楼层排序'"
        @click="onIndexSortClick"
      >
        <span class="biz-virtual-list__caret biz-virtual-list__caret--up" />
        <span class="biz-virtual-list__caret biz-virtual-list__caret--down" />
      </button>
      <div class="biz-virtual-list__index-header-body" />
    </div>

    <!-- phantom：按总高度撑开真实滚动条 -->
    <div
      class="biz-virtual-list__phantom"
      :style="{ height: `${totalHeight}px` }"
    >
      <!-- content：绝对定位 + 平移，只承载窗口内条目 -->
      <div
        class="biz-virtual-list__content"
        :style="{ transform: `translateY(${offsetY}px)` }"
      >
        <div
          v-for="entry in visibleEntries"
          :key="entry.key"
          class="biz-virtual-list__item"
          :class="{ 'is-first': entry.index === 0, 'has-index': showIndex }"
          :ref="(el) => setItemEl(entry.key, el)"
        >
          <template v-if="showIndex">
            <!-- 楼层序号列：数字 + 楼，与头像垂直对齐 -->
            <div class="biz-virtual-list__index" aria-hidden="true">
              <span class="biz-virtual-list__index-no">{{ entry.no }}</span>
              <span class="biz-virtual-list__index-unit">楼</span>
            </div>
            <div class="biz-virtual-list__index-body">
              <slot :item="entry.item" :index="entry.index" :floor="entry.no" />
            </div>
          </template>
          <slot v-else :item="entry.item" :index="entry.index" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.biz-virtual-list {
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
  // 评论区滚动条收窄
  scrollbar-width: thin;
  scrollbar-color: #c9ccd0 transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background-color: #c9ccd0;
  }

  &::-webkit-scrollbar-track {
    background-color: transparent;
  }

  &__phantom {
    position: relative;
    width: 100%;
  }

  &__content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  &__item {
    width: 100%;

    // 分隔线画在每项自身（首项除外），保证节点回收后滚动时不闪烁
    &:not(.is-first) {
      border-top: 1px solid #f1f2f3;
    }

    // 楼层序号列布局
    &.has-index {
      display: flex;
      align-items: flex-start;
    }
  }

  &__index {
    flex: none;
    width: 38px;
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
    color: #9499a0;
    user-select: none;
  }

  &__index-no {
    font-size: 14px;
    font-weight: 600;
    color: #61666d;
  }

  &__index-unit {
    font-size: 11px;
  }

  &__index-body {
    flex: 1;
    min-width: 0;
  }

  // 楼层序号列表头（sticky 吸附）：列宽与每行 __index 对齐
  &__index-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: flex-start;
    height: 30px;
    background-color: #fff;
    border-bottom: 1px solid #f1f2f3;
  }

  &__index-header-body {
    flex: 1;
    min-width: 0;
  }

  // 排序按钮：上下双三角（固定槽位，切换状态时不产生布局位移）
  &__index-sort {
    flex: none;
    width: 38px;
    height: 30px;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;

    &:hover {
      .biz-virtual-list__caret--up {
        border-bottom-color: #9499a0;
      }
      .biz-virtual-list__caret--down {
        border-top-color: #9499a0;
      }
    }

    // 激活态置于 hover 规则之后：当前方向即使 hover 也保持主题色
    &.is-asc .biz-virtual-list__caret--up {
      border-bottom-color: #fb7299;
    }
    &.is-desc .biz-virtual-list__caret--down {
      border-top-color: #fb7299;
    }
  }

  &__caret {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;

    &--up {
      border-bottom: 5px solid #c9ccd0;
    }

    &--down {
      border-top: 5px solid #c9ccd0;
    }
  }
}
</style>
