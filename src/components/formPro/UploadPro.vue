<script setup>
/**
 * UploadPro —— 基于 el-upload 二次封装的配置式上传组件（FormPro 内置控件）。
 *
 * 设计目标：
 *  1. 完整保留 el-upload 的属性 / 事件 / 实例方法（未声明属性经 $attrs 透传，
 *     如 action / headers / data / name / httpRequest / beforeUpload …）；
 *  2. 粘贴上传：
 *     - 照片墙（list-type=picture-card）：触发卡片内 + 号下方渲染粘贴入口，
 *       仅提取剪贴板中的图片；
 *     - text / picture 模式：触发按钮右侧渲染粘贴入口，可粘贴任意文件
 *       （如资源管理器复制的附件）；
 *     - 单一 paste 入口：监听只挂在粘贴入口自身，必须「点击入口使其获得焦点」
 *       后 Ctrl+V 才生效（不会因点了上传按钮 / 文件行而误接收粘贴），多个上传项
 *       互不干扰；粘贴文件通过 el-upload 暴露的
 *       handleStart 入队、submit 触发，完整复用 beforeUpload 校验、进度、
 *       成功回填链路，不另造一套上传请求；
 *  3. 内置图片预览：组件内隐藏一个 el-image 作宿主，点击图片调用其
 *     showPreview() 唤起内置全屏查看器（preview-src-list / initial-index，
 *     teleport 到 body），支持左右切换、缩放、旋转，无需 el-dialog 外壳；
 *  4. 非图片文件（text / picture 列表 + show-file-list）：自定义 #file 渲染，
 *     - 眼睛图标（位于打勾 / 打叉状态图标「之前」，showPreviewIcon 可隐藏）：
 *       图片走内置预览，非图片触发 preview 事件（预留外部文件预览组件挂载点）；
 *     - 文件名点击：视为下载，触发 download 事件由外部接管下载行为；
 *  5. 禁用态合并：disabled 优先级 item 配置（显式 true / false）> el-form 的
 *     disabled，未配置时跟随表单；禁用时隐藏粘贴入口与删除按钮、忽略粘贴；
 *  6. 支持多个上传项：每个 FormPro 字段对应独立实例，fileList / 预览弹窗 /
 *     粘贴入口互不影响；
 *  7. 拖拽上传区域宽高可自定义：dragWidth / dragHeight（数字按 px，字符串原样）；
 *  8. text / picture 触发按钮文案 / 类型 / 尺寸可配：buttonText / buttonType /
 *     buttonSize（对应 el-button 的 size）；buttonSize=small / large 时
 *     el-form-item 的 label 高度自动联动（FormBlock 侧实现），与按钮中心对齐；
 *  9. tip 提示可配：字符串单条 / 数组多条（每条一个块元素换行显示），
 *     tipClass / tipStyle 作用于 tip 最外层根元素。
 *
 * v-model 值：文件数组（含上传中 / 失败等无 url 项，不再仅保留成功项），
 * 元素支持两种形态
 *   - 字符串 URL：'https://x.com/a.png'
 *   - 对象：{ name: 'a.png', url: 'https://...' }（valueFormat 默认 'file'）
 *   字段名非 name/url 时用 fieldMap 映射（如 { name: 'fileName', url: 'fileUrl' }），
 *   读取 / 展示 / 回写均按映射键处理；
 *   对象形态的业务字段（id 等）全程保真：回写时以原对象为基底仅覆盖映射字段；
 *   同时携带 el-upload 内部状态字段（存在时）：uid / status / percentage / raw
 *   （原始 File 引用）——autoUpload=false 延迟上传场景可在「确认」时从绑定值
 *   筛出带 raw 的项后调 submit() 手动上传；
 *   remove / preview / download 事件的 file 上亦可直接取到（file.id）
 */
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  useAttrs,
} from "vue";
import { ElUpload, ElButton, ElIcon, ElImage, ElProgress, ElMessage, ElMessageBox, useFormDisabled } from "element-plus";
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
  findUnsafeFileNameChars,
  extractClipboardFiles,
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
  // 原地同步模式（兼容 reactive 承载，语义同 FormPro mutableModel）：
  // 开启后列表变更原地 splice 写入 props.modelValue、不 emit update:modelValue——
  // v-model 编译的 files = $event 赋值对 reactive 代理会抛错，故该模式下父级
  // 改用 :model-value + mutable-model（勿写 v-model）。默认 false：emit 新数组整体替换
  mutableModel: { type: Boolean, default: false },
  // —— el-upload 常用属性（显式声明给默认值/便于配置；其余属性走 $attrs 透传）——
  // 列表形态：text（文件列表）/ picture（缩略图列表）/ picture-card（照片墙）
  listType: { type: String, default: "picture-card" },
  showFileList: { type: Boolean, default: true },
  drag: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  accept: { type: String, default: "" },
  limit: { type: Number, default: 0 },
  // disabled 默认值必须为 undefined（而非 false）：
  // 合并规则 = props.disabled ?? el-form.disabled ?? false（见下方 mergedDisabled），
  // item 显式配置 true / false 均优先于表单级 disabled；未配置时跟随 el-form
  disabled: { type: Boolean, default: undefined },
  autoUpload: { type: Boolean, default: false },
  // —— UploadPro 扩展配置 ——
  // 是否显示「粘贴上传」入口（默认 true）：
  //   picture-card → + 号下方；text / picture → 按钮右侧
  pasteable: { type: Boolean, default: true },
  // 粘贴入口提示文案；未设置时按模式回退（照片墙「点击此处粘贴图片」，
  // text / picture「点击此处粘贴文件」）
  pasteText: {
    type: String,
    default: "",
  },
  // 是否显示文件行（text / picture 列表）的预览眼睛图标；隐藏后文件名点击仍可下载
  showPreviewIcon: { type: Boolean, default: true },
  // text / picture 模式触发按钮尺寸（对应 el-button size：large / default / small）
  buttonSize: { type: String, default: "" },
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
  // el-upload 下方提示（也可用 #tip 插槽）：
  // 字符串 → 单条提示；数组（长度 > 1）→ 多条提示，每条一个块元素换行显示
  tip: { type: [String, Array], default: "" },
  // tip 最外层（根）元素的附加 class / style（与 el-upload__tip 类并存）
  tipClass: { type: [String, Array, Object], default: "" },
  tipStyle: { type: [String, Object, Array], default: "" },
  // 单文件大小上限（MB）：内置 beforeUpload 校验，超限拦截并提示；0/不传不限制
  maxSizeMb: { type: Number, default: 0 },
  // 成功响应中 URL 的取值路径（lodash get），默认 data.url；取不到时回退 response.url / 字符串响应
  responseKey: { type: String, default: "data.url" },
  // 自定义成功响应解析：(response, file) => { name, url } | url，优先级最高
  resolveResponse: { type: Function, default: null },
 // v-model 值格式：'file' → {name,url}[]；'url' → string[]
  valueFormat: { type: String, default: "file" },
  // 字段映射：v-model 对象元素 / 接口返回的字段名非 name/url 时配置，
  // 如 { name: 'fileName', url: 'fileUrl' }；序列化回写同样按映射键输出
  fieldMap: { type: Object, default: () => ({}) },
  // 超出 limit 时是否弹出默认提示
  showExceedMessage: { type: Boolean, default: true },
  // 上传失败时是否弹出默认提示
  showErrorMessage: { type: Boolean, default: true },
  // 删除 / 移除文件前是否二次确认（默认 false）：
  // 文件带 raw（本地文件流）时按「移除」提示，否则按「删除」提示；
  // 取消确认则中止本次移除（与用户透传的 beforeRemove 钩子串联，钩子返回 false 时不弹框）
  confirmRemove: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:modelValue",
  // 非图片文件预览触发（仅眼睛图标）：payload { file, name, url, index, fileList }
  // —— 后续文件预览组件挂载点，本组件只负责抛事件
  "preview",
  // 文件名点击视为下载：payload 同 preview，本组件只抛事件，由外部接管下载行为
  "download",
  // 透传 el-upload 事件（签名与 el-upload 一致）
  "success",
  "error",
  "remove",
  "progress",
  "change",
  "exceed",
]);

