<script setup>
/**
 * UploadPro —— 基于 el-upload 二次封装的配置式上传组件（FormPro 内置控件）。
 *
 * 设计目标：
 *  1. 完整保留 el-upload 的属性 / 事件 / 实例方法（未声明属性经 $attrs 透传，
 *     如 action / headers / data / name / httpRequest / beforeUpload …）；
 *  2. 照片墙（list-type=picture-card）：
 *     - 支持「复制粘贴」添加图片：组件内单一 paste 入口（焦点/事件目标在哪个
 *       UploadPro 实例内就上传到哪一个，多个上传项互不干扰），粘贴文件通过
 *       el-upload 暴露的 handleStart 入队、submit 触发，完整复用 beforeUpload
 *       校验、进度、成功回填链路，不另造一套上传请求；
 *     - 内置图片预览：el-dialog + el-image（preview-src-list / initial-index），
 *       点击墙内图片即打开，支持左右切换、缩放、旋转；
 *  3. 非图片文件（text / picture 列表 + show-file-list）：自定义 #file 渲染，
 *     在打勾 / 打叉状态图标「之前」放置眼睛图标，点击触发 preview 事件，
 *     作为后续接入文件预览组件的预留触发机制（本组件不实现非图片预览）；
 *  4. 支持多个上传项：每个 FormPro 字段对应独立实例，fileList / 预览弹窗 /
 *     粘贴入口互不影响；
 *  5. 拖拽上传区域宽高可自定义：dragWidth / dragHeight（数字按 px，字符串原样）。
 *
 * v-model 值：成功文件数组，元素支持两种形态
 *   - 字符串 URL：'https://x.com/a.png'
 *   - 对象：{ name: 'a.png', url: 'https://...' }（valueFormat 默认 'file'）
 */
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  useAttrs,
  useSlots,
} from "vue";
import { ElUpload, ElButton, ElIcon, ElDialog, ElImage, ElProgress, ElMessage } from "element-plus";
import {
  Plus,
  Upload as UploadIcon,
  UploadFilled,
  Document,
  View,
  Close,
  Check,
  ZoomIn,
  Delete,
  CircleCheckFilled,
  CircleCloseFilled,
} from "@element-plus/icons-vue";
import {
  isImageFile,
  normalizeIncoming,
  extractClipboardImages,
  resolveFileDescriptor,
  serializeValue,
  valueSignature,
  toCssSize,
  formatSize,
} from "./uploadUtils.js";

defineOptions({ name: "UploadPro", inheritAttrs: false });

const props = defineProps({
  // v-model：成功文件数组（string[] 或 {name,url}[]）
  modelValue: { type: Array, default: () => [] },
  // —— el-upload 常用属性（显式声明给默认值/便于配置；其余属性走 $attrs 透传）——
  // 列表形态：text（文件列表）/ picture（缩略图列表）/ picture-card（照片墙）
  listType: { type: String, default: "picture-card" },
  showFileList: { type: Boolean, default: true },
  drag: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  accept: { type: String, default: "" },
  limit: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  autoUpload: { type: Boolean, default: true },
  // —— UploadPro 扩展配置 ——
  // 照片墙是否显示「粘贴上传」入口（仅 picture-card 生效），默认 true
  pasteable: { type: Boolean, default: true },
  // 粘贴入口提示文案（位于照片墙 + 号下方）
  pasteText: {
    type: String,
    default: "点击此处粘贴图片",
  },
  // 拖拽区域宽高：数字 → px；字符串原样（如 '100%'、'480px'）；不传用 el-upload 默认
  dragWidth: { type: [Number, String], default: "" },
  dragHeight: { type: [Number, String], default: "" },
  // 拖拽区文案（支持简单 HTML，如高亮「点击上传」）
  dragText: {
    type: String,
    default: '将文件拖到此处，或<em>点击上传</em>',
  },
  // text / picture 模式触发按钮文案
  buttonText: { type: String, default: "点击上传" },
  // 按钮类型（el-button type）
  buttonType: { type: String, default: "primary" },
  // el-upload 下方提示（也可用 #tip 插槽）
  tip: { type: String, default: "" },
  // 单文件大小上限（MB）：内置 beforeUpload 校验，超限拦截并提示；0/不传不限制
  maxSizeMb: { type: Number, default: 0 },
  // 成功响应中 URL 的取值路径（lodash get），默认 data.url；取不到时回退 response.url / 字符串响应
  responseKey: { type: String, default: "data.url" },
  // 自定义成功响应解析：(response, file) => { name, url } | url，优先级最高
  resolveResponse: { type: Function, default: null },
 // v-model 值格式：'file' → {name,url}[]；'url' → string[]
  valueFormat: { type: String, default: "file" },
  // 超出 limit 时是否弹出默认提示
  showExceedMessage: { type: Boolean, default: true },
  // 上传失败时是否弹出默认提示
  showErrorMessage: { type: Boolean, default: true },
});

