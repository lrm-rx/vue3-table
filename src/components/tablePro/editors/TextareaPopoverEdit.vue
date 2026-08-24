<script setup>
/**
 * 文本域 Popover 编辑控件（通过对象式 editRender 接入）
 *
 * 接入：editRender: { name: "TextareaPopoverEdit" }
 * 工作机制：
 *   - tablePro 对象式 editRender 会注入 v-model（modelValue/onUpdate:modelValue）绑定到 editLocalState
 *   - 组件挂载后自动打开 popover；textarea 本地维护副本，仅在点「确定」时 emit('update:modelValue', text)
 *   - 点「取消」不 emit → editLocalState 保持原值 → onEditClosed 写回原值（不触发 cell-edit-change）
 *   - 点「确定」emit → editLocalState 更新 → 调用 $table.clearEdit() → onEditClosed 写回 row（触发 cell-edit-change）
 *   - 通过 inject 拿到 vxe-grid 实例 ref，调用 clearEdit 退出编辑态
 *
 * popover 自适应位置：ElPopover 内置 flip + preventOverflow 修饰符
 *   - 单元格在右边界时，popover 自动翻到左边
 *   - 单元格在底边界时，popover 自动翻到上边
 *
 * 蒙版机制（确保只有点「取消/确定」才关闭）：
 *   1. 透明蒙版：覆盖全屏（z-index 低于 popover），视觉上隔离外部区域；
 *      蒙版带 `vxe-table--ignore-clear` 类 —— vxe 全局 mousedown 处理器检测到该类会跳过
 *      handleClearEdit（vxe 原生机制，与 vxe 自带的筛选面板/自定义抽屉一致）；
 *      同时在蒙版上 stopPropagation(mousedown/click) 作为双保险，阻止事件冒泡到 window
 *      （vxe 的 mousedown 监听挂在 window 冒泡阶段）。
 *   2. popper 同样带 `vxe-table--ignore-clear` 类 —— 点击 popover 内部也不触发 vxe 清除。
 *   3. visible 拦截：使用 :visible + @update:visible 替代 v-model:visible，
 *      ElPopover 尝试关闭时（outside-click）被 handleVisibleUpdate 拦截，仅在 allowClose=true 时放行。
 *   4. clearEdit 拦截：monkey-patch $table.clearEdit（公共 API），仅在 closeEdit() 中放行；
 *      注：vxe 外部点击走 handleClearEdit 内部方法，不经过 clearEdit，故该拦截仅为辅助。
 *      外部点击的真正拦截由第 1 步的 vxe-table--ignore-clear 类完成。
 */
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { ElPopover, ElInput, ElButton } from "element-plus";

const props = defineProps({
  // 由 tablePro 对象式 editRender 注入的 v-model（绑到 editLocalState）
  modelValue: { type: [String, Number], default: "" },
  // 列标题（由 tablePro 透传，显示在 popover 顶部）
  title: { type: String, default: "" },
  // vxe 表格实例（由 tablePro 透传 scope.$table），用于调用 clearEdit 退出编辑态
  table: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "clear", "cancel", "confirm"]);

// 本地副本：进入编辑时初始化为 modelValue（原值）
const text = ref(props.modelValue ?? "");
const original = ref(props.modelValue ?? "");
const visible = ref(false);
const inputRef = ref();

const popoverWidth = 360;
const textareaRows = 6;

// ========== 关闭控制：只有点「取消/确定」时才允许关闭 ==========
// allowClose=true 时，ElPopover 和 vxe 的关闭请求才会被接受
// onConfirm/onCancel 中先设为 true，再关闭；外部触发（outside-click）时为 false，被拦截
const allowClose = ref(false);

// 拦截 ElPopover 的 update:visible：仅在 allowClose=true 时接受 false
const handleVisibleUpdate = (val) => {
  if (!val && !allowClose.value) return;
  visible.value = val;
};

// monkey-patch $table.clearEdit：vxe 调用 clearEdit 时仅在 allowClose=true 时放行
let originalClearEdit = null;
const patchClearEdit = () => {
  const $table = props.table;
  if (!$table || typeof $table.clearEdit !== "function") return;
  originalClearEdit = $table.clearEdit.bind($table);
  $table.clearEdit = () => {
    if (allowClose.value) originalClearEdit();
  };
};
const restoreClearEdit = () => {
  const $table = props.table;
  if ($table && originalClearEdit) {
    $table.clearEdit = originalClearEdit;
    originalClearEdit = null;
  }
};

// 关闭 vxe 编辑态（统一出口）：设置 allowClose=true → 调用 clearEdit → 触发 edit-closed 写回 row
const closeEdit = () => {
  allowClose.value = true;
  const $table = props.table;
  if (!$table) return;
  if (typeof $table.clearEdit === "function") $table.clearEdit();
  else if (typeof $table.clearActive === "function") $table.clearActive();
};

// 清除：清空 textarea 内容（不关闭 popover，用户可继续输入）
const onClear = () => {
  text.value = "";
  emit("clear", { value: "" });
};

