// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'

// ============ mock element-plus：仅替换 ElMessage 方法，其余保留真实实现 ============
const { ElMessageFns } = vi.hoisted(() => ({
  ElMessageFns: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessage: {
      ...actual.ElMessage,
      ...ElMessageFns,
    },
  }
})

// ============ mock md-editor-v3：用桩组件替代真实编辑器 ============
// stub 组件引用需在测试中用于 findComponent，先在 vi.hoisted 占位，工厂内填充
const { stubHolder } = vi.hoisted(() => ({ stubHolder: { value: null } }))

vi.mock('md-editor-v3', async () => {
  const { defineComponent, h } = await import('vue')
  const MdEditorStub = defineComponent({
    name: 'MdEditorStub',
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: '' },
      onUploadImg: { type: Function, default: null },
      placeholder: { type: String, default: '' },
      theme: { type: String, default: '' },
      preview: { type: Boolean, default: true },
      previewTheme: { type: String, default: '' },
      codeTheme: { type: String, default: '' },
      language: { type: String, default: '' },
      toolbars: { type: Array, default: undefined },
      toolbarsExclude: { type: Array, default: () => [] },
      footers: { type: Array, default: () => [] },
      defFooters: { type: Object, default: undefined },
      height: { type: [String, Number], default: undefined },
      disabled: { type: Boolean, default: false },
    },
    emits: ['update:modelValue', 'onGetCatalog'],
    setup(props, { slots, attrs }) {
      // 真实组件会把 class/style 透传到根元素（如全屏目录的让位 class），
      // 桩组件 inheritAttrs:false，需手动应用 attrs.class/style 保持行为一致
      return () =>
        h('div', { class: ['md-editor-stub', attrs.class], style: attrs.style }, [
          props.modelValue,
          slots.defToolbars?.(),
          slots.defFooters?.(),
          // 模拟预览滚动容器与标题锚点（[data-line]），供目录组件解析滚动目标
          h('div', { class: 'md-editor-preview-wrapper' }, [
            h('h1', { 'data-line': 0 }),
            h('h2', { 'data-line': 2 }),
            h('h3', { 'data-line': 3 }),
            h('h1', { 'data-line': 5 }),
          ]),
        ])
    },
  })
  stubHolder.value = MdEditorStub
  // MdPreview 桩组件（只读模式）
  const MdPreviewStub = defineComponent({
    name: 'MdPreviewStub',
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: '' },
      theme: { type: String, default: '' },
      previewTheme: { type: String, default: '' },
      codeTheme: { type: String, default: '' },
      language: { type: String, default: '' },
    },
    setup(props) {
      return () => h('div', { class: 'md-preview-stub' }, props.modelValue)
    },
  })
  // config 是全局配置函数，桩为 no-op；allToolbar 是默认工具栏数组
  return { MdEditor: MdEditorStub, MdPreview: MdPreviewStub, config: () => {}, allToolbar: ['bold', 'italic', 'underline', 'strikeThrough', '-', 'title', 'sub', 'sup', 'quote', 'unorderedList', 'orderedList', 'task', 'codeRow', 'code', 'link', 'image', 'table', 'mermaid', 'katex', '-', 'revoke', 'next', '=', 'pageFullscreen', 'fullscreen', 'preview', 'previewOnly', 'htmlPreview', 'catalog', 'github'] }
})

// ============ mock @vavt/v3-extension 的扩展组件 ============
vi.mock('@vavt/v3-extension', async () => {
  const { defineComponent, h } = await import('vue')
  const makeStub = (name) =>
    defineComponent({
      name,
      props: { modelValue: { type: String, default: '' }, insert: { type: Function, default: null } },
      emits: ['update:modelValue'],
      setup() {
        return () => h('span', { class: `ext-${name}` })
      },
    })
  return {
    Mark: makeStub('Mark'),
    Emoji: makeStub('Emoji'),
    PreviewThemeSwitch: makeStub('PreviewThemeSwitch'),
  }
})

// ============ mock markdown-it-mark ============
vi.mock('markdown-it-mark', () => ({
  default: () => ({}),
}))

import MdEditor from '../../src/components/mdEditor/index.vue'
import CharCount from '../../src/components/mdEditor/extensions/CharCount.vue'

const mountEditor = (props = {}) =>
  mount(MdEditor, {
    props: { modelValue: '', ...props },
  })

const stub = (wrapper) => wrapper.findComponent(stubHolder.value)

const makeFile = (name, type, bytes = [1, 2, 3]) =>
  new File([new Uint8Array(bytes)], name, { type })

