// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
      previewTheme: { type: String, default: '' },
      codeTheme: { type: String, default: '' },
      language: { type: String, default: '' },
      toolbars: { type: Array, default: undefined },
      toolbarsExclude: { type: Array, default: () => [] },
      height: { type: [String, Number], default: undefined },
      disabled: { type: Boolean, default: false },
    },
    emits: ['update:modelValue'],
    setup(props) {
      return () => h('div', { class: 'md-editor-stub' }, props.modelValue)
    },
  })
  stubHolder.value = MdEditorStub
  return { MdEditor: MdEditorStub }
})

import MdEditor from '../../src/components/mdEditor/index.vue'

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
    const onSave = vi.fn()
    const wrapper = mount(MdEditor, {
      props: { modelValue: '' },
      attrs: { onSave },
    })
    // onSave 作为 attr 透传到底层桩组件（桩 inheritAttrs:false 但 attrs 仍可从 vm.$attrs 取）
    expect(stub(wrapper).vm.$attrs.onSave).toBe(onSave)
  })

  it('本组件自定义 prop（uploadType/customUpload/maxImageSize）不会透传给底层', () => {
    const wrapper = mountEditor({
      uploadType: 'custom',
      customUpload: vi.fn(),
      maxImageSize: 5,
    })
    const p = stub(wrapper).props()
    expect(p.uploadType).toBeUndefined()
    expect(p.customUpload).toBeUndefined()
    expect(p.maxImageSize).toBeUndefined()
  })
})
