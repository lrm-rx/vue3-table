<script setup>
import { computed, ref, useAttrs, watch } from 'vue'
defineOptions({ inheritAttrs: false })
import { MdEditor, MdPreview, config, allToolbar } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import 'md-editor-v3/lib/preview.css'
import { ElMessage } from 'element-plus'
import { Mark, Emoji, PreviewThemeSwitch } from '@vavt/v3-extension'
import '@vavt/v3-extension/lib/asset/Mark.css'
import '@vavt/v3-extension/lib/asset/Emoji.css'
import '@vavt/v3-extension/lib/asset/PreviewThemeSwitch.css'
import MarkExtension from 'markdown-it-mark'
import { fileToBase64, isImageFile } from './utils'
import Time from './extensions/Time.vue'
import DateTimeFooter from './extensions/DateTimeFooter.vue'

// 注册 markdown-it-mark 扩展（==文本== → <mark>文本</mark>）
config({
  markdownItConfig: (md) => {
    md.use(MarkExtension)
  },
})

/**
 * BaseMdEditor —— md-editor-v3 的二次封装
 *
 * 核心能力：
 * 1. 图片默认以 base64 内联（支持工具栏上传 / 拖拽 / 截图粘贴）
 * 2. 可选自定义上传函数（上传到后端返回 URL）
 * 3. 中文语言、默认预览主题等开箱即用
 * 4. 集成 4 个工具栏扩展：Mark（高亮）、Emoji（表情）、PreviewThemeSwitch（预览主题切换）、Time（插入时间）
 * 5. 透传所有原生 props 与事件
 */

const props = defineProps({
  // v-model 绑定
  modelValue: {
    type: String,
    default: '',
  },
  // 占位符
  placeholder: {
    type: String,
    default: '请输入 Markdown 内容...',
  },
  // 编辑器主题：light / dark
  theme: {
    type: String,
    default: 'light',
  },
  // 是否显示预览栏（默认不显示，用户可通过工具栏的预览按钮切换）
  preview: {
    type: Boolean,
    default: false,
  },
  // 预览主题
  previewTheme: {
    type: String,
    default: 'default',
  },
  // 代码高亮主题
  codeTheme: {
    type: String,
    default: 'atom',
  },
  // 语言
  language: {
    type: String,
    default: 'zh-CN',
  },
  // 工具栏配置
  toolbars: {
    type: Array,
    default: () => undefined,
  },
  // 排除的工具栏项（默认去掉最右侧「github 源码」图标，业务项目通常不需要）
  toolbarsExclude: {
    type: Array,
    default: () => ['github'],
  },
  // 页脚配置：默认 [字数, 日期时间, =, 同步滚动]
  // 数字 0 引用 defFooters 中的第一个自定义页脚组件（DateTimeFooter）
  // 布局：左侧字数统计 | 右侧 日期时间 + 同步滚动
  footers: {
    type: Array,
    default: () => ['markdownTotal', '=', 0, 'scrollSwitch'],
  },
  // 高度
  height: {
    type: [String, Number],
    default: undefined,
  },
  // 只读模式：渲染为纯预览组件（无工具栏、无边框），适用于文章发布后查看
  readOnly: {
    type: Boolean,
    default: false,
  },
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false,
  },
  // 图片处理方式：base64（默认，内联到 markdown）/ custom（调用 customUpload）
  uploadType: {
    type: String,
    default: 'base64',
    validator: (v) => ['base64', 'custom'].includes(v),
  },
  // 自定义上传函数：(files: File[]) => Promise<string[] | Array<{url,alt,title}>>
  customUpload: {
    type: Function,
    default: null,
  },
  // 单张图片最大体积（MB），超过则提示并跳过
  maxImageSize: {
    type: Number,
    default: 10,
  },
})

const emit = defineEmits(['update:modelValue', 'update:previewTheme'])

// 预览主题本地状态（供 PreviewThemeSwitch 切换），与 prop 双向同步
const previewThemeRef = ref(props.previewTheme)
watch(
  () => props.previewTheme,
  (v) => {
    previewThemeRef.value = v
  },
)
watch(previewThemeRef, (v) => {
  emit('update:previewTheme', v)
})

// 透传原生事件给 MdEditor（除了 update:modelValue 与 onUploadImg 由本组件处理）
const attrs = useAttrs()

// 扩展组件在 defToolbars 中的数量，用于追加数字索引到 toolbars
const EXTENSION_COUNT = 4