const emit = defineEmits([
  "update:modelValue",
  // 非图片文件预览触发（眼睛图标 / 文件名点击）：payload { file, name, url, index, fileList }
  // —— 后续文件预览组件挂载点，本组件只负责抛事件
  "preview",
  // 透传 el-upload 事件（签名与 el-upload 一致）
  "success",
  "error",
  "remove",
  "progress",
  "change",
  "exceed",
]);

const attrs = useAttrs();
const slots = useSlots();

const uploadRef = ref(null);

const isCard = computed(() => props.listType === "picture-card");

// 透传给 el-upload 的 attrs：剔除已由本组件显式接管的键
const uploadAttrs = computed(() => {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "onUpdate:modelValue") continue;
    out[k] = v;
  }
  return out;
});

const resolveOpts = computed(() => ({
  responseKey: props.responseKey,
  resolveResponse: props.resolveResponse,
  valueFormat: props.valueFormat,
}));

// —— fileList：外部 v-model ↔ el-upload 双向同步 ——
const fileList = ref(normalizeIncoming(props.modelValue));

// 外部值变化（编辑回填 / resetFields）→ 重建内部列表；与当前序列化值一致则跳过避免回环
watch(
  () => props.modelValue,
  (val) => {
    if (valueSignature(val) === valueSignature(serializeValue(fileList.value, resolveOpts.value)))
      return;
    fileList.value = normalizeIncoming(val);
  },
  { deep: true },
);

// 内部列表变化（上传成功 / 删除）→ 回抛 v-model（仅 success 项）
watch(
  fileList,
  () => {
    const val = serializeValue(fileList.value, resolveOpts.value);
    if (valueSignature(val) !== valueSignature(props.modelValue))
      emit("update:modelValue", val);
  },
  { deep: true },
);

// —— 上传前 / 删除前钩子：内置校验 + 串联用户透传钩子 ——
const handleBeforeUpload = async (rawFile) => {
  if (props.maxSizeMb && rawFile.size > props.maxSizeMb * 1024 * 1024) {
    ElMessage.error(
      `文件「${rawFile.name}」大小为 ${formatSize(rawFile.size)}，超出 ${props.maxSizeMb}MB 限制`,
    );
    return false;
  }
  const userHook = attrs.beforeUpload;
  if (typeof userHook === "function") return userHook(rawFile);
  return true;
};
const handleBeforeRemove = (uploadFile, uploadFiles) => {
  const userHook = attrs.beforeRemove;
  if (typeof userHook === "function") return userHook(uploadFile, uploadFiles);
  return true;
};

// —— el-upload 事件：内部处理 + 原样向外抛出（签名与 el-upload 一致）——
const onSuccess = (response, file, files) =>
  emit("success", response, file, files);
const onError = (err, file, files) => {
  if (props.showErrorMessage)
    ElMessage.error(`文件「${file?.name || ""}」上传失败`);
  emit("error", err, file, files);
};
const onRemove = (file, files) => emit("remove", file, files);
const onProgress = (evt, file, files) => emit("progress", evt, file, files);
const onChange = (file, files) => emit("change", file, files);
const onExceed = (files, oldFiles) => {
  if (props.showExceedMessage && props.limit)
    ElMessage.warning(`最多上传 ${props.limit} 个文件`);
  emit("exceed", files, oldFiles);
};

// —— 粘贴上传：单入口（根容器 @paste），按焦点所在实例投递，多实例互不干扰 ——
const onPaste = (e) => {
  if (props.disabled) return;
  const images = extractClipboardImages(e);
  if (!images.length) return; // 非图片粘贴：不拦截，保持浏览器原生行为
  e.preventDefault();
  let queue = images;
  // limit 校验（与 el-upload 选文件时的 fileList.length 口径一致）
  if (props.limit) {
    const remain = Math.max(0, props.limit - fileList.value.length);
    if (remain === 0) {
      onExceed(queue, fileList.value);
      return;
    }
    if (queue.length > remain) {
      ElMessage.warning(
        `最多上传 ${props.limit} 个，已自动忽略超出的 ${queue.length - remain} 张图片`,
      );
      queue = queue.slice(0, remain);
    }
  }
  // 复用 el-upload 链路：handleStart 入队（ready），submit 触发 beforeUpload + 真正上传
  queue.forEach((f) => uploadRef.value?.handleStart?.(f));
  if (props.autoUpload) uploadRef.value?.submit?.();
};