const attrs = useAttrs();

const uploadRef = ref(null);

const isCard = computed(() => props.listType === "picture-card");

// 禁用态合并：props.disabled（item 显式 true / false）?? el-form.disabled ?? false。
// el-upload 内部走同一 hook，模板中所有禁用判断统一改用 mergedDisabled
const mergedDisabled = useFormDisabled();

// 粘贴入口文案：用户未配置时按模式回退（照片墙贴图片，其余模式贴任意文件）
const pasteLabel = computed(
  () => props.pasteText || (isCard.value ? "点击此处粘贴图片" : "点击此处粘贴文件"),
);

// tip 提示行：字符串归一为单行；数组按行拆分（过滤空行），多行时逐行块元素换行显示
const tipLines = computed(() => {
  const lines = Array.isArray(props.tip) ? props.tip : [props.tip];
  return lines
    .map((line) => (line == null ? "" : String(line)))
    .filter((line) => line !== "");
});

// 透传给 el-upload 的 attrs：剔除已由本组件显式接管的键；
// action 未传时默认 "#"（el-upload 的 action 为必填语义，自定义 httpRequest
// 场景下无实际用途，默认占位避免缺省告警/异常）
const uploadAttrs = computed(() => {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    // class / style 已应用到根 .upload-pro 容器（见模板），不再透传给内层 el-upload，
    // 避免用户的 class/style 同时落到两层导致样式叠加或定位异常
    if (k === "class" || k === "style" || k === "onUpdate:modelValue") continue;
    out[k] = v;
  }
  if (out.action == null || out.action === "") out.action = "#";
  return out;
});