describe('MdEditor 封装组件 —— v-model 与默认 props', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('modelValue 透传给底层 MdEditor', () => {
    const wrapper = mountEditor({ modelValue: '# Hello' })
    expect(stub(wrapper).props('modelValue')).toBe('# Hello')
  })

  it('底层 update:modelValue 向上冒泡为 update:modelValue', () => {
    const wrapper = mountEditor({ modelValue: '' })
    stub(wrapper).vm.$emit('update:modelValue', '新内容')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['新内容'])
  })

  it('默认 props：中文语言、atom 代码主题、default 预览主题', () => {
    const wrapper = mountEditor()
    const p = stub(wrapper).props()
    expect(p.language).toBe('zh-CN')
    expect(p.codeTheme).toBe('atom')
    expect(p.previewTheme).toBe('default')
    expect(p.theme).toBe('light')
    expect(p.placeholder).toBe('请输入 Markdown 内容...')
  })

  it('默认排除 github 工具栏图标（toolbarsExclude=["github"]）', () => {
    const wrapper = mountEditor()
    expect(stub(wrapper).props('toolbarsExclude')).toEqual(['github'])
  })

  it('可通过 toolbarsExclude 覆盖默认排除项', () => {
    const wrapper = mountEditor({ toolbarsExclude: ['github', 'save'] })
    expect(stub(wrapper).props('toolbarsExclude')).toEqual(['github', 'save'])
  })

  it('自定义 props 覆盖默认值', () => {
    const wrapper = mountEditor({
      placeholder: '写点什么...',
      theme: 'dark',
      previewTheme: 'github',
      codeTheme: 'github',
      language: 'en-US',
      height: 400,
      disabled: true,
    })
    const p = stub(wrapper).props()
    expect(p.placeholder).toBe('写点什么...')
    expect(p.theme).toBe('dark')
    expect(p.previewTheme).toBe('github')
    expect(p.codeTheme).toBe('github')
    expect(p.language).toBe('en-US')
    expect(p.height).toBe(400)
    expect(p.disabled).toBe(true)
  })

  it('onUploadImg 处理器被注入到底层组件', () => {
    const wrapper = mountEditor()
    expect(typeof stub(wrapper).props('onUploadImg')).toBe('function')
  })

  it('defineExpose 暴露 editorRef 指向底层 MdEditor 实例', () => {
    const wrapper = mountEditor()
    expect(wrapper.vm.editorRef).toBe(stub(wrapper).vm)
  })
})

describe('MdEditor —— base64 图片上传模式（默认）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('单张图片转为 base64 data URL 并回调', async () => {
    const wrapper = mountEditor({ uploadType: 'base64' })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const file = makeFile('shot.png', 'image/png', [0x89, 0x50, 0x4e, 0x47])
    const callback = vi.fn()

    await onUploadImg([file], callback)
    await flushPromises()

    expect(callback).toHaveBeenCalledTimes(1)
    const urls = callback.mock.calls[0][0]
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('data:image/png;base64,iVBORw==')
  })

  it('多张图片批量转换，顺序与输入一致', async () => {
    const wrapper = mountEditor()
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const files = [
      makeFile('a.png', 'image/png', [1]),
      makeFile('b.png', 'image/png', [2, 3]),
    ]
    const callback = vi.fn()

    await onUploadImg(files, callback)
    await flushPromises()

    const urls = callback.mock.calls[0][0]
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe('data:image/png;base64,AQ==')
    expect(urls[1]).toBe('data:image/png;base64,AgM=')
  })

  it('非图片文件被跳过，仅回调空数组并提示', async () => {
    const wrapper = mountEditor()
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const file = makeFile('note.txt', 'text/plain', [65])
    const callback = vi.fn()

    await onUploadImg([file], callback)
    await flushPromises()

    expect(callback).toHaveBeenCalledWith([])
    expect(ElMessage.warning).toHaveBeenCalledWith(
      expect.stringContaining('note.txt'),
    )
  })

  it('超过 maxImageSize 的图片被跳过并提示', async () => {
    const wrapper = mountEditor({ maxImageSize: 0.000001 })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const file = makeFile('big.png', 'image/png', new Array(1024).fill(1))
    const callback = vi.fn()

    await onUploadImg([file], callback)
    await flushPromises()

    expect(callback).toHaveBeenCalledWith([])
    expect(ElMessage.warning).toHaveBeenCalledWith(
      expect.stringContaining('big.png'),
    )
  })

  it('混合输入：有效图片正常转换，无效/超量被过滤', async () => {
    const wrapper = mountEditor({ maxImageSize: 0.001 })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const good = makeFile('ok.png', 'image/png', [1])
    const bad = makeFile('doc.txt', 'text/plain', [65])
    const tooBig = makeFile('big.png', 'image/png', new Array(5000).fill(1))
    const callback = vi.fn()

    await onUploadImg([good, bad, tooBig], callback)
    await flushPromises()

    const urls = callback.mock.calls[0][0]
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('data:image/png;base64,AQ==')
  })
})

