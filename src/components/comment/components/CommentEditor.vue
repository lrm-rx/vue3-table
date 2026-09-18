<script setup>
/**
 * CommentEditor 评论输入区（仿 bilibili 新版）
 * 两种模式复用同一组件：
 *  - 顶部发表一级评论（collapsible：未聚焦时折叠为灰色输入条，点击展开 / 失焦自动收起）
 *  - 评论项内联回复（collapsible=false / minRows=2 / 提交「回复」，挂载自动聚焦）
 * 基于封装组件 BaseTextarea（ElInput）与 BaseButton（ElButton）。
 * 工具栏：表情（光标处插入）、@；快捷键 Ctrl / ⌘ + Enter 提交，纯空格不可发送。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import BaseAvatar from "../base/BaseAvatar.vue";
import BaseButton from "../base/BaseButton.vue";
import BaseTextarea from "../base/BaseTextarea.vue";

// 表情弹层实例标识（页面上可能同时存在多个编辑器：顶部 + 若干回复框）
let emojiEditorSeed = 0;

const props = defineProps({
  // 当前用户头像地址
  avatar: { type: String, default: "" },
  // 当前用户昵称（头像兜底用）
  name: { type: String, default: "我" },
  // 头像尺寸
  avatarSize: { type: Number, default: 40 },
  // 是否展示头像
  showAvatar: { type: Boolean, default: true },
  // 占位文本
  placeholder: { type: String, default: "发一条友善的评论…" },
  // 提交按钮文案
  submitText: { type: String, default: "发布" },
  // 是否展示取消按钮（回复模式）
  showCancel: { type: Boolean, default: false },
  // 是否支持折叠（顶部一级评论输入框：折叠为输入条，点击展开）
  collapsible: { type: Boolean, default: false },
  // 最大字数
  maxlength: { type: Number, default: 1000 },
  // 最小行数
  minRows: { type: Number, default: 3 },
  // 挂载后自动聚焦（回复框展开时）
  autoFocus: { type: Boolean, default: false },
  // 提交中（禁用按钮，预留异步发送）
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(["send", "cancel"]);

const text = ref("");
const textareaRef = ref(null);
const rootRef = ref(null);

// 折叠模式初始收起；回复模式始终展开
const expanded = ref(!props.collapsible);
// 表情面板
const emojiVisible = ref(false);
// 本实例表情弹层的唯一 class / 选择器（el-popover teleport 到 body 后区分实例）
const emojiPopperClass = `bili-emoji-popper bili-emoji-popper--${++emojiEditorSeed}`;
const emojiPopperSelector = `.bili-emoji-popper--${emojiEditorSeed}`;
// 本实例表情触发按钮 DOM（由点击事件的 currentTarget 记录，不依赖模板 ref——
// el-popover reference 插槽元素经 OnlyChild cloneVNode 后在子作用域渲染，
// 插槽内的模板 ref 无法回传到本组件 setup）
let emojiTriggerEl = null;

// 去除首尾空格后的有效长度
const trimmed = computed(() => text.value.trim());
const canSend = computed(() => trimmed.value.length > 0 && !props.submitting);

// 常用表情（点击插入光标处，面板不关闭，可连续选择）
const emojiGroups = [
  ["😀", "😄", "😁", "🤣", "😂", "😊", "🙂", "😉", "😎"],
  ["🥰", "😍", "🤗", "🤔", "🤨", "😐", "😶", "🙄", "😏"],
  ["😴", "😭", "😮", "😱", "🥱", "😇", "🤪", "😜", "🙃"],
  ["😬", "😒", "😞", "😔", "😟", "😤", "😠", "😡", "🥺"],
  ["😢", "😨", "😰", "😥", "🤯", "😳", "🥵", "🥶", "😱"],
  ["👍", "👎", "👏", "🙏", "💪", "🤝", "👌", "✌️", "🫶"],
  ["❤️", "💔", "🔥", "✨", "🎉", "🌹", "☕", "🍉", "🎂"],
];
const emojiList = emojiGroups.flat();

const expand = () => {
  expanded.value = true;
  emojiVisible.value = false;
  nextTick(() => textareaRef.value?.focus());
};

const submit = () => {
  if (!canSend.value) return;
  emit("send", trimmed.value);
  text.value = "";
  emojiVisible.value = false;
  if (props.collapsible) expanded.value = false;
};

const cancel = () => {
  text.value = "";
  emojiVisible.value = false;
  if (props.collapsible) expanded.value = false;
  emit("cancel");
};

const toggleEmoji = (event) => {
  emojiTriggerEl = event.currentTarget;
  emojiVisible.value = !emojiVisible.value;
};

const insertEmoji = (emoji) => {
  textareaRef.value?.insertText(emoji);
};

const insertMention = () => {
  emojiVisible.value = false;
  textareaRef.value?.insertText("@");
};

const onKeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    submit();
  }
};

// 表情面板（trigger=manual 受控，teleport 到 body）自行接管「点击外部关闭」：
// document 捕获阶段，点击既不在本实例触发按钮、也不在本实例面板内时关闭。
// 不能用 VueUse onClickOutside + 模板 ref——reference 插槽元素的 ref 不回传本组件。
const onDocumentClick = (event) => {
  if (!emojiVisible.value) return;
  if (emojiTriggerEl?.contains?.(event.target)) return;
  if (event.target?.closest?.(emojiPopperSelector)) return;
  emojiVisible.value = false;
};

// 折叠模式：点击编辑器外部且内容为空时收起输入框
onClickOutside(
  rootRef,
  () => {
    if (!props.collapsible || !expanded.value) return;
    if (!text.value) expanded.value = false;
  },
  {
    ignore: [".bili-emoji-popper"],
  },
);

onMounted(() => {
  document.addEventListener("click", onDocumentClick, true);
  if (props.autoFocus) {
    nextTick(() => textareaRef.value?.focus());
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick, true);
});

// 展开状态变化后自动聚焦（折叠 → 展开）
watch(expanded, (val) => {
  if (val) nextTick(() => textareaRef.value?.focus());
});
</script>

<template>
  <div ref="rootRef" class="bili-comment-editor">
    <BaseAvatar
      v-if="showAvatar"
      class="bili-comment-editor__avatar"
      :src="avatar"
      :name="name"
      :size="avatarSize"
    />

    <!-- 折叠态：仿 bilibili 灰色输入条 -->
    <button
      v-if="collapsible && !expanded"
      type="button"
      class="bili-comment-editor__collapse"
      @click="expand"
    >
      <span class="bili-comment-editor__collapse-text">{{ placeholder }}</span>
      <svg
        class="bili-comment-editor__collapse-emoji"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8.4 14.4c1 1.2 2.2 1.8 3.6 1.8s2.6-.6 3.6-1.8" stroke-linecap="round" />
        <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </button>

    <!-- 展开态：输入框 + 工具栏 + 提交按钮 -->
    <div v-else class="bili-comment-editor__body">
      <BaseTextarea
        ref="textareaRef"
        v-model="text"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :min-rows="minRows"
        @keydown="onKeydown"
      />
      <div class="bili-comment-editor__footer">
        <div class="bili-comment-editor__toolbar">
          <el-popover
            :visible="emojiVisible"
            placement="top-start"
            :width="308"
            trigger="manual"
            :popper-class="emojiPopperClass"
          >
            <template #reference>
              <button
                type="button"
                class="bili-comment-editor__tool"
                :class="{ 'is-active': emojiVisible }"
                title="表情"
                @click="toggleEmoji"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path
                    d="M8.4 14.4c1 1.2 2.2 1.8 3.6 1.8s2.6-.6 3.6-1.8"
                    stroke-linecap="round"
                  />
                  <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </template>
            <div class="bili-emoji-popper__grid">
              <button
                v-for="emoji in emojiList"
                :key="emoji"
                type="button"
                class="bili-emoji-popper__item"
                @click="insertEmoji(emoji)"
              >
                {{ emoji }}
              </button>
            </div>
          </el-popover>
          <button
            type="button"
            class="bili-comment-editor__tool bili-comment-editor__tool--at"
            title="@用户"
            @click="insertMention"
          >
            @
          </button>
        </div>

        <div class="bili-comment-editor__actions">
          <BaseButton v-if="showCancel" @click="cancel">取消</BaseButton>
          <BaseButton
            class="bili-comment-editor__submit"
            :text="false"
            type="primary"
            size="default"
            :disabled="!canSend"
            :loading="submitting"
            @click="submit"
          >
            {{ submitText }}
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bili-comment-editor {
  display: flex;
  gap: 12px;
  width: 100%;

  &__avatar {
    margin-top: 2px;
  }

  // —— 折叠态输入条 ——
  &__collapse {
    flex: 1;
    min-width: 0;
    height: 52px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: none;
    border-radius: 8px;
    background-color: #f6f7f8;
    cursor: text;
    text-align: left;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: #f1f2f3;
    }
  }

  &__collapse-text {
    font-size: 13px;
    color: #9499a0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__collapse-emoji {
    flex: none;
    color: #9499a0;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  // 工具栏图标按钮
  &__tool {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #61666d;
    font-size: 15px;
    font-weight: 600;
    line-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;

    &:hover,
    &.is-active {
      color: #fb7299;
      background-color: #feebf0;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  // 发布 / 回复主按钮：B 站粉、小圆角
  &__submit {
    border-radius: 6px;
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>

<!-- 表情面板 teleport 到 body，需用非 scoped 样式 -->
<style lang="scss">
.bili-emoji-popper {
  padding: 10px !important;
  border-radius: 10px !important;
  min-width: 0 !important;

  &__grid {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 2px;
  }

  &__item {
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 18px;
    line-height: 30px;
    text-align: center;
    cursor: pointer;

    &:hover {
      background-color: #f1f2f3;
    }
  }
}
</style>
