// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fileToBase64, isImageFile } from '../../src/components/mdEditor/utils'

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