const resolveOpts = computed(() => ({
  responseKey: props.responseKey,
  resolveResponse: props.resolveResponse,
  valueFormat: props.valueFormat,
  fieldMap: props.fieldMap,
}));

// —— fileList：外部 v-model ↔ el-upload 双向同步 ——
const fileList = ref(normalizeIncoming(props.modelValue, props.fieldMap));

// 外部值变化（编辑回填 / resetFields）→ 重建内部列表；与当前序列化值一致则跳过避免回环
watch(
  () => props.modelValue,
  (val) => {
    if (
      valueSignature(val, props.fieldMap) ===
      valueSignature(serializeValue(fileList.value, resolveOpts.value), props.fieldMap)
    )
      return;
    fileList.value = normalizeIncoming(val, props.fieldMap);
  },
  { deep: true },
);

// 内部列表变化（上传成功 / 失败 / 删除）→ 回抛 v-model（含无 url 项，不再仅 success）
watch(
  fileList,
  () => {
    const val = serializeValue(fileList.value, resolveOpts.value);
    if (valueSignature(val, props.fieldMap) === valueSignature(props.modelValue, props.fieldMap))
      return;
    // mutableModel：原地 splice 写入父级数组、不 emit（兼容 reactive([]) 承载）；
    // 写入触发上方 modelValue 深 watch，签名一致跳过重建，与 emit 路径同样收敛
    if (props.mutableModel) {
      if (Array.isArray(props.modelValue)) {
        props.modelValue.splice(0, props.modelValue.length, ...val);
      }
      return;
    }
    emit("update:modelValue", val);
  },
  { deep: true },
);

