<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
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
// 本地 katex：替代运行时从 CDN 加载，保证字体/CSS 随构建打包，
// 避免 CDN 不可达、字体加载失败导致的公式排版错乱（重叠、平方根间距异常等）
import katex from 'katex'
import 'katex/dist/katex.min.css'
// 本地 echarts：md-editor-v3 默认从 unpkg 加载 echarts@6.1.0，内网环境不可达；
// 这里注入本地实例，让 ```echarts 代码块的图表渲染不依赖外网
import * as echarts from 'echarts'
import { fileToBase64, isImageFile, countMarkdownChars } from './utils'
import Time from './extensions/Time.vue'
import DateTimeFooter from './extensions/DateTimeFooter.vue'
import CharCount from './extensions/CharCount.vue'
import AutoSave from './extensions/AutoSave.vue'
import Catalog from './extensions/Catalog.vue'
import CatalogToggle from './extensions/CatalogToggle.vue'

// 全局配置：
// 1. 注册 markdown-it-mark 扩展（==文本== → <mark>文本</mark>）
// 2. 注入本地 katex 实例，md-editor-v3 检测到 instance 已存在则跳过 CDN 加载
// 3. 注入本地 echarts 实例，使 ```echarts 代码块渲染不依赖 unpkg（内网可用）
// 4. katexConfig：关闭 throwOnError/strict，避免单个不支持的命令导致整块公式红屏/不渲染
config({
  markdownItConfig: (md) => {
    md.use(MarkExtension)
  },
  editorExtensions: {
    katex: {
      instance: katex,
    },
    echarts: {
      instance: echarts,
    },
  },
  katexConfig: (k) => ({
    ...k,
    throwOnError: false,
    strict: false,
    output: 'html',
    trust: true,
  }),
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
  // 页脚配置：默认 [字数(自定义,过滤base64), 日期时间, =, 同步滚动]
  // 数字索引引用 defFooters 中的自定义页脚组件：0=CharCount 1=DateTimeFooter
  // 布局：左侧字数统计 | 右侧 日期时间 + 同步滚动
  footers: {
    type: Array,
    default: () => [0, '=', 1, 'scrollSwitch'],
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
  // 是否开启自动保存（开启且正文非空时启动倒计时，到点触发 save 事件，由父组件执行实际保存并回调结果）
  autoSave: {
    type: Boolean,
    default: false,
  },
  // 自动保存间隔数值（配合 autoSaveIntervalUnit 解释），默认 30
  autoSaveInterval: {
    type: Number,
    default: 30,
  },
  // 自动保存间隔单位：seconds 秒 / minutes 分
  autoSaveIntervalUnit: {
    type: String,
    default: 'seconds',
    validator: (v) => ['seconds', 'minutes'].includes(v),
  },
  // 是否显示自定义目录面板（仅编辑模式生效，只读模式不渲染）
  catalog: {
    type: Boolean,
    default: false,
  },
  // 目录面板位置：left 编辑器左侧 / right 编辑器右侧
  catalogPosition: {
    type: String,
    default: 'right',
    validator: (v) => ['left', 'right'].includes(v),
  },
  // 目录最大展示层级（level <= catalogMaxDepth 才显示），不传/<=0 表示不限制
  catalogMaxDepth: {
    type: Number,
    default: undefined,
  },
  // 目录面板宽度（数字按 px 处理，字符串原样使用）
  catalogWidth: {
    type: [String, Number],
    default: 240,
  },
})

const emit = defineEmits(['update:modelValue', 'update:previewTheme', 'save'])

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
// 目录显隐切换按钮在 defToolbars 中的索引（第 5 个插槽子节点）
const CATALOG_TOGGLE_INDEX = 4

// 目录面板运行时显隐状态：初始跟随 catalog prop，之后由工具栏按钮切换
const catalogOpen = ref(props.catalog)
watch(
  () => props.catalog,
  (v) => {
    catalogOpen.value = v
  },
)

// 最终的工具栏列表：在用户/默认 toolbars 末尾追加 [0..N-1] 引用 defToolbars 中的扩展
// 移除默认的 "=" 分隔符，让所有按钮在同一组内流动排列，避免窄容器换行后留白
// md-editor-v3 的 toolbars 数组用数字索引引用 defToolbars 里的自定义 VNode
// 开启目录时注入目录切换按钮：目录在左 → 按钮最前；目录在右 → 按钮最后（视觉同侧）
const resolvedToolbars = computed(() => {
  const base = props.toolbars || allToolbar
  const filtered = base.filter((item) => item !== '=')
  const indices = Array.from({ length: EXTENSION_COUNT }, (_, i) => i)
  if (!props.catalog) return [...filtered, ...indices]
  return props.catalogPosition === 'left'
    ? [CATALOG_TOGGLE_INDEX, ...filtered, ...indices]
    : [...filtered, ...indices, CATALOG_TOGGLE_INDEX]
})

// 合并后的 props（供 MdEditor 使用），排除本组件自定义的 props
const mergedProps = computed(() => {
  const rest = { ...attrs }
  // 移除可能被 attrs 捕获的本组件自定义 prop
  delete rest.uploadType
  delete rest.customUpload
  delete rest.maxImageSize
  delete rest.autoSave
  delete rest.autoSaveInterval
  delete rest.autoSaveIntervalUnit
  delete rest.catalog
  delete rest.catalogPosition
  delete rest.catalogMaxDepth
  delete rest.catalogWidth
  return rest
})

// 是否渲染目录面板（catalog 开启 且 未被工具栏按钮隐藏；只读模式不支持目录：MdPreview 无独立滚动容器）
const showCatalog = computed(() => props.catalog && catalogOpen.value && !props.readOnly)

// 目录面板宽度标准化：数字 → px 字符串
const normalizedCatalogWidth = computed(() =>
  typeof props.catalogWidth === 'number' ? `${props.catalogWidth}px` : props.catalogWidth,
)

// 目录数据：由 MdEditor 的 onGetCatalog 事件维护（用户通过 attrs 传入的同名监听不受影响，二者都会触发）
const catalogHeadings = ref([])
const handleGetCatalog = (list) => {
  catalogHeadings.value = Array.isArray(list) ? list : []
}

// 开启自定义目录时，从工具栏排除内置 catalog 按钮（内置目录与本面板功能重叠，避免两个入口并存）
const resolvedToolbarsExclude = computed(() =>
  props.catalog && !props.toolbarsExclude.includes('catalog')
    ? [...props.toolbarsExclude, 'catalog']
    : props.toolbarsExclude,
)

// 过滤 base64 图片编码后的正文字数（供自定义页脚 CharCount 展示）
// 内置 markdownTotal 会把 base64 编码计入字数，这里用 countMarkdownChars 剔除
const charCount = computed(() => countMarkdownChars(props.modelValue))

// 自动保存激活条件：autoSave 开启 且 正文（过滤 base64 后）非空
// 内容清空时立即中断自动保存；内容恢复且开关仍开启时自动重启倒计时
const autoSaveEnabled = computed(() => props.autoSave && charCount.value > 0)

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

// ---------- 全屏模式下的目录面板 ----------
// md-editor-v3 的两种全屏（屏幕全屏 fullscreen / 浏览器全屏 pageFullscreen）
// 都会在编辑器根元素上加 md-editor-fullscreen class（fixed inset:0 / Fullscreen API）。
// 全屏时编辑器根元素脱离文档流（或成为 fullscreen element），作为兄弟节点的目录面板不可见，
// 因此检测该 class 后将面板 Teleport 进编辑器根元素内部显示。

/** 编辑器是否处于任一全屏模式 */
const isEditorFullscreen = ref(false)

/** MdEditor 根 DOM 元素（Teleport 目标；只读模式为 undefined） */
const editorRootEl = computed(() => mdEditorRef.value?.$el || undefined)

let fsObserver = null
const syncFullscreenState = () => {
  const el = mdEditorRef.value?.$el
  isEditorFullscreen.value = !!el?.classList?.contains('md-editor-fullscreen')
}

onMounted(() => {
  // MutationObserver 监听根元素 class 变化，同时覆盖两种全屏模式
  if (typeof MutationObserver !== 'undefined' && editorRootEl.value) {
    fsObserver = new MutationObserver(syncFullscreenState)
    fsObserver.observe(editorRootEl.value, { attributes: true, attributeFilter: ['class'] })
  }
  syncFullscreenState()
})

onBeforeUnmount(() => {
  fsObserver?.disconnect()
  fsObserver = null
})

/** 全屏且目录展开时附加到编辑器根的 class（padding 让位 + 面板定位上下文） */
const fsCatalogClass = computed(() =>
  isEditorFullscreen.value && showCatalog.value
    ? `md-editor--fs-catalog md-editor--fs-catalog-${props.catalogPosition}`
    : null,
)

/** 全屏时把 --catalog-width 挂到编辑器根（Teleport 后面板不在 .base-md-editor 容器内，CSS 变量不可达） */
const fsEditorStyle = computed(() =>
  isEditorFullscreen.value && showCatalog.value
    ? { '--catalog-width': normalizedCatalogWidth.value }
    : undefined,
)
</script>

<template>
  <div
    class="base-md-editor"
    :class="{
      'base-md-editor--with-catalog': showCatalog,
      'base-md-editor--catalog-left': showCatalog && catalogPosition === 'left',
    }"
    :style="showCatalog ? { '--catalog-width': normalizedCatalogWidth } : undefined"
  >
    <!-- 只读模式：纯预览，无工具栏无边框（不支持目录面板） -->
    <MdPreview
      v-if="readOnly"
      :model-value="modelValue"
      :theme="theme"
      :preview-theme="previewThemeRef"
      :code-theme="codeTheme"
      :language="language"
    />
    <!-- 编辑模式：目录面板 + 编辑器（面板位置由 catalogPosition 决定渲染顺序） -->
    <!-- 面板用 Teleport 包裹：全屏时移入编辑器根元素内部（fixed/Fullscreen API 下兄弟节点不可见），
         非全屏时 disabled 就地渲染 -->
    <template v-else>
      <Teleport :to="editorRootEl" :disabled="!isEditorFullscreen">
        <Catalog
          v-if="showCatalog && catalogPosition === 'left'"
          :headings="catalogHeadings"
          :max-depth="catalogMaxDepth"
          :editor-ref="mdEditorRef"
          :theme="theme"
          :style="{ width: normalizedCatalogWidth }"
        />
      </Teleport>
      <MdEditor
        ref="mdEditorRef"
        v-bind="mergedProps"
        :model-value="modelValue"
        :placeholder="placeholder"
        :theme="theme"
        :preview-theme="previewThemeRef"
        :code-theme="codeTheme"
        :language="language"
        :toolbars="resolvedToolbars"
        :toolbars-exclude="resolvedToolbarsExclude"
        :footers="footers"
        :height="height"
        :disabled="disabled"
        :on-upload-img="handleUploadImg"
        :class="fsCatalogClass"
        :style="fsEditorStyle"
        @update:model-value="handleChange"
        @on-get-catalog="handleGetCatalog"
      >
        <template #defToolbars>
          <Mark />
          <Emoji />
          <PreviewThemeSwitch v-model="previewThemeRef" />
          <Time />
          <CatalogToggle
            :active="catalogOpen"
            :position="catalogPosition"
            @toggle="catalogOpen = !catalogOpen"
          />
        </template>
        <template #defFooters>
          <CharCount :count="charCount">
            <AutoSave
              :enabled="autoSaveEnabled"
              :interval="autoSaveInterval"
              :interval-unit="autoSaveIntervalUnit"
              @save="(done) => emit('save', done)"
            />
          </CharCount>
          <DateTimeFooter />
        </template>
      </MdEditor>
      <Teleport :to="editorRootEl" :disabled="!isEditorFullscreen">
        <Catalog
          v-if="showCatalog && catalogPosition === 'right'"
          :headings="catalogHeadings"
          :max-depth="catalogMaxDepth"
          :editor-ref="mdEditorRef"
          :theme="theme"
          :style="{ width: normalizedCatalogWidth }"
        />
      </Teleport>
    </template>
  </div>