describe('MdEditor —— custom 自定义上传模式', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 customUpload 并把返回的 URL 回调给底层', async () => {
    const customUpload = vi.fn().mockResolvedValue(['https://cdn/a.png'])
    const wrapper = mountEditor({
      uploadType: 'custom',
      customUpload,
    })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const file = makeFile('a.png', 'image/png', [1])
    const callback = vi.fn()

    await onUploadImg([file], callback)
    await flushPromises()

    expect(customUpload).toHaveBeenCalledTimes(1)
    expect(customUpload.mock.calls[0][0]).toEqual([file])
    expect(callback).toHaveBeenCalledWith(['https://cdn/a.png'])
  })

  it('customUpload 返回 {url,alt,title} 对象数组也透传', async () => {
    const customUpload = vi.fn().mockResolvedValue([
      { url: 'https://cdn/b.png', alt: '图', title: 'b' },
    ])
    const wrapper = mountEditor({
      uploadType: 'custom',
      customUpload,
    })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const callback = vi.fn()

    await onUploadImg([makeFile('b.png', 'image/png')], callback)
    await flushPromises()

    expect(callback.mock.calls[0][0]).toEqual([
      { url: 'https://cdn/b.png', alt: '图', title: 'b' },
    ])
  })

  it('customUpload 抛错时回调空数组并提示错误', async () => {
    const customUpload = vi.fn().mockRejectedValue(new Error('网络异常'))
    const wrapper = mountEditor({
      uploadType: 'custom',
      customUpload,
    })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const callback = vi.fn()

    await onUploadImg([makeFile('a.png', 'image/png')], callback)
    await flushPromises()

    expect(callback).toHaveBeenCalledWith([])
    expect(ElMessage.error).toHaveBeenCalledWith('图片处理失败，请重试')
  })

  it('custom 模式下未提供 customUpload 时回退到 base64', async () => {
    const wrapper = mountEditor({ uploadType: 'custom', customUpload: null })
    const onUploadImg = stub(wrapper).props('onUploadImg')
    const callback = vi.fn()

    await onUploadImg([makeFile('a.png', 'image/png', [1])], callback)
    await flushPromises()

    const urls = callback.mock.calls[0][0]
    expect(urls[0]).toBe('data:image/png;base64,AQ==')
  })
})

describe('MdEditor —— 透传原生 attrs（事件 / 额外 props）', () => {
  it('原生事件通过 $attrs 透传到底层 MdEditor', () => {
    const onChange = vi.fn()
    const wrapper = mount(MdEditor, {
      props: { modelValue: '' },
      attrs: { onChange },
    })
    // 未在本组件声明的事件（如 md-editor-v3 原生事件）通过 $attrs 透传到底层桩组件
    // 注：save 事件已由本组件声明（用于自动保存），不会进入 $attrs，故此处以 onChange 为例
    expect(stub(wrapper).vm.$attrs.onChange).toBe(onChange)
  })

  it('本组件自定义 prop（uploadType/customUpload/maxImageSize 等）不会透传给底层', () => {
    const wrapper = mountEditor({
      uploadType: 'custom',
      customUpload: vi.fn(),
      maxImageSize: 5,
      autoSave: true,
      autoSaveInterval: 15,
      autoSaveIntervalUnit: 'minutes',
    })
    const p = stub(wrapper).props()
    expect(p.uploadType).toBeUndefined()
    expect(p.customUpload).toBeUndefined()
    expect(p.maxImageSize).toBeUndefined()
    expect(p.autoSave).toBeUndefined()
    expect(p.autoSaveInterval).toBeUndefined()
    expect(p.autoSaveIntervalUnit).toBeUndefined()
  })
})

describe('MdEditor —— 自定义字数统计页脚（过滤 base64）', () => {
  it('默认 footers 使用自定义页脚索引 [0, =, 1, scrollSwitch]（0=CharCount, 1=DateTimeFooter）', () => {
    const wrapper = mountEditor()
    expect(stub(wrapper).props('footers')).toEqual([0, '=', 1, 'scrollSwitch'])
  })

  it('无图片内容时 CharCount 收到的 count 等于文本长度', () => {
    const wrapper = mountEditor({ modelValue: '# 标题\n\n正文' })
    const charCount = wrapper.findComponent(CharCount)
    expect(charCount.exists()).toBe(true)
    expect(charCount.props('count')).toBe('# 标题\n\n正文'.length)
  })

  it('含 base64 图片时 CharCount 收到的 count 已剔除 base64 编码', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const md = `开头文字\n![图](data:image/png;base64,${b64})\n结尾`
    const wrapper = mountEditor({ modelValue: md })
    const charCount = wrapper.findComponent(CharCount)
    expect(charCount.exists()).toBe(true)
    // 过滤后应远小于原始长度（base64 载荷约 100+ 字符被剔除）
    expect(charCount.props('count')).toBeLessThan(md.length - b64.length + 10)
    // 且不包含原始长度（确认不是简单透传 modelValue.length）
    expect(charCount.props('count')).not.toBe(md.length)
  })

  it('编辑内容变化时 CharCount 的 count 响应式更新', async () => {
    const wrapper = mountEditor({ modelValue: 'abc' })
    expect(wrapper.findComponent(CharCount).props('count')).toBe(3)
    await wrapper.setProps({ modelValue: 'abcd' })
    expect(wrapper.findComponent(CharCount).props('count')).toBe(4)
  })

  it('用户可通过 footers prop 覆盖默认页脚配置', () => {
    const wrapper = mountEditor({ footers: [0, 'scrollSwitch'] })
    expect(stub(wrapper).props('footers')).toEqual([0, 'scrollSwitch'])
  })
})

