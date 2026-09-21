<script setup>
import { computed, ref, useAttrs } from 'vue'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { ElMessage } from 'element-plus'
import { fileToBase64, isImageFile } from './utils'

/**
 * BaseMdEditor —— md-editor-v3 的二次封装
 *
 * 核心能力：
 * 1. 图片默认以 base64 内联（支持工具栏上传 / 拖拽 / 截图粘贴）
 * 2. 可选自定义上传函数（上传到后端返回 URL）
 * 3. 中文语言、默认预览主题等开箱即用
 * 4. 透传所有原生 props 与事件
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
  // 高度
  height: {
    type: [String, Number],
    default: undefined,
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

const emit = defineEmits(['update:modelValue'])

// 透传原生事件给 MdEditor（除了 update:modelValue 与 onUploadImg 由本组件处理）
const attrs = useAttrs()

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
  <MdEditor
    ref="mdEditorRef"
    v-bind="mergedProps"
    :model-value="modelValue"
    :placeholder="placeholder"
    :theme="theme"
    :preview-theme="previewTheme"
    :code-theme="codeTheme"
    :language="language"
    :toolbars="toolbars"
    :toolbars-exclude="toolbarsExclude"
    :height="height"
    :disabled="disabled"
    :on-upload-img="handleUploadImg"
    @update:model-value="handleChange"
  />
</template>

<style scoped lang="scss">
:deep(.md-editor) {
  border-radius: 4px;
}
</style>