</template>

<style scoped lang="scss">
// 开启目录时：编辑器保持在文档流（决定容器宽高），目录面板绝对定位贴边。
// 这样面板高度严格等于编辑器高度（top/bottom 贴齐容器），
// 目录项再多也不会撑高容器 —— 面板内部「头部固定 + 正文独立滚动」。
// 注意：为面板留白必须加在容器 padding 上，不能给 .md-editor 加 margin ——
// 其根元素 width:100% 是相对内容盒计算的，加 margin 会导致编辑器整体溢出容器、预览区被面板遮挡。
.base-md-editor--with-catalog {
  position: relative;
  padding-right: calc(var(--catalog-width, 240px) + 8px); // 为右侧目录留出空间

  .base-md-catalog {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0; // 绝对定位包含块是容器 padding 盒，right:0 贴到 padding 区外缘
  }
}

// 目录在左侧：容器改为左侧留白，面板贴左边
.base-md-editor--catalog-left {
  padding-right: 0;
  padding-left: calc(var(--catalog-width, 240px) + 8px);

  .base-md-catalog {
    right: auto;
    left: 0;
  }
}

// 全屏模式（屏幕全屏/浏览器全屏）：目录面板 Teleport 进编辑器根元素内部。
// 编辑器根是 border-box 且 fixed 贴满视口，用 padding 为面板让位 ——
// 内容盒收缩后工具栏与内容区不被遮挡，目录切换按钮在全屏下仍可点击。
// .md-editor--fs-catalog 与 .base-md-catalog 都带本组件 data-v 属性，scoped 选择器可直接命中。
.md-editor--fs-catalog {
  .base-md-catalog {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 10; // 盖过编辑器内容区（编辑/预览分栏无高 z-index，10 足够）
  }
}

.md-editor--fs-catalog-right {
  padding-right: calc(var(--catalog-width, 240px) + 8px);

  .base-md-catalog {
    right: 0;
  }
}

.md-editor--fs-catalog-left {
  padding-left: calc(var(--catalog-width, 240px) + 8px);

  .base-md-catalog {
    left: 0;
  }
}

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