describe('MdEditor —— 自定义目录面板', () => {
  // 标题锚点行号与桩组件预览容器中的 [data-line] 对应
  const headings = [
    { text: '一', level: 1, line: 0 },
    { text: '一点一', level: 2, line: 2 },
    { text: '一点一深', level: 3, line: 3 },
    { text: '二', level: 1, line: 5 },
  ]

  /** 触发底层 onGetCatalog 事件并等待响应式链路完成 */
  const emitCatalog = async (wrapper, list = headings) => {
    stub(wrapper).vm.$emit('onGetCatalog', list)
    await flushPromises()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认不渲染目录面板', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('.base-md-catalog').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('base-md-editor--with-catalog')
  })

  it('catalog=true 渲染目录面板，默认位于编辑器右侧（DOM 顺序在编辑器之后）', async () => {
    const wrapper = mountEditor({ catalog: true })
    await emitCatalog(wrapper)
    expect(wrapper.classes()).toContain('base-md-editor--with-catalog')
    const children = wrapper.element.children
    expect(children[0].classList.contains('md-editor-stub')).toBe(true)
    expect(children[1].classList.contains('base-md-catalog')).toBe(true)
  })

  it('catalogPosition=left 时目录面板渲染在编辑器之前', async () => {
    const wrapper = mountEditor({ catalog: true, catalogPosition: 'left' })
    await emitCatalog(wrapper)
    expect(wrapper.classes()).toContain('base-md-editor--catalog-left')
    const children = wrapper.element.children
    expect(children[0].classList.contains('base-md-catalog')).toBe(true)
    expect(children[1].classList.contains('md-editor-stub')).toBe(true)
  })

  it('onGetCatalog 事件驱动目录项渲染，层级越深缩进越大', async () => {
    const wrapper = mountEditor({ catalog: true })
    await emitCatalog(wrapper)
    const items = wrapper.findAll('.base-md-catalog__item')
    expect(items).toHaveLength(4)
    expect(items.map((i) => i.find('.base-md-catalog__text').text())).toEqual([
      '一',
      '一点一',
      '一点一深',
      '二',
    ])
    // 缩进规则：8 + depth * 14 px
    expect(items[0].attributes('style')).toContain('padding-left: 8px')
    expect(items[1].attributes('style')).toContain('padding-left: 22px')
    expect(items[2].attributes('style')).toContain('padding-left: 36px')
    expect(items[3].attributes('style')).toContain('padding-left: 8px')
  })

  it('catalogMaxDepth 限制展示层级，超出层级的标题不渲染', async () => {
    const wrapper = mountEditor({ catalog: true, catalogMaxDepth: 2 })
    await emitCatalog(wrapper)
    const texts = wrapper.findAll('.base-md-catalog__text').map((i) => i.text())
    expect(texts).toEqual(['一', '一点一', '二'])
  })

  it('点击目录项将其置为激活态', async () => {
    const wrapper = mountEditor({ catalog: true })
    await emitCatalog(wrapper)
    await wrapper.findAll('.base-md-catalog__item')[0].trigger('click')
    expect(wrapper.findAll('.base-md-catalog__item')[0].classes()).toContain(
      'base-md-catalog__item--active',
    )
    await wrapper.findAll('.base-md-catalog__item')[3].trigger('click')
    const items = wrapper.findAll('.base-md-catalog__item')
    expect(items[3].classes()).toContain('base-md-catalog__item--active')
    expect(items[0].classes()).not.toContain('base-md-catalog__item--active')
  })

  // 点击锁定：点击目录项后抑制 scroll-spy，直到滚动到达目标或用户手动滚动。
  // 修复文档末尾标题滚不到判定线时，高亮被 spy 抢回（点一次不亮、点两次才亮）的问题。
  // jsdom 中标题 offsetTop 均为 0 → 点击锁定目标 top=0；
  // 手动把预览容器 scrollTop 拨到 500 模拟「未到达目标」。
  // 注意：组件在 document 上捕获监听 wheel/scroll，分离 DOM 树中元素事件不经过 document，
  // 因此这些用例挂载到 document.body（事件在预览元素上真实派发），结束后卸载避免跨用例监听干扰。
  const flushScrollSpy = () => new Promise((r) => setTimeout(r, 50))
  const mountAttachedEditor = (props = {}) =>
    mount(MdEditor, { props: { modelValue: '', ...props }, attachTo: document.body })

  it('点击后未滚动到目标位置时，scroll-spy 不抢回点击高亮', async () => {
    const wrapper = mountAttachedEditor({ catalog: true })
    await emitCatalog(wrapper)
    await wrapper.findAll('.base-md-catalog__item')[0].trigger('click')
    expect(wrapper.findAll('.base-md-catalog__item')[0].classes()).toContain(
      'base-md-catalog__item--active',
    )

    // 未到达目标（scrollTop=500 ≠ 锁定目标 0）时触发滚动事件
    const previewEl = stub(wrapper).element.querySelector('.md-editor-preview-wrapper')
    previewEl.scrollTop = 500
    previewEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    await flushScrollSpy()

    // 高亮仍停留在点击项：spy 被锁定抑制（若无锁定，所有 top=0 ≤ 判定线，会激活最后一项）
    expect(wrapper.findAll('.base-md-catalog__item')[0].classes()).toContain(
      'base-md-catalog__item--active',
    )
    wrapper.unmount()
  })

  it('用户在编辑器区域手动滚动（wheel）后，解除锁定恢复 scroll-spy', async () => {
    const wrapper = mountAttachedEditor({ catalog: true })
    await emitCatalog(wrapper)
    await wrapper.findAll('.base-md-catalog__item')[0].trigger('click')

    const previewEl = stub(wrapper).element.querySelector('.md-editor-preview-wrapper')
    previewEl.scrollTop = 500
    // 用户在预览区滚轮滚动 → 解除锁定
    previewEl.dispatchEvent(new Event('wheel', { bubbles: true }))
    previewEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    await flushScrollSpy()

    // spy 接管：jsdom 中所有标题 top=0、均 ≤ 判定线 → 激活最后一项
    const items = wrapper.findAll('.base-md-catalog__item')
    expect(items[3].classes()).toContain('base-md-catalog__item--active')
    expect(items[0].classes()).not.toContain('base-md-catalog__item--active')
    wrapper.unmount()
  })

  it('目录面板自身的滚轮事件不解除点击锁定', async () => {
    const wrapper = mountAttachedEditor({ catalog: true })
    await emitCatalog(wrapper)
    await wrapper.findAll('.base-md-catalog__item')[0].trigger('click')

    const previewEl = stub(wrapper).element.querySelector('.md-editor-preview-wrapper')
    previewEl.scrollTop = 500
    // 滚轮发生在目录面板（编辑器区域外）→ 锁定保持
    wrapper.find('.base-md-catalog').element.dispatchEvent(new Event('wheel', { bubbles: true }))
    previewEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    await flushScrollSpy()

    expect(wrapper.findAll('.base-md-catalog__item')[0].classes()).toContain(
      'base-md-catalog__item--active',
    )
    wrapper.unmount()
  })

  it('点击后滚动到达目标位置，解除锁定恢复 scroll-spy', async () => {
    const wrapper = mountAttachedEditor({ catalog: true })
    await emitCatalog(wrapper)
    await wrapper.findAll('.base-md-catalog__item')[0].trigger('click')

    // scrollTop 保持 0 = 锁定目标 → 触发滚动事件即解除锁定并 spy
    const previewEl = stub(wrapper).element.querySelector('.md-editor-preview-wrapper')
    previewEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    await flushScrollSpy()

    // spy 接管（jsdom 中所有标题 top=0 → 激活最后一项），证明锁定已解除
    const items = wrapper.findAll('.base-md-catalog__item')
    expect(items[3].classes()).toContain('base-md-catalog__item--active')
    expect(items[0].classes()).not.toContain('base-md-catalog__item--active')
    wrapper.unmount()
  })

  it('目录面板自身的滚动不触发 spy，也不回拉滚动位置（可滚到底部）', async () => {
    const wrapper = mountAttachedEditor({ catalog: true })
    await emitCatalog(wrapper)
    await wrapper.findAll('.base-md-catalog__item')[0].trigger('click')
    await flushPromises() // 等待点击触发的激活项可见性滚动完成，避免计入后续 spy

    const body = wrapper.find('.base-md-catalog__body').element
    // 监听激活项回拉调用（ensureActiveVisible 内部使用 body.scrollTo）
    const scrollToSpy = vi.fn()
    body.scrollTo = scrollToSpy
    // 模拟用户把目录滚动到底部（激活项在顶部，已滚出可视区）
    body.scrollTop = 500
    body.dispatchEvent(new Event('scroll', { bubbles: true }))
    await flushScrollSpy()

    // 目录滚动被 spy 跳过：不发生回拉，滚动位置保持
    expect(scrollToSpy).not.toHaveBeenCalled()
    expect(body.scrollTop).toBe(500)
    // 激活态不受影响
    expect(wrapper.findAll('.base-md-catalog__item')[0].classes()).toContain(
      'base-md-catalog__item--active',
    )
    wrapper.unmount()
  })

  it('折叠箭头切换子级显隐', async () => {
    const wrapper = mountEditor({ catalog: true })
    await emitCatalog(wrapper)
    // 初始全部展开：4 项
    expect(wrapper.findAll('.base-md-catalog__item')).toHaveLength(4)
    // 折叠「一」：其两个子级隐藏，仅剩「一」「二」
    await wrapper.find('.base-md-catalog__item .base-md-catalog__arrow').trigger('click')
    expect(wrapper.findAll('.base-md-catalog__item')).toHaveLength(2)
    // 再次点击恢复展开
    await wrapper.find('.base-md-catalog__item .base-md-catalog__arrow').trigger('click')
    expect(wrapper.findAll('.base-md-catalog__item')).toHaveLength(4)
  })

  it('无标题内容时显示空态提示', async () => {
    const wrapper = mountEditor({ catalog: true })
    await emitCatalog(wrapper, [])
    expect(wrapper.find('.base-md-catalog__empty').exists()).toBe(true)
    expect(wrapper.find('.base-md-catalog__empty').text()).toBe('暂无目录')
  })

  it('只读模式不渲染目录面板（MdPreview 无独立滚动容器）', () => {
    const wrapper = mountEditor({ catalog: true, readOnly: true })
    expect(wrapper.find('.base-md-catalog').exists()).toBe(false)
    expect(wrapper.find('.md-preview-stub').exists()).toBe(true)
  })

  it('开启目录时工具栏自动排除内置 catalog 按钮', () => {
    const wrapper = mountEditor({ catalog: true })
    expect(stub(wrapper).props('toolbarsExclude')).toEqual(['github', 'catalog'])
  })

  it('toolbarsExclude 已含 catalog 时不重复追加', () => {
    const wrapper = mountEditor({ catalog: true, toolbarsExclude: ['catalog'] })
    expect(stub(wrapper).props('toolbarsExclude')).toEqual(['catalog'])
  })

  it('未开启目录时 toolbarsExclude 保持原样', () => {
    const wrapper = mountEditor()
    expect(stub(wrapper).props('toolbarsExclude')).toEqual(['github'])
  })

  it('catalog 系列自定义 props 不透传给底层 MdEditor', () => {
    const wrapper = mountEditor({
      catalog: true,
      catalogPosition: 'left',
      catalogMaxDepth: 3,
      catalogWidth: 200,
    })
    const p = stub(wrapper).props()
    expect(p.catalog).toBeUndefined()
    expect(p.catalogPosition).toBeUndefined()
    expect(p.catalogMaxDepth).toBeUndefined()
    expect(p.catalogWidth).toBeUndefined()
  })

  it('catalogWidth 数字宽度转为 px 应用到目录面板，并以 CSS 变量供容器留白计算', () => {
    const wrapper = mountEditor({ catalog: true, catalogWidth: 300 })
    expect(wrapper.find('.base-md-catalog').attributes('style')).toContain('width: 300px')
    // 容器携带 --catalog-width 变量，编辑器 margin 据此为面板留出空间
    expect(wrapper.attributes('style')).toContain('--catalog-width: 300px')
  })

  it('目录面板绝对定位贴齐容器上下边缘（高度不超过编辑器）', async () => {
    const wrapper = mountEditor({ catalog: true })
    await emitCatalog(wrapper)
    // 面板高度由 CSS 绝对定位 top:0/bottom:0 约束，容器高度仅由编辑器决定；
    // 此处断言结构前提：面板是 MdEditor 根元素的兄弟节点且容器 relative 定位类存在
    expect(wrapper.classes()).toContain('base-md-editor--with-catalog')
    const catalogEl = wrapper.find('.base-md-catalog').element
    expect(catalogEl.parentElement).toBe(wrapper.element)
  })

  it('用户通过 attrs 传入的 onGetCatalog 监听与内部目录数据处理并存', async () => {
    const onGetCatalog = vi.fn()
    // 注意：用户模板写 @onGetCatalog="fn" 时，Vue 编译后的 vnode prop 是 onOnGetCatalog
    // （emit 事件名 onGetCatalog → 监听器 key 再加 on 前缀），此处 attrs 模拟编译产物
    const wrapper = mount(MdEditor, {
      props: { modelValue: '', catalog: true },
      attrs: { onOnGetCatalog: onGetCatalog },
    })
    stub(wrapper).vm.$emit('onGetCatalog', headings)
    await flushPromises()
    expect(onGetCatalog).toHaveBeenCalledWith(headings)
    expect(wrapper.findAll('.base-md-catalog__item')).toHaveLength(4)
  })
})