/**
 * 粘贴入口点击：入口位于 el-upload 触发卡片内部，而卡片自身的 click 会打开
 * 文件选择窗（handleClick → input.click()），故必须 stopPropagation 截断冒泡；
 * 点击后显式聚焦，随后 Ctrl+V 的 paste 事件冒泡到根节点统一走 onPaste。
 */
const onPasteEntryClick = (e) => {
  e.stopPropagation();
  e.currentTarget?.focus?.();
};

/** 编程式粘贴入口（测试 / 外部调用）：直接传入 File 列表 */
const pasteImages = (files) => {
  const images = (Array.isArray(files) ? files : [files]).filter(
    (f) => f && f.type && f.type.startsWith("image/"),
  );
  images.forEach((f) => uploadRef.value?.handleStart?.(f));
  if (props.autoUpload) uploadRef.value?.submit?.();
};

// —— 预览 ——
// 图片预览弹窗状态（每个 UploadPro 实例独立，多个上传项互不影响）
const preview = reactive({
  visible: false,
  urls: [],
  index: 0,
  key: 0,
});
const imageHostRef = ref(null);
const elImageRef = ref(null);

/** 构造非图片 preview 事件载荷（后续预览组件可直接消费） */
const buildPreviewPayload = (file) => {
  const desc = resolveFileDescriptor(file, resolveOpts.value);
  const index = fileList.value.findIndex((f) => f.uid === file.uid);
  return {
    file,
    name: desc.name,
    url: desc.url,
    index: index < 0 ? 0 : index,
    fileList: fileList.value,
  };
};

/** 打开图片预览：以当前所有成功图片为预览集，定位到被点击的张 */
const openImagePreview = (file) => {
  const images = fileList.value.filter(
    (f) => f.status === "success" && isImageFile(f),
  );
  const urls = images
    .map((f) => resolveFileDescriptor(f, resolveOpts.value).url)
    .filter(Boolean);
  if (!urls.length) {
    // 没有可用图片地址（极少数情况）：退化为非图片预览事件
    emit("preview", buildPreviewPayload(file));
    return;
  }
  const idx = images.findIndex((f) => f.uid === file.uid);
  preview.urls = urls;
  preview.index = idx < 0 ? 0 : idx;
  preview.key += 1;
  preview.visible = true;
};

/**
 * 统一预览入口：
 *  - 图片（照片墙 / 图片文件）→ 内置 el-dialog + el-image 预览；
 *  - 非图片文件 → 抛 preview 事件（预留外部预览组件挂载点）。
 */
const handlePreview = (file) => {
  if (!file || file.status === "uploading") return;
  if (isImageFile(file)) openImagePreview(file);
  else emit("preview", buildPreviewPayload(file));
};

// 弹窗打开后自动进入 el-image 大图查看器：
// 不依赖 dialog 过渡的 @opened 回调（jsdom / 某些场景不触发），改为 watch visible，
// ElImage 挂载后调用其实例暴露的 showPreview()（点击处理器挂在内层 img 上，
// 直接 click 外层 .el-image 不会触发预览）。
// 再延迟一个宏任务：el-dialog 自带 focus-trap，viewer 也有 focus-trap，
// 需等 dialog 的 trap 安定后再唤起 viewer，避免双 trap 激活顺序竞态导致 viewer 闪退
watch(
  () => preview.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    setTimeout(() => {
      elImageRef.value?.showPreview?.();
    }, 0);
  },
);

// 大图查看器关闭（Esc / X / 点遮罩）→ 联动关闭外层 dialog。
// 注：关闭后 .el-dialog 节点会被 EP 保留在 display:none 的 overlay 中（非未关闭）
const closePreview = () => {
  preview.visible = false;
};

// 自定义文件行删除（非图片列表 #file 插槽内）
const removeOne = (file) => uploadRef.value?.handleRemove?.(file);

/**
 * 根节点事件委托（照片墙）：
 * 原生 li / 透明 actions 覆盖层 / 缩略图在不同浏览器合成时机下命中目标可能不同，
 * 统一在根 click 上兜底——只要点在卡片 li 内（非删除按钮），即打开该张预览。
 * 覆盖层自身的 @click.stop 已处理时不会重复触发。
 */
