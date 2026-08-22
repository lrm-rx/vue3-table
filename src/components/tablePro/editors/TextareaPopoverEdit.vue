<script setup>
/**
 * 文本域 Popover 编辑控件（通过对象式 editRender 接入）
 *
 * 接入：editRender: { name: "TextareaPopoverEdit" }
 * 工作机制：
 *   - tablePro 对象式 editRender 会注入 v-model（modelValue/onUpdate:modelValue）绑定到 editLocalState
 *   - 组件挂载后自动打开 popover；textarea 本地维护副本，仅在点「确定」时 emit('update:modelValue', text)
 *   - 点「取消」不 emit → editLocalState 保持原值 → onEditClosed 写回原值（不触发 cell-edit-change）
 *   - 点「确定」emit → editLocalState 更新 → 调用 $table.clearActive() → onEditClosed 写回 row（触发 cell-edit-change）
 *   - 通过 inject 拿到 vxe-grid 实例 ref，调用 clearActive 关闭编辑态
 *
 * popover 自适应位置：ElPopover 内置 flip + preventOverflow 修饰符
 *   - 单元格在右边界时，popover 自动翻到左边
 *   - 单元格在底边界时，popover 自动翻到上边
 *
 * 事件冒泡处理：
 *   vxe editConfig.trigger='click' 会监听 document click，点击编辑单元格外部即关闭编辑态。
 *   popover 渲染在 body 下（teleport），属于"编辑单元格外部"，需阻止 popper 内 mousedown/click 冒泡到 document。
 *   通过 watch(visible) 在 popper 渲染后给 popper 元素绑定 stopPropagation，确保只有点「取消/确定」才关闭。
 */
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { ElPopover, ElInput, ElButton } from "element-plus";

const props = defineProps({
  // 由 tablePro 对象式 editRender 注入的 v-model（绑到 editLocalState）
  modelValue: { type: [String, Number], default: "" },
  // 列标题（由 tablePro 透传，显示在 popover 顶部）
  title: { type: String, default: "" },
  // vxe 表格实例（由 tablePro 透传 scope.$table），用于调用 clearActive 退出编辑态
  table: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue"]);

// 本地副本：进入编辑时初始化为 modelValue（原值）
const text = ref(props.modelValue ?? "");
const original = ref(props.modelValue ?? "");
const visible = ref(false);
const inputRef = ref();

const popoverWidth = 360;
const textareaRows = 6;

// 关闭 vxe 编辑态（统一出口）：触发 vxe 的 edit-closed → tablePro 的 onEditClosed 写回 row
// vxe 4.x 退出编辑态用 clearEdit()；clearActive 是清除选中，不退出编辑
const closeEdit = () => {
  const $table = props.table;
  if (!$table) return;
  if (typeof $table.clearEdit === "function") $table.clearEdit();
  else if (typeof $table.clearActive === "function") $table.clearActive();
};

// 确定：emit 新值（同步更新 editLocalState）→ 关闭 popover → 退出编辑态
// emit 是同步的，editLocalState 已更新，无需 setTimeout；直接 clearEdit 让 vxe 触发 edit-closed 写回 row
const onConfirm = () => {
  if (text.value !== original.value) {
    emit("update:modelValue", text.value);
  }
  visible.value = false;
  closeEdit();
};

// 取消：不 emit → editLocalState 保持原值 → 关闭编辑态（onEditClosed 写回原值，不触发 cell-edit-change）
const onCancel = () => {
  visible.value = false;
  closeEdit();
};

// 聚焦 textarea
const focusTextarea = () => {
  nextTick(() => {
    const el = inputRef.value?.ref?.querySelector?.("textarea");
    el?.focus();
  });
};

// 给 popper 元素绑定事件阻止冒泡：vxe 监听 document click 关闭编辑态，
// popper 在 body 下属于"编辑单元格外部"，必须阻止 mousedown/click 冒泡到 document。
// 每次 popper 渲染都是新 DOM（ElPopover 关闭时销毁 popper），需每次 visible=true 时重新绑定。
const bindPopperStop = () => {
  // ElPopover 的 popper-class 会挂到 popper 容器上
  const popperEl = document.querySelector(".textarea-popover-edit");
  if (!popperEl || popperEl.__stopBound) return;
  const stop = (e) => e.stopPropagation();
  // mousedown：阻止 vxe 在 mousedown 阶段判定"点击外部"关闭编辑态
  popperEl.addEventListener("mousedown", stop);
  // click：双保险，阻止 click 冒泡到 document
  popperEl.addEventListener("click", stop);
  popperEl.__stopBound = true;
};

// 监听 visible：打开后 nextTick 绑定 stop + 聚焦
watch(visible, (val) => {
  if (val) {
    nextTick(() => {
      bindPopperStop();
      focusTextarea();
    });
  }
});

onMounted(() => {
  // nextTick 确保 reference 已渲染、DOM 尺寸稳定后再打开 popover
  nextTick(() => {
    visible.value = true;
  });
});

onBeforeUnmount(() => {
  visible.value = false;
});
</script>

<template>
  <ElPopover
    v-model:visible="visible"
    placement="bottom"
    trigger="manual"
    :width="popoverWidth"
    :show-arrow="true"
    :popper-options="{
      modifiers: [
        { name: 'flip', enabled: true },
        { name: 'preventOverflow', enabled: true, padding: 8 },
      ],
    }"
    popper-class="textarea-popover-edit"
  >
    <!-- reference：占位锚点，0x0 不可见，跟随 vxe 编辑层定位在单元格上 -->
    <template #reference>
      <span class="textarea-popover-edit__anchor" aria-hidden="true"></span>
    </template>
    <!-- 内容容器：@mousedown.stop @click.stop 双保险阻止冒泡 -->
    <div
      class="textarea-popover-edit__body"
      @mousedown.stop
      @click.stop
    >
      <div class="textarea-popover-edit__header">
        <span class="textarea-popover-edit__title">{{ title }}</span>
        <div class="textarea-popover-edit__actions">
          <ElButton size="small" @click="onCancel">取消</ElButton>
          <ElButton size="small" type="primary" @click="onConfirm">确定</ElButton>
        </div>
      </div>
      <ElInput
        ref="inputRef"
        v-model="text"
        type="textarea"
        :rows="textareaRows"
        placeholder="请输入内容"
      />
    </div>
  </ElPopover>
</template>

<style lang="scss">
// 撑满单元格：让 popover 的 reference 矩形 = 单元格矩形，
// 箭头会指向 reference 边缘的中心 → 即单元格中心，而非左上角
.textarea-popover-edit__anchor {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 20px;
  pointer-events: none;
}

.textarea-popover-edit__body {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .textarea-popover-edit__header {
    // 列标题与按钮两端对齐
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .textarea-popover-edit__title {
    font-weight: 600;
    font-size: 14px;
    color: var(--el-text-color-primary, #303133);
    // 标题过长省略，避免撑破 popover 宽度
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .textarea-popover-edit__actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  // 文本域可自由拖拽宽高，限制范围避免溢出 popover
  :deep(.el-textarea__inner) {
    min-height: 120px;
    max-height: 360px;
    resize: both;
  }
}

// 放大并加深 popover 箭头，使其指向更明显
.el-popper.textarea-popover-edit {
  // 箭头默认 8px，放大到 12px 并加深颜色
  .el-popper__arrow,
  .el-popper__arrow::before {
    width: 12px;
    height: 12px;
  }

  .el-popper__arrow::before {
    background: var(--el-color-primary, #409eff);
    border-color: var(--el-color-primary, #409eff);
  }
}
</style>
