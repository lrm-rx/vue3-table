<script setup>
/**
 * CommentEditor 评论输入区
 * 两种模式复用同一组件：
 *  - 顶部发表一级评论（collapsible：未聚焦时折叠为灰色输入条，点击展开 / 失焦自动收起）
 *  - 评论项内联回复（collapsible=false / minRows=2 / 提交「回复」，挂载自动聚焦）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import BaseAvatar from "../base/BaseAvatar.vue";
import BaseTextarea from "../base/BaseTextarea.vue";

let emojiEditorSeed = 0;

const props = defineProps({
  avatar: { type: String, default: "" },
  name: { type: String, default: "我" },
  avatarSize: { type: Number, default: 40 },
  showAvatar: { type: Boolean, default: true },
  placeholder: { type: String, default: "发一条友善的评论…" },
  submitText: { type: String, default: "发布" },
  showCancel: { type: Boolean, default: false },
  collapsible: { type: Boolean, default: false },
  maxlength: { type: Number, default: 1000 },
  minRows: { type: Number, default: 3 },
  autoFocus: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(["send", "cancel"]);

const text = ref("");
const textareaRef = ref(null);
const rootRef = ref(null);

const expanded = ref(!props.collapsible);
const emojiVisible = ref(false);
const emojiPopperClass = `bili-emoji-popper bili-emoji-popper--${++emojiEditorSeed}`;
const emojiPopperSelector = `.bili-emoji-popper--${emojiEditorSeed}`;
let emojiTriggerEl = null;

const trimmed = computed(() => text.value.trim());
const canSend = computed(() => trimmed.value.length > 0 && !props.submitting);

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

const onDocumentClick = (event) => {
  if (!emojiVisible.value) return;
  if (emojiTriggerEl?.contains?.(event.target)) return;
  if (event.target?.closest?.(emojiPopperSelector)) return;
  emojiVisible.value = false;
};

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
          <el-button v-if="showCancel" text size="small" @click="cancel">取消</el-button>
          <el-button
            class="bili-comment-editor__submit"
            type="primary"
            size="default"
            :disabled="!canSend"
            :loading="submitting"
            @click="submit"
          >
            {{ submitText }}
          </el-button>
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

  &__submit {
    border-radius: 6px;
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>

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