const onRootClick = (e) => {
  if (!isCard.value) return;
  const deleteHit = e.target.closest?.(
    ".el-upload-list__item-delete,.el-icon--close,.el-icon--delete",
  );
  if (deleteHit) return;
  const li = e.target.closest?.(
    ".el-upload-list--picture-card .el-upload-list__item",
  );
  if (!li) return;
  const ul = li.parentElement;
  const index = ul ? Array.prototype.indexOf.call(ul.children, li) : -1;
  const file = fileList.value[index];
  if (file) handlePreview(file);
};

// 拖拽区宽高 → 根节点 CSS 变量（:deep .el-upload-dragger 消费）
const rootStyle = computed(() => {
  const s = {};
  const w = toCssSize(props.dragWidth);
  const h = toCssSize(props.dragHeight);
  if (w) s["--upload-pro-drag-w"] = w;
  if (h) s["--upload-pro-drag-h"] = h;
  return s;
});

defineExpose({
  // 原始 el-upload 实例（abort / submit / clearFiles / handleStart / handleRemove）
  uploadRef,
  // 便捷代理 el-upload 全部 5 个实例方法
  abort: (file) => uploadRef.value?.abort?.(file),
  submit: () => uploadRef.value?.submit?.(),
  clearFiles: (states) => uploadRef.value?.clearFiles?.(states),
  handleStart: (rawFile) => uploadRef.value?.handleStart?.(rawFile),
  handleRemove: (file) => uploadRef.value?.handleRemove?.(file),
  // 编程式粘贴
  pasteImages,
});
</script>