// 确定：emit 新值（同步更新 editLocalState）→ emit confirm → 关闭 popover → 退出编辑态
const onConfirm = () => {
  if (text.value !== original.value) {
    emit("update:modelValue", text.value);
  }
  emit("confirm", { value: text.value });
  visible.value = false;
  closeEdit();
};

// 取消：不 emit update:modelValue → editLocalState 保持原值 → emit cancel → 关闭编辑态
const onCancel = () => {
  emit("cancel", { value: text.value });
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

// 给 popper 元素绑定事件阻止冒泡：双保险，防止事件冒泡到 document
const bindPopperStop = () => {
  const popperEl = document.querySelector(".textarea-popover-edit");
  if (!popperEl || popperEl.__stopBound) return;
  const stop = (e) => e.stopPropagation();
  popperEl.addEventListener("mousedown", stop);
  popperEl.addEventListener("click", stop);
  popperEl.__stopBound = true;
};

// ========== ESC 取消编辑：window 捕获阶段监听 keydown ==========
// vxe 全局 keydown 监听在 document 冒泡阶段，检测到 ESC 会调用 handleClearEdit 关闭编辑态。
// 这里在 window 上用捕获阶段（capture=true）监听，先于 vxe 接收 ESC：
//   - visible 打开时按下 ESC → 调用 onCancel 取消编辑 + stopPropagation 阻止冒泡到 vxe
// 模板上的 @keydown.esc.stop 依赖事件从 textarea 冒泡到 body div，但 ElInput/ElPopover
// 内部可能拦截 keydown 导致事件链中断，故改用 window 捕获阶段监听，更可靠。
let escHandler = null;
const bindEsc = () => {
  if (escHandler) return;
  escHandler = (e) => {
    if (!visible.value) return;
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    }
  };
  window.addEventListener('keydown', escHandler, true);
};
const unbindEsc = () => {
  if (escHandler) {
    window.removeEventListener('keydown', escHandler, true);
    escHandler = null;
  }
};

// ========== 透明蒙版：vxe-table--ignore-clear 类 + stopPropagation ==========
// vxe 全局 mousedown 处理器（挂在 window 冒泡阶段）会调用 handleClearEdit 清除编辑态，
// 除非点击目标（或其祖先）带 `vxe-table--ignore-clear` 类（vxe 原生机制）。
// 蒙版覆盖全屏，带该类后点击任意外部区域都会被 vxe 跳过清除；
// 同时 stopPropagation 阻止事件冒泡到 window 作为双保险。
let maskEl = null;
let maskStop = null;
const mountMask = () => {
  if (maskEl) return;
  const el = document.createElement("div");
  el.className = "textarea-popover-edit__mask vxe-table--ignore-clear";
  const stop = (e) => { e.stopPropagation(); };
  el.addEventListener("mousedown", stop);
  el.addEventListener("click", stop);
  document.body.appendChild(el);
  maskEl = el;
  maskStop = stop;
};
const unmountMask = () => {
  if (maskEl) {
    if (maskStop) {
      maskEl.removeEventListener("mousedown", maskStop);
      maskEl.removeEventListener("click", maskStop);
    }
    maskEl.remove();
    maskEl = null;
    maskStop = null;
  }
};

// 监听 visible：打开后 nextTick 绑定 stop + ESC + 聚焦 + 挂载蒙版 + patch clearEdit
watch(visible, (val) => {
  if (val) {
    nextTick(() => {
      bindPopperStop();
      bindEsc();
      focusTextarea();
      mountMask();
      patchClearEdit();
    });
  } else {
    unmountMask();
    unbindEsc();
  }
});

onMounted(() => {
  nextTick(() => {
    visible.value = true;
  });
});

onBeforeUnmount(() => {
  visible.value = false;
  unmountMask();
  unbindEsc();
  restoreClearEdit();
});
</script>

<template>
  <ElPopover
    :visible="visible"
    @update:visible="handleVisibleUpdate"
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
    popper-class="textarea-popover-edit vxe-table--ignore-clear"
  >
    <!-- reference：占位锚点，0x0 不可见，跟随 vxe 编辑层定位在单元格上 -->
    <template #reference>
      <span class="textarea-popover-edit__anchor" aria-hidden="true"></span>
    </template>
    <!-- 内容容器：@mousedown.stop @click.stop 阻止冒泡。
         ESC 改用 window 捕获阶段监听（见 bindEsc），不依赖事件从 textarea 冒泡到此处 -->
    <div
      class="textarea-popover-edit__body"
      @mousedown.stop
      @click.stop
    >
      <div class="textarea-popover-edit__header">
        <span class="textarea-popover-edit__title">{{ title }}</span>
        <div class="textarea-popover-edit__actions">
          <ElButton size="small" link @click="onClear">清除</ElButton>
          <ElButton size="small" link @click="onCancel">取消</ElButton>
          <ElButton size="small" link type="primary" @click="onConfirm">确定</ElButton>
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

  // popper 在蒙版之上，确保可交互
  z-index: 3000;
}

// 透明蒙版：覆盖全屏，拦截外部点击事件阻止 vxe 关闭编辑态
// z-index 低于 popover（popover 3000 > 蒙版 2000），点击 popover 内部按钮不受蒙版影响
.textarea-popover-edit__mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: transparent;
}
</style>
