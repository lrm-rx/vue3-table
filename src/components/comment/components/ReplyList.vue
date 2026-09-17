<script setup>
/**
 * ReplyList 楼中楼回复列表
 *  - 默认只预览前 previewCount（默认 2）条
 *  - 超出后展示「查看全部 n 条回复」，就地展开全部；展开后可收起
 *  - 事件（like / reply）统一上抛给 CommentItem
 */
import { computed, ref } from "vue";
import BaseButton from "../base/BaseButton.vue";
import ReplyItem from "./ReplyItem.vue";

const props = defineProps({
  // 扁平回复数组
  replies: { type: Array, default: () => [] },
  // 预览条数
  previewCount: { type: Number, default: 2 },
});

const emit = defineEmits(["like", "reply"]);

const expanded = ref(false);

const total = computed(() => props.replies.length);

const visibleReplies = computed(() =>
  expanded.value ? props.replies : props.replies.slice(0, props.previewCount),
);

const showToggle = computed(() => total.value > props.previewCount);

const toggle = () => {
  expanded.value = !expanded.value;
};

const onLike = (reply) => {
  emit("like", reply);
};

const onReply = (reply) => {
  emit("reply", reply);
};
</script>

<template>
  <div class="bili-reply-list">
    <ReplyItem
      v-for="reply in visibleReplies"
      :key="reply.id"
      :reply="reply"
      @like="onLike"
      @reply="onReply"
    />
    <BaseButton
      v-if="showToggle"
      class="bili-reply-list__toggle"
      @click="toggle"
    >
      <template v-if="!expanded">查看全部 {{ total }} 条回复</template>
      <template v-else>收起回复</template>
    </BaseButton>
  </div>
</template>

<style scoped lang="scss">
.bili-reply-list {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: #f6f7f8;

  display: flex;
  flex-direction: column;
  gap: 10px;

  &__toggle {
    align-self: flex-start;
    font-size: 13px;
    padding: 0;
  }
}
</style>