<template>
  <div
    class="upload-pro"
    :class="{ 'upload-pro--drag': drag }"
    :style="rootStyle"
    @paste="onPaste"
    @click="onRootClick"
  >
    <ElUpload
      ref="uploadRef"
      v-model:file-list="fileList"
      v-bind="uploadAttrs"
      :list-type="listType"
      :show-file-list="showFileList"
      :drag="drag"
      :multiple="multiple"
      :accept="accept"
      :limit="limit"
      :disabled="disabled"
      :auto-upload="autoUpload"
      :before-upload="handleBeforeUpload"
      :before-remove="handleBeforeRemove"
      :on-preview="handlePreview"
      :on-success="onSuccess"
      :on-error="onError"
      :on-remove="onRemove"
      :on-progress="onProgress"
      :on-change="onChange"
      :on-exceed="onExceed"
    >
      <!-- 触发区：外部默认插槽可整体自定义触发器；不传时使用内置内容
           （拖拽文案 / 照片墙 + / 按钮）。对应 el-upload 的 default 插槽
           （2.14.4 渲染层仅消费 default，trigger 仅类型残留） -->
      <slot>
        <template v-if="drag">
          <ElIcon class="el-icon--upload"><UploadFilled /></ElIcon>
          <div class="el-upload__text" v-html="dragText" />
        </template>
        <template v-else-if="isCard">
          <div class="upload-pro__card-inner">
            <ElIcon :size="24" class="upload-pro__card-plus">
              <Plus />
            </ElIcon>
            <!-- 粘贴入口位于触发卡片内部：@click.stop 阻止冒泡到 el-upload
                 触发区（否则会弹出系统选文件窗），仅聚焦等待 Ctrl+V -->
            <span
              v-if="pasteable && !disabled"
              class="upload-pro__card-paste"
              tabindex="0"
              role="button"
              :aria-label="pasteText"
              :title="pasteText"
              @click.stop="onPasteEntryClick"
            >
              {{ pasteText }}
            </span>
          </div>
        </template>
        <template v-else>
          <ElButton :type="buttonType" :disabled="disabled">
            <ElIcon style="margin-right: 4px"><UploadIcon /></ElIcon>
            {{ buttonText }}
          </ElButton>
        </template>
      </slot>

      <!-- 文件项统一 #file 插槽：同一组件上写两个同名 #file 会触发 Volar
           “v-slot 重复插槽名”红线，故照片墙 / 列表两套渲染在插槽内部按 isCard 分支 -->
      <template #file="{ file }">
        <template v-if="isCard">
        <img
          v-if="file.status !== 'uploading' && file.url"
          class="el-upload-list__item-thumbnail upload-pro__card-thumb"
          :src="file.url"
          alt=""
          @click.stop="handlePreview(file)"
        />
        <div v-else class="upload-pro__card-loading">
          <ElProgress
            type="circle"
            :width="50"
            :stroke-width="6"
            :percentage="Number(file.percentage) || 0"
          />
        </div>

        <!-- hover 操作层：整层点击即预览（透明覆盖层会截获图片点击），删除按钮 stop -->
        <span
          class="el-upload-list__item-actions"
          @click.stop="handlePreview(file)"
        >
          <span class="el-upload-list__item-preview">
            <ElIcon class="el-icon--zoom-in"><ZoomIn /></ElIcon>
          </span>
          <span
            v-if="!disabled"
            class="el-upload-list__item-delete"
            @click.stop="removeOne(file)"
          >
            <ElIcon class="el-icon--delete"><Delete /></ElIcon>
          </span>
        </span>

        <!-- 成功角标：打勾；失败：打叉 -->
        <label
          v-if="file.status === 'success'"
          class="el-upload-list__item-status-label"
        >
          <ElIcon class="el-icon--upload-success el-icon--check">
            <Check />
          </ElIcon>
        </label>
        <label
          v-else-if="file.status === 'fail'"
          class="el-upload-list__item-status-label upload-pro__fail-label"
        >
          <ElIcon class="el-icon--circle-close">
            <CircleCloseFilled />
          </ElIcon>
        </label>
        </template>

        <!-- 非图片/缩略图列表：自定义文件行，在打勾/打叉前插入眼睛图标 -->
        <template v-else>
        <img
          v-if="listType === 'picture' && file.url && isImageFile(file)"
          class="el-upload-list__item-thumbnail"
          :src="file.url"
          alt=""
          @click.stop="handlePreview(file)"
        />
        <div class="el-upload-list__item-info">
          <a
            class="el-upload-list__item-name"
            @click.prevent="handlePreview(file)"
          >
            <ElIcon class="el-icon--document"><Document /></ElIcon>
            <span class="el-upload-list__item-file-name" :title="file.name">
              {{ file.name }}
            </span>
          </a>
          <ElProgress
            v-if="file.status === 'uploading'"
            type="line"
            :stroke-width="2"
            :percentage="Number(file.percentage) || 0"
            style="margin-top: 0.5rem"
          />
        </div>

        <!-- 眼睛：位于打勾/打叉状态图标之前；图片走内置预览，非图片抛 preview 事件 -->
        <ElIcon
          v-if="file.status === 'success' || file.status === 'fail'"
          class="upload-pro__eye"
          title="预览"
          @click.stop="handlePreview(file)"
        >
          <View />
        </ElIcon>

        <!-- 成功：打勾（沿用 el-upload 原生类与显隐规则） -->
        <label
          v-if="file.status === 'success'"
          class="el-upload-list__item-status-label"
        >
          <ElIcon class="el-icon--upload-success el-icon--circle-check">
            <CircleCheckFilled />
          </ElIcon>
        </label>
        <!-- 失败：打叉 -->
        <label
          v-else-if="file.status === 'fail'"
          class="el-upload-list__item-status-label upload-pro__fail-label"
        >
          <ElIcon class="el-icon--circle-close">
            <CircleCloseFilled />
          </ElIcon>
        </label>

        <!-- 删除（沿用原生 el-icon--close：hover 行时显示） -->
        <ElIcon
          v-if="!disabled"
          class="el-icon--close"
          @click.stop="removeOne(file)"
        >
          <Close />
        </ElIcon>
        </template>
      </template>

      <!-- 提示：具名插槽优先，否则渲染 tip 文案 -->
      <template #tip>
        <slot name="tip">
          <div v-if="tip" class="el-upload__tip">{{ tip }}</div>
        </slot>
      </template>
    </ElUpload>

    <!-- 图片预览：el-dialog + el-image(preview-src-list) -->
    <ElDialog
      v-model="preview.visible"
      title="图片预览"
      width="800px"
      append-to-body
    >
      <div ref="imageHostRef" class="upload-pro__preview-body">
        <ElImage
          v-if="preview.visible && preview.urls.length"
          :key="preview.key"
          ref="elImageRef"
          class="upload-pro__preview-image"
          :src="preview.urls[preview.index]"
          :preview-src-list="preview.urls"
          :initial-index="preview.index"
          :hide-on-click-modal="true"
          preview-teleported
          fit="contain"
          @close="closePreview"
        />
      </div>
    </ElDialog>
  </div>
</template>