// —— 上传前 / 删除前钩子：内置校验 + 串联用户透传钩子 ——
const handleBeforeUpload = async (rawFile) => {
  // 文件名含 URL/文件系统不安全字符（# ? % 等）：拦截并提示。
  // 服务端若按原名拼接访问 URL 且不做编码，这些字符会导致资源无法加载；
  // beforeUpload 返回 false 时 el-upload 会自动将该文件移出列表
  const unsafeChars = findUnsafeFileNameChars(rawFile.name);
  if (unsafeChars.length) {
    ElMessage.error(
      `文件「${rawFile.name}」名称包含不允许的特殊字符（${unsafeChars.join(" ")}），请修改文件名后重新上传`,
    );
    return false;
  }
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
const handleBeforeRemove = async (uploadFile, uploadFiles) => {
  const userHook = attrs.beforeRemove;
  if (typeof userHook === "function") {
    const passed = await userHook(uploadFile, uploadFiles);
    if (passed === false) return false;
  }
  if (!props.confirmRemove) return true;
  // 有 raw（本地文件流）→ 移除；无 raw（仅服务端 url）→ 删除
  const isRemoving = !!uploadFile?.raw;
  try {
    await ElMessageBox.confirm(
      isRemoving
        ? `确定要移除文件「${uploadFile?.name || ""}」吗？`
        : `确定要删除文件「${uploadFile?.name || ""}」吗？删除后不可恢复。`,
      isRemoving ? "移除确认" : "删除确认",
      {
        type: "warning",
        confirmButtonText: isRemoving ? "移除" : "删除",
        cancelButtonText: "取消",
      },
    );
    return true;
  } catch {
    return false;
  }
};

// —— el-upload 事件：内部处理 + 原样向外抛出（签名与 el-upload 一致）——
const onSuccess = (response, file, files) =>
  emit("success", response, file, files);
const onError = (err, file, files) => {
  if (props.showErrorMessage)
    ElMessage.error(`文件「${file?.name || ""}」上传失败`);
  emit("error", err, file, files);
};
// 已移除文件归档：每次移除（UI 叉号 / 照片墙删除 / 编程式 handleRemove 均经此处）
// 把该文件的序列化快照入档（含 raw / 业务字段），供 getRemovedFiles 取回——
// 典型用途：点「确认」时向服务端发删除请求、回收 blob: URL 等
const removedFiles = ref([]);
const onRemove = (file, files) => {
  const snap = serializeValue([file], resolveOpts.value)[0];
  if (snap) removedFiles.value.push(snap);
  emit("remove", file, files);
};
const onProgress = (evt, file, files) => emit("progress", evt, file, files);
const onChange = (file, files) => emit("change", file, files);
const onExceed = (files, oldFiles) => {
  if (props.showExceedMessage && props.limit)
    ElMessage.warning(`最多上传 ${props.limit} 个文件`);
  emit("exceed", files, oldFiles);
};

// —— 粘贴上传：监听绑定在粘贴入口元素自身（见模板 @paste）——
// paste 事件会派发到「当前聚焦元素」并向上冒泡，若挂在根节点，则只要焦点落在这
// 个实例内的任意元素（上传按钮、隐藏的 file input、文件名链接、删除按钮…）就会
// 被误当作粘贴入口，出现「没点粘贴区也能粘贴」。因此只在入口上监听：
// 只有点击入口使其聚焦后，Ctrl+V 才走这里。照片墙仅提取图片；text / picture
// 列表等文件场景提取剪贴板全部文件
const onPaste = (e) => {
  if (mergedDisabled.value) return;
  const files = extractClipboardFiles(e, isCard.value);
  if (!files.length) return; // 无文件粘贴：不拦截，保持浏览器原生行为
  e.preventDefault();
  let queue = files;
  // 单文件模式（multiple=false）：粘贴多个时仅取第一个，与 el-upload 文件选择器
  // 单次单选语义一致（el-upload 的 multiple 仅约束选择器，handleStart 本身不过滤）
  if (!props.multiple && queue.length > 1) queue = queue.slice(0, 1);
  // limit 校验（与 el-upload 选文件时的 fileList.length 口径一致）
  if (props.limit) {
    const remain = Math.max(0, props.limit - fileList.value.length);
    if (remain === 0) {
      onExceed(queue, fileList.value);
      return;
    }
    if (queue.length > remain) {
      ElMessage.warning(
        `最多上传 ${props.limit} 个，已自动忽略超出的 ${queue.length - remain} ${
          isCard.value ? "张图片" : "个文件"
        }`,
      );
      queue = queue.slice(0, remain);
    }
  }
  // 复用 el-upload 链路：handleStart 入队（ready），submit 触发 beforeUpload + 真正上传
  queue.forEach((f) => uploadRef.value?.handleStart?.(f));
  if (props.autoUpload) uploadRef.value?.submit?.();
};

/**
 * 粘贴入口点击：入口位于 el-upload 触发区内部（照片墙卡片 / 按钮行），而触发区
 * 自身的 click 会打开文件选择窗（handleClick → input.click()），故必须
 * stopPropagation 截断冒泡；点击后显式聚焦，随后 Ctrl+V 的 paste 事件冒泡到
 * 根节点统一走 onPaste。
 */
const onPasteEntryClick = (e) => {
  e.stopPropagation();
  e.currentTarget?.focus?.();
};

/** 编程式粘贴入口（测试 / 外部调用）：直接传入 File 列表；禁用态下忽略 */
const pasteImages = (files) => {
  if (mergedDisabled.value) return;
  const images = (Array.isArray(files) ? files : [files]).filter(
    (f) => f && f.type && f.type.startsWith("image/"),
  );
  images.forEach((f) => uploadRef.value?.handleStart?.(f));
  if (props.autoUpload) uploadRef.value?.submit?.();
};

// —— 预览 ——
// 图片预览状态（每个 UploadPro 实例独立，多个上传项互不影响）。
// 不包 el-dialog：模板末尾渲染一个隐藏的 el-image 作为查看器宿主，
// 点击时更新 urls / index 后调用其 showPreview() 唤起全屏查看器。
const preview = reactive({
  urls: [],
  index: 0,
  key: 0,
});
const elImageRef = ref(null);

/** 构造 preview / download 事件载荷（外部预览 / 下载组件可直接消费） */
const buildFilePayload = (file) => {
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
const openImagePreview = async (file) => {
  const images = fileList.value.filter(
    (f) => f.status === "success" && isImageFile(f),
  );
  const urls = images
    .map((f) => resolveFileDescriptor(f, resolveOpts.value).url)
    .filter(Boolean);
  if (!urls.length) {
    // 没有可用图片地址（极少数情况）：退化为非图片预览事件
    emit("preview", buildFilePayload(file));
    return;
  }
  const idx = images.findIndex((f) => f.uid === file.uid);
  preview.urls = urls;
  preview.index = idx < 0 ? 0 : idx;
  preview.key += 1;
  // 等隐藏 el-image 按新 previewSrcList / initialIndex 重渲染后唤起查看器。
  // 查看器由 ElImage 内部维护并 teleport 到 body，关闭（Esc / X / 点遮罩）
  // 也由其自行处理，无需外层联动
  await nextTick();
  elImageRef.value?.showPreview?.();
};

/**
 * 统一预览入口（眼睛图标 / 缩略图 / 照片墙覆盖层 / el-upload on-preview）：
 *  - 图片（照片墙 / 图片文件）→ 内置 el-image 查看器预览；
 *  - 非图片文件 → 抛 preview 事件（预留外部预览组件挂载点）。
 */
const handlePreview = (file) => {
  if (!file || file.status === "uploading") return;
  if (isImageFile(file)) openImagePreview(file);
  else emit("preview", buildFilePayload(file));
};

/**
 * 下载入口（text / picture 列表点击文件名触发）：与眼睛图标的 handlePreview 区分——
 * 眼睛只负责预览；文件名点击视为下载，抛 download 事件由外部接管下载行为。
 */
const handleDownload = (file) => {
  if (!file || file.status === "uploading") return;
  emit("download", buildFilePayload(file));
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

// 收集当前带原始 File（raw）的文件项（与 v-model 同构的序列化形态）——
// 延迟上传场景（autoUpload=false）点「确认」后筛出待上传项，取 raw 手动提交
const getRawFiles = () =>
  serializeValue(fileList.value, resolveOpts.value).filter(
    (it) => it && typeof it === "object" && it.raw,
  );
// 收集累计被移除的文件数据（序列化快照数组，含业务字段与 raw）。
// - 不传 field：全部已移除项
// - 传 field（如 'id'）：仅返回「存在该属性且有值」的项
// - valuesOnly=true：改为收集该属性的值（如 collect url → string[]）
const getRemovedFiles = (field, valuesOnly = false) => {
  const list = [...removedFiles.value];
  if (!field) return list;
  const hit = list.filter((it) => it && typeof it === "object" && it[field]);
  return valuesOnly ? hit.map((it) => it[field]) : hit;
};

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
  // 数据收集
  getRawFiles,
  getRemovedFiles,
});
</script>

<template>
  <div
    class="upload-pro"
    :class="[attrs.class, { 'upload-pro--drag': drag }]"
    :style="[attrs.style, rootStyle]"
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
      :disabled="mergedDisabled"
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
                 触发区（否则会弹出系统选文件窗），仅聚焦等待 Ctrl+V；
                 @paste 只挂在入口自身，避免实例内其他元素聚焦时误接收粘贴 -->
            <span
              v-if="pasteable && !mergedDisabled"
              class="upload-pro__card-paste"
              tabindex="0"
              role="button"
              :aria-label="pasteLabel"
              :title="pasteLabel"
              @click.stop="onPasteEntryClick"
              @paste="onPaste"
            >
              {{ pasteLabel }}
            </span>
          </div>
        </template>
        <template v-else>
          <!-- 按钮行：上传按钮 + 右侧粘贴入口（粘贴任意文件） -->
          <div class="upload-pro__trigger-row">
            <ElButton :type="buttonType" :size="buttonSize" :disabled="mergedDisabled">
              <ElIcon style="margin-right: 4px"><UploadIcon /></ElIcon>
              {{ buttonText }}
            </ElButton>
            <!-- 粘贴入口位于 el-upload 触发区内部，点击必须 stopPropagation
                 截断冒泡（否则弹出系统选文件窗），仅聚焦等待 Ctrl+V；
                 @paste 只挂在入口自身，避免实例内其他元素聚焦时误接收粘贴 -->
            <span
              v-if="pasteable && !mergedDisabled"
              class="upload-pro__btn-paste"
              tabindex="0"
              role="button"
              :aria-label="pasteLabel"
              :title="pasteLabel"
              @click.stop="onPasteEntryClick"
              @paste="onPaste"
            >
              {{ pasteLabel }}
            </span>
          </div>
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
            v-if="!mergedDisabled"
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
          <!-- 文件名点击视为下载（handleDownload），与眼睛图标的预览区分开 -->
          <a
            class="el-upload-list__item-name"
            @click.prevent="handleDownload(file)"
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

        <!-- 眼睛：位于打勾/打叉状态图标之前；图片走内置预览，非图片抛 preview 事件；
             showPreviewIcon=false 时整体隐藏（不影响文件名点击下载） -->
        <ElIcon
          v-if="showPreviewIcon && (file.status === 'success' || file.status === 'fail')"
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

        <!-- 删除（沿用原生 el-icon--close：hover 行时显示；禁用态隐藏） -->
        <ElIcon
          v-if="!mergedDisabled"
          class="el-icon--close"
          @click.stop="removeOne(file)"
        >
          <Close />
        </ElIcon>
        </template>
      </template>

      <!-- 提示：具名插槽优先，否则渲染 tip 文案（字符串单行 / 数组多行块元素换行）；
           tipClass / tipStyle 作用于 tip 最外层根元素 -->
      <template #tip>
        <slot name="tip">
          <div
            v-if="tipLines.length"
            class="el-upload__tip"
            :class="tipClass"
            :style="tipStyle"
          >
            <template v-if="tipLines.length === 1">{{ tipLines[0] }}</template>
            <template v-else>
              <div v-for="(line, i) in tipLines" :key="i">{{ line }}</div>
            </template>
          </div>
        </slot>
      </template>
    </ElUpload>

    <!-- 图片预览：隐藏的 el-image 仅作查看器宿主（display:none），
         查看器本体 teleport 到 body 全屏展示，关闭由 el-image 自行处理 -->
    <ElImage
      v-if="preview.urls.length"
      :key="preview.key"
      ref="elImageRef"
      class="upload-pro__preview-image"
      :src="preview.urls[preview.index]"
      :preview-src-list="preview.urls"
      :initial-index="preview.index"
      :hide-on-click-modal="true"
      preview-teleported
      fit="contain"
    />
  </div>
</template>

<style lang="scss" scoped>
.upload-pro {
  // 占满表单项内容列宽：FormPro 的 .el-form-item__content 为 flex 容器，
  // 子项 width:auto 会按内容收缩（实测仅 203.6px），导致 text/picture 文件列表
  // 被压窄、长文件名截断（如「项目说明书-v1.pdf」显示不全），所有模式统一拉满
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  // box-sizing: border-box：用户经 class/style 透传的 border/padding 计入宽度，不撑破父容器
  box-sizing: border-box;
  // overflow-x: clip：裁切内部可能的横向空白溢出（非 overflow:hidden），避免触发水平滚动条
  overflow-x: clip;

  // text / picture 文件列表占满根节点宽度，保证长文件名有完整的截断空间
  :deep(.el-upload-list) {
    width: 100%;
  }

  // 还原 el-upload 原生行高：.el-form-item__content 的 line-height:32px 会被内部
  // 文件行 / 提示文案继承（el-upload 自身未给 .el-upload-list__item 设行高），
  // 把每行撑到 32px、文件间距变大；这里在根节点重置为浏览器默认行高，
  // 组件内的文字表现与独立使用 el-upload 时一致
  line-height: normal;

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
// 卡片尺寸：覆盖 EP 默认 146×146，统一收窄为 98×98（触发卡 + 已上传列表项）
:deep(.el-upload--picture-card),
:deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 98px;
  height: 98px;
}
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
// 卡片本体是 98×98 的 inline-flex（见上方尺寸覆盖），inner 占满后垂直居中排列
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
  // 扩大可点区域：四周补 padding（绝对定位不参与布局，不改变文件行行高）；
  // 总高约 14+10=24px
  padding: 5px 6px;
  box-sizing: border-box;
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
  padding: 4px;
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

// —— 按钮行：按钮 + 右侧粘贴入口水平排列，与按钮等高对齐 ——
.upload-pro__trigger-row {
  display: inline-flex;
  align-items: stretch;
  gap: 8px;
}
.upload-pro__btn-paste {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  // 显式行高：入口按 12px 字号收敛高度，避免随外部行高上下文变化而撑高按钮行
  line-height: 1.4;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition:
    color 0.2s,
    border-color 0.2s;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
  }
  &:focus {
    outline: none;
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }
}

// —— 预览宿主：el-image 本体不展示，仅消费其 teleport 到 body 的全屏查看器 ——
.upload-pro__preview-image {
  display: none;
}
</style>