// 最终的工具栏列表：在用户/默认 toolbars 末尾追加 [0..N-1] 引用 defToolbars 中的扩展
// 移除默认的 "=" 分隔符，让所有按钮在同一组内流动排列，避免窄容器换行后留白
// md-editor-v3 的 toolbars 数组用数字索引引用 defToolbars 里的自定义 VNode
const resolvedToolbars = computed(() => {
  const base = props.toolbars || allToolbar
  const filtered = base.filter((item) => item !== '=')
  const indices = Array.from({ length: EXTENSION_COUNT }, (_, i) => i)
  return [...filtered, ...indices]
})

// 合并后的 props（供 MdEditor 使用），排除本组件自定义的 props
const mergedProps = computed(() => {
  const rest = { ...attrs }
  // 移除可能被 attrs 捕获的本组件自定义 prop
  delete rest.uploadType
  delete rest.customUpload
  delete rest.maxImageSize
  return rest
})

// 统一的图片上传处理（覆盖工具栏上传 / 拖拽 / 截图粘贴三种入口）
const handleUploadImg = async (files, callback) => {
  // 1. 过滤非图片文件 + 体积校验
  const validFiles = []
  for (const file of files) {
    if (!isImageFile(file)) {
      ElMessage.warning(`「${file.name}」不是图片文件，已跳过`)
      continue
    }
    if (props.maxImageSize > 0 && file.size > props.maxImageSize * 1024 * 1024) {
      ElMessage.warning(`「${file.name}」超过 ${props.maxImageSize}MB，已跳过`)
      continue
    }
    validFiles.push(file)
  }
  if (!validFiles.length) {
    callback([])
    return
  }

  try {
    // 2. 按 uploadType 分发
    if (props.uploadType === 'custom' && typeof props.customUpload === 'function') {
      const urls = await props.customUpload(validFiles)
      callback(urls)
      return
    }

    // 默认：base64 内联
    const urls = await Promise.all(validFiles.map((f) => fileToBase64(f)))
    callback(urls)
  } catch (err) {
    console.error('[BaseMdEditor] 图片处理失败：', err)
    ElMessage.error('图片处理失败，请重试')
    callback([])
  }
}

// v-model 同步
const handleChange = (val) => {
  emit('update:modelValue', val)
}

// 暴露底层 MdEditor 实例，便于父组件调用 insert / rerender 等方法
const mdEditorRef = ref()
defineExpose({
  /** 底层 md-editor-v3 实例 */
  editorRef: mdEditorRef,
})
</script>

<template>
  <!-- 只读模式：纯预览，无工具栏无边框 -->
  <MdPreview
    v-if="readOnly"
    :model-value="modelValue"
    :theme="theme"
    :preview-theme="previewThemeRef"
    :code-theme="codeTheme"
    :language="language"
  />
  <!-- 编辑模式 -->
  <MdEditor
    v-else
    ref="mdEditorRef"
    v-bind="mergedProps"
    :model-value="modelValue"
    :placeholder="placeholder"
    :theme="theme"
    :preview="preview"
    :preview-theme="previewThemeRef"
    :code-theme="codeTheme"
    :language="language"
    :toolbars="resolvedToolbars"
    :toolbars-exclude="toolbarsExclude"
    :footers="footers"
    :height="height"
    :disabled="disabled"
    :on-upload-img="handleUploadImg"
    @update:model-value="handleChange"
  >
    <template #defToolbars>
      <Mark />
      <Emoji />
      <PreviewThemeSwitch v-model="previewThemeRef" />
      <Time />
    </template>
    <template #defFooters>
      <DateTimeFooter />
    </template>
  </MdEditor>
</template>

<style scoped lang="scss">
// .md-editor 是根元素，直接带 data-v 属性，用普通 scoped 选择器即可
.md-editor {
  border-radius: 4px;
}

// 工具栏自动换行（容器宽度较小时避免按钮被截断）
// 注意：不能用 :deep(.md-editor) 嵌套，因为 .md-editor 就是带 scope 的根元素
:deep(.md-editor-toolbar-wrapper) {
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
}

:deep(.md-editor-toolbar) {
  flex-wrap: wrap;
  row-gap: 4px;
  // 覆盖默认 space-between，避免窄容器换行后第一行右侧留白
  justify-content: flex-start;
  gap: 4px;
}

:deep(.md-editor-toolbar-left),
:deep(.md-editor-toolbar-right) {
  flex-wrap: wrap;
  row-gap: 4px;
  // 允许 flex 子项收缩到内容宽度以下，使内部按钮能换行
  min-width: 0;
}
</style>