<style lang="scss" scoped>
.upload-pro {
  // 占满表单项内容列宽：FormPro 的 .el-form-item__content 为 flex 容器，
  // 子项 width:auto 会按内容收缩（实测仅 203.6px），导致 text/picture 文件列表
  // 被压窄、长文件名截断（如「项目说明书-v1.pdf」显示不全），所有模式统一拉满
  display: block;
  width: 100%;
  min-width: 0;

  // text / picture 文件列表占满根节点宽度，保证长文件名有完整的截断空间
  :deep(.el-upload-list) {
    width: 100%;
  }

  // 拖拽区：el-upload 根为 inline-block，需拉满后 dragger 的 width:100%
  // 才相对表单项列宽生效
  &.upload-pro--drag :deep(.el-upload) {
    display: block;
    width: 100%;
  }
  // 拖拽区宽高：消费根节点 CSS 变量（dragWidth / dragHeight），未设置时回退 el-upload 默认
  :deep(.el-upload-dragger) {
    width: var(--upload-pro-drag-w, 360px);
    height: var(--upload-pro-drag-h, 180px);
    max-width: 100%;
    box-sizing: border-box;
  }
  // 拖拽文案高亮
  :deep(.el-upload__text em) {
    color: var(--el-color-primary);
    font-style: normal;
  }
}

// —— 照片墙卡片 ——
// 整图可点：缩略图悬浮显示放大光标
:deep(.upload-pro__card-thumb) {
  cursor: zoom-in;
}
// 上传中：圆形进度蒙层居中
:deep(.upload-pro__card-loading) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.85);
}
// 卡片失败角标：覆盖原生绿色三角为危险色
:deep(.el-upload-list--picture-card .upload-pro__fail-label) {
  background-color: var(--el-color-danger);
}

// —— 照片墙触发卡片内部：+ 号 + 粘贴入口 垂直布局 ——
// 卡片本体是 148×148 的 inline-flex（EP 内置），inner 占满后垂直居中排列
.upload-pro__card-inner {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
}
// + 号原为卡片直接子级 i（EP 内置 secondary 色），包裹一层后需自行补色，
// hover / focus 卡片时跟随主色
.upload-pro__card-plus {
  color: var(--el-text-color-secondary);
  transition: color 0.2s;
}
:deep(.el-upload--picture-card:hover .upload-pro__card-plus),
:deep(.el-upload--picture-card:focus .upload-pro__card-plus) {
  color: var(--el-color-primary);
}
// 粘贴入口：+ 号下方带虚线边框的文字。它位于触发卡片内部，点击由
// @click.stop 截断，不会冒泡到卡片的选文件处理器；聚焦后 Ctrl+V 由根节点统一接收
.upload-pro__card-paste {
  font-size: 12px;
  line-height: 1.3;
  text-align: center;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  user-select: none;
  transition:
    color 0.2s,
    border-color 0.2s;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
  }
  // 点击聚焦后仅边框变主色（不改背景色），明确告知粘贴将投递到本上传项。
  // 用 :focus 而非 :focus-visible：鼠标点击 tabindex 元素不一定匹配 focus-visible
  &:focus {
    outline: none;
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }
}

// —— 非图片列表眼睛图标：位于打勾/打叉（right:5px）之前 ——
:deep(.upload-pro__eye) {
  position: absolute;
  top: 50%;
  right: 28px;
  transform: translateY(-50%);
  z-index: 1;
  display: inline-flex;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  opacity: 0.85;
  transition:
    color 0.2s,
    opacity 0.2s;

  &:hover {
    color: var(--el-color-primary);
    opacity: 1;
  }
}
// picture（缩略图）模式：眼睛放在缩略图左上角，避免与右上角角标冲突
:deep(.el-upload-list--picture .upload-pro__eye) {
  top: 6px;
  left: 6px;
  right: auto;
  transform: none;
  padding: 2px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.85);
}
// text 列表：眼睛（right:28px）比原生状态角标（right:5px）更靠外，
// 需加大文件名右留白，避免长文件名延伸到眼睛图标下方
:deep(.el-upload-list--text .el-upload-list__item-name) {
  padding-right: 56px;
}
// 失败打叉：强制显示（原生仅对 success 显示状态角标）+ 危险色
:deep(.upload-pro__fail-label) {
  display: inline-flex;
  color: var(--el-color-danger);
}
:deep(.upload-pro__fail-label .el-icon) {
  color: var(--el-color-danger);
}

// —— 预览弹窗 ——
.upload-pro__preview-body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}
.upload-pro__preview-image {
  width: 100%;
  height: 70vh;
  max-height: 70vh;
  cursor: zoom-in;
}
</style>
