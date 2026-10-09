// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fileToBase64, isImageFile, countMarkdownChars } from '../../src/components/mdEditor/utils'

/** 构造一个伪 File 对象（jsdom 中 new File 可用，但手动构造更可控） */
const fakeFile = (name, type, size = 1024) => ({ name, type, size })

describe('isImageFile 图片类型校验', () => {
  it('空值/undefined 返回 false', () => {
    expect(isImageFile(null)).toBe(false)
    expect(isImageFile(undefined)).toBe(false)
    expect(isImageFile({})).toBe(false)
  })

  it('type 以 image/ 开头判定为图片', () => {
    expect(isImageFile(fakeFile('a.png', 'image/png'))).toBe(true)
    expect(isImageFile(fakeFile('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isImageFile(fakeFile('a.gif', 'image/gif'))).toBe(true)
    expect(isImageFile(fakeFile('a.webp', 'image/webp'))).toBe(true)
    expect(isImageFile(fakeFile('a.svg', 'image/svg+xml'))).toBe(true)
    expect(isImageFile(fakeFile('a.ico', 'image/x-icon'))).toBe(true)
  })

  it('type 非 image/ 但扩展名命中白名单仍判定为图片（兜底）', () => {
    expect(isImageFile(fakeFile('a.png', 'application/octet-stream'))).toBe(true)
    expect(isImageFile(fakeFile('a.jpeg', ''))).toBe(true)
    expect(isImageFile(fakeFile('a.bmp', 'text/plain'))).toBe(true)
  })

  it('既无 image/ type 也无图片扩展名 → false', () => {
    expect(isImageFile(fakeFile('a.txt', 'text/plain'))).toBe(false)
    expect(isImageFile(fakeFile('a.pdf', 'application/pdf'))).toBe(false)
    expect(isImageFile(fakeFile('noext', ''))).toBe(false)
  })

  it('扩展名大小写不敏感', () => {
    expect(isImageFile(fakeFile('A.PNG', ''))).toBe(true)
    expect(isImageFile(fakeFile('a.Jpeg', ''))).toBe(true)
  })

  it('扩展名不在白名单（如 .tiff）即使是 image/* 也通过 type 判定，但无 type 时 false', () => {
    expect(isImageFile(fakeFile('a.tiff', 'image/tiff'))).toBe(true)
    expect(isImageFile(fakeFile('a.tiff', ''))).toBe(false)
  })
})

describe('fileToBase64 File → base64 data URL', () => {
  it('读取文本文件返回带 MIME 的 data URL', async () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
    const result = await fileToBase64(file)
    expect(result).toBe('data:text/plain;base64,aGVsbG8=')
  })

  it('读取 png 二进制返回 image/png data URL', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const file = new File([bytes], 'a.png', { type: 'image/png' })
    const result = await fileToBase64(file)
    expect(result.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('空文件也能正常转换', async () => {
    const file = new File([], 'empty.png', { type: 'image/png' })
    const result = await fileToBase64(file)
    expect(result).toBe('data:image/png;base64,')
  })

  it('type 为空时 data URL 不包含 MIME 段', async () => {
    const file = new File(['x'], 'noext', { type: '' })
    const result = await fileToBase64(file)
    expect(result).toBe('data:application/octet-stream;base64,eA==')
  })
})

describe('countMarkdownChars 字数统计（过滤 base64 图片编码）', () => {
  // 用与实现一致的剔除规则计算期望值，避免手写长度出错
  const strip = (s) => s.replace(/data:[^,;]+(?:;[^,;]+)*,[\w+/=]+/g, '')

  it('空值/空字符串返回 0', () => {
    expect(countMarkdownChars('')).toBe(0)
    expect(countMarkdownChars(null)).toBe(0)
    expect(countMarkdownChars(undefined)).toBe(0)
  })

  it('无 base64 图片时返回原始长度', () => {
    expect(countMarkdownChars('Hello 世界')).toBe('Hello 世界'.length)
    expect(countMarkdownChars('# 标题\n\n正文内容')).toBe('# 标题\n\n正文内容'.length)
  })

  it('单个 base64 图片：编码部分不计入，仅统计其余文本', () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const md = `![图](data:image/png;base64,${base64})`
    expect(countMarkdownChars(md)).toBe(strip(md).length)
    // 关键断言：base64 载荷（约 100+ 字符）被完全剔除，结果远小于原始长度
    expect(countMarkdownChars(md)).toBeLessThan(md.length - base64.length + 10)
  })

  it('多个 base64 图片全部剔除', () => {
    const b1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const b2 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    const md = `前 ![a](data:image/png;base64,${b1}) 中 ![b](data:image/gif;base64,${b2}) 后`
    expect(countMarkdownChars(md)).toBe(strip(md).length)
    expect(countMarkdownChars(md)).toBeLessThan(md.length - b1.length - b2.length + 10)
  })

  it('普通 http(s) 图片链接不计入剔除（非 base64）', () => {
    const md = '![图](https://example.com/a.png) 正文'
    expect(countMarkdownChars(md)).toBe(md.length)
  })

  it('base64 载荷含 padding 等号 (=) 与 / + 字符均能完整匹配剔除', () => {
    const payload = 'aGVsbG8+d29ybGQ/x==' // 含 = padding，base64 字符集
    const md = `x data:image/svg+xml;base64,${payload} y`
    expect(countMarkdownChars(md)).toBe(strip(md).length)
    expect(countMarkdownChars(md)).toBeLessThan(md.length - payload.length + 5)
  })

  it('多行文本中的 base64 也能正确剔除', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const md = `第一行\n\n![img](data:image/png;base64,${b64})\n\n第三行`
    expect(countMarkdownChars(md)).toBe(strip(md).length)
  })

  it('base64 占绝大部分时，统计值接近「去掉图片后」的真实文本量', () => {
    // 模拟一张大图：base64 约 2 万字符
    const huge = 'A'.repeat(20000)
    const md = `标题\n正文一段。\n![big](data:image/jpeg;base64,${huge})\n结尾。`
    expect(countMarkdownChars(md)).toBe(strip(md).length)
    // 原始长度被 base64 拉高到 2 万+，过滤后应回到个位数到几十的量级
    expect(countMarkdownChars(md)).toBeLessThan(100)
  })
})