describe('MdEditor —— 工具栏目录切换按钮', () => {
  // 目录切换按钮在 defToolbars 插槽中的索引（第 5 个子节点）
  const TOGGLE_INDEX = 4

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('目录在右侧（默认）时，切换按钮位于工具栏最后一位', () => {
    const wrapper = mountEditor({ catalog: true })
    const toolbars = stub(wrapper).props('toolbars')
    expect(toolbars[toolbars.length - 1]).toBe(TOGGLE_INDEX)
  })

  it('目录在左侧时，切换按钮位于工具栏第一位', () => {
    const wrapper = mountEditor({ catalog: true, catalogPosition: 'left' })
    const toolbars = stub(wrapper).props('toolbars')
    expect(toolbars[0]).toBe(TOGGLE_INDEX)
  })

  it('未开启目录时，工具栏不注入切换按钮', () => {
    const wrapper = mountEditor()
    expect(stub(wrapper).props('toolbars')).not.toContain(TOGGLE_INDEX)
  })

  it('用户自定义 toolbars 时，切换按钮仍按目录位置注入到首/末位', () => {
    const right = mountEditor({ catalog: true, toolbars: ['bold', 'italic'] })
    const rightToolbars = stub(right).props('toolbars')
    expect(rightToolbars).toEqual(['bold', 'italic', 0, 1, 2, 3, TOGGLE_INDEX])

    const left = mountEditor({ catalog: true, catalogPosition: 'left', toolbars: ['bold', 'italic'] })
    const leftToolbars = stub(left).props('toolbars')
    expect(leftToolbars).toEqual([TOGGLE_INDEX, 'bold', 'italic', 0, 1, 2, 3])
  })

  it('catalogPosition 动态切换时，按钮位置跟随变化', async () => {
    const wrapper = mountEditor({ catalog: true })
    expect(stub(wrapper).props('toolbars').at(-1)).toBe(TOGGLE_INDEX)
    await wrapper.setProps({ catalogPosition: 'left' })
    expect(stub(wrapper).props('toolbars')[0]).toBe(TOGGLE_INDEX)
    expect(stub(wrapper).props('toolbars').at(-1)).not.toBe(TOGGLE_INDEX)
  })

  it('点击切换按钮隐藏/显示目录面板，按钮激活态同步', async () => {
    const wrapper = mountEditor({ catalog: true })
    const btn = () => wrapper.find('.md-editor-catalog-toggle-btn')
    expect(btn().exists()).toBe(true)
    // 初始：面板显示，按钮激活
    expect(wrapper.find('.base-md-catalog').exists()).toBe(true)
    expect(btn().classes()).toContain('md-editor-catalog-toggle-btn--active')

    // 点击隐藏
    await btn().trigger('click')
    expect(wrapper.find('.base-md-catalog').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('base-md-editor--with-catalog')
    expect(btn().classes()).not.toContain('md-editor-catalog-toggle-btn--active')

    // 再次点击恢复显示
    await btn().trigger('click')
    expect(wrapper.find('.base-md-catalog').exists()).toBe(true)
    expect(btn().classes()).toContain('md-editor-catalog-toggle-btn--active')
  })

  it('catalog prop 动态变更时重置面板显隐状态', async () => {
    const wrapper = mountEditor({ catalog: true })
    // 先通过按钮隐藏面板
    await wrapper.find('.md-editor-catalog-toggle-btn').trigger('click')
    expect(wrapper.find('.base-md-catalog').exists()).toBe(false)
    // 关闭再开启 catalog prop：面板应恢复显示（状态重新跟随 prop）
    await wrapper.setProps({ catalog: false })
    await wrapper.setProps({ catalog: true })
    expect(wrapper.find('.base-md-catalog').exists()).toBe(true)
  })

  it('未开启目录时工具栏不渲染切换按钮 DOM', () => {
    // 按钮 VNode 在插槽中但未被 toolbars 引用，真实编辑器不会渲染；
    // 桩组件直接渲染插槽全部子节点，因此此处仅断言无按钮激活态（active=false 时按钮存在但无激活 class）
    const wrapper = mountEditor()
    expect(wrapper.find('.md-editor-catalog-toggle-btn--active').exists()).toBe(false)
  })

  it('图标随目录位置镜像：左侧时带翻转 class，右侧时不带', async () => {
    const wrapper = mountEditor({ catalog: true })
    const icon = () => wrapper.find('.md-editor-catalog-toggle-btn .md-editor-icon')
    expect(icon().classes()).not.toContain('md-editor-icon--flip')
    await wrapper.setProps({ catalogPosition: 'left' })
    expect(icon().classes()).toContain('md-editor-icon--flip')
  })
})

describe('MdEditor —— 全屏模式下的目录面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // md-editor-v3 的两种全屏都会在编辑器根元素上加 md-editor-fullscreen class，
  // 组件内用 MutationObserver 检测（微任务回调），因此 flushPromises + nextTick 后再断言。
  // 注意：不能直接 classList.add('md-editor-fullscreen') 模拟 ——
  // 全屏状态变化会引发 Vue 重渲染，vnode class patch 会整体覆盖 DOM class，
  // 手动加的 class 被抹掉后 observer 再次触发会把状态还原。
  // 因此拦截该元素 classList.contains，对 md-editor-fullscreen 返回模拟值（不受 patch 影响），
  // 再用一次临时 class 变更触发 observer 回调。
  const setFullscreen = async (wrapper, active) => {
    const el = stub(wrapper).element
    el.__simFs = active
    if (!el.__containsPatched) {
      const orig = el.classList.contains.bind(el.classList)
      el.classList.contains = (cls) =>
        cls === 'md-editor-fullscreen' ? !!el.__simFs : orig(cls)
      el.__containsPatched = true
    }
    // 触发真实 DOM class 变更，让 MutationObserver 回调执行
    el.classList.add('__fs-sim-trigger__')
    el.classList.remove('__fs-sim-trigger__')
    await flushPromises()
    await nextTick()
  }
  const enterFullscreen = (wrapper) => setFullscreen(wrapper, true)
  const exitFullscreen = (wrapper) => setFullscreen(wrapper, false)

  it('进入全屏后目录面板移入编辑器根元素，根元素带全屏让位 class', async () => {
    const wrapper = mountEditor({ catalog: true })
    // 非全屏：面板是 .base-md-editor 容器的直接子节点
    expect(wrapper.element.querySelector(':scope > .base-md-catalog')).not.toBeNull()
    expect(stub(wrapper).element.contains(wrapper.find('.base-md-catalog').element)).toBe(false)

    await enterFullscreen(wrapper)

    // 面板移入编辑器根元素内部（fixed/Fullscreen API 下兄弟节点不可见，必须在根内才能显示）
    const panel = stub(wrapper).element.querySelector('.base-md-catalog')
    expect(panel).not.toBeNull()
    expect(wrapper.element.querySelector(':scope > .base-md-catalog')).toBeNull()
    // 根元素带全屏让位 class（右侧），用于 padding 让位与面板定位
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog')).toBe(true)
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog-right')).toBe(true)
  })

  it('退出全屏后面板回到容器原位，让位 class 移除', async () => {
    const wrapper = mountEditor({ catalog: true })
    await enterFullscreen(wrapper)
    expect(stub(wrapper).element.querySelector('.base-md-catalog')).not.toBeNull()

    await exitFullscreen(wrapper)

    expect(wrapper.element.querySelector(':scope > .base-md-catalog')).not.toBeNull()
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog')).toBe(false)
  })

  it('目录在左侧时全屏让位 class 为 left 变体', async () => {
    const wrapper = mountEditor({ catalog: true, catalogPosition: 'left' })
    await enterFullscreen(wrapper)
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog-left')).toBe(true)
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog-right')).toBe(false)
  })

  it('全屏中通过工具栏按钮隐藏面板：面板移除且让位 class 同步消失', async () => {
    const wrapper = mountEditor({ catalog: true })
    await enterFullscreen(wrapper)
    expect(stub(wrapper).element.querySelector('.base-md-catalog')).not.toBeNull()

    await wrapper.find('.md-editor-catalog-toggle-btn').trigger('click')

    expect(stub(wrapper).element.querySelector('.base-md-catalog')).toBeNull()
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog')).toBe(false)
  })

  it('面板隐藏状态下进入全屏：无面板无让位 class，展开按钮后面板直接出现在编辑器根内', async () => {
    const wrapper = mountEditor({ catalog: true })
    await wrapper.find('.md-editor-catalog-toggle-btn').trigger('click')
    await enterFullscreen(wrapper)

    expect(stub(wrapper).element.querySelector('.base-md-catalog')).toBeNull()
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog')).toBe(false)

    // 全屏中展开目录
    await wrapper.find('.md-editor-catalog-toggle-btn').trigger('click')
    expect(stub(wrapper).element.querySelector('.base-md-catalog')).not.toBeNull()
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog')).toBe(true)
  })

  it('未开启目录时进入全屏：无面板、无让位 class', async () => {
    const wrapper = mountEditor()
    await enterFullscreen(wrapper)
    expect(stub(wrapper).element.querySelector('.base-md-catalog')).toBeNull()
    expect(stub(wrapper).element.classList.contains('md-editor--fs-catalog')).toBe(false)
  })
})
