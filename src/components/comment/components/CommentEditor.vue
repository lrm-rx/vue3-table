<script setup>
/**
 * CommentEditor 评论输入区
 * 两种模式复用同一组件：
 *  - 顶部发表一级评论（showCancel=false / minRows=3 / 提交「发布」）
 *  - 评论项内联回复（showCancel=true / minRows=2 / 提交「回复」，可自动聚焦）
 * 基于封装组件 BaseTextarea（ElInput）与 BaseButton（ElButton）。
 * 快捷键 Ctrl / ⌘ + Enter 提交，纯空格不可发送。
 */
import { computed, nextTick, onMounted, ref } from "vue";
import BaseAvatar from "../base/BaseAvatar.vue";
import BaseButton from "../base/BaseButton.vue";
import BaseTextarea from "../base/BaseTextarea.vue";

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

// 去除首尾空格后的有效长度
const trimmed = computed(() => text.value.trim());
const canSend = computed(() => trimmed.value.length > 0 && !props.submitting);

const submit = () => {
  if (!canSend.value) return;
  emit("send", trimmed.value);
  text.value = "";
};

const cancel = () => {
  text.value = "";
  emit("cancel");
};

const onKeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    submit();
  }
};

onMounted(() => {
  if (props.autoFocus) {
    nextTick(() => textareaRef.value?.focus());
  }
});
</script>

<template>
  <div class="bili-comment-editor">
    <BaseAvatar
      v-if="showAvatar"
      class="bili-comment-editor__avatar"
      :src="avatar"
      :name="name"
      :size="avatarSize"
    />
    <div class="bili-comment-editor__body">
      <BaseTextarea
        ref="textareaRef"
        v-model="text"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :min-rows="minRows"
        @keydown="onKeydown"
      />
      <div class="bili-comment-editor__footer">
        <span class="bili-comment-editor__tip">Ctrl + Enter {{ submitText }}</span>
        <div class="bili-comment-editor__actions">
          <BaseButton v-if="showCancel" @click="cancel">取消</BaseButton>
          <BaseButton
            :text="false"
            type="primary"
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

  &__avatar {
    margin-top: 2px;
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

  &__tip {
    font-size: 12px;
    color: #9499a0;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
