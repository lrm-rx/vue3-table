// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fileToBase64, isImageFile, countMarkdownChars, buildCatalogTree, pickActiveHeadingIndex, sanitizeMarkdownHtml } from '../../src/components/mdEditor/utils'

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

describe('buildCatalogTree 扁平标题列表 → 树形结构', () => {
  const h = (level, text, line = 0) => ({ level, text, line })

  it('空输入返回空数组', () => {
    expect(buildCatalogTree([])).toEqual([])
    expect(buildCatalogTree(null)).toEqual([])
    expect(buildCatalogTree(undefined)).toEqual([])
  })

  it('单层级平铺：全部成为根节点', () => {
    const tree = buildCatalogTree([h(1, 'A'), h(1, 'B'), h(1, 'C')])
    expect(tree).toHaveLength(3)
    expect(tree.map((n) => n.text)).toEqual(['A', 'B', 'C'])
    expect(tree.every((n) => n.children.length === 0)).toBe(true)
  })

  it('标准嵌套：h1 > h2 > h3 正确挂接', () => {
    const tree = buildCatalogTree([
      h(1, '一'),
      h(2, '一点一'),
      h(3, '一点一深'),
      h(2, '一点二'),
      h(1, '二'),
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0].text).toBe('一')
    expect(tree[0].children.map((n) => n.text)).toEqual(['一点一', '一点二'])
    expect(tree[0].children[0].children.map((n) => n.text)).toEqual(['一点一深'])
    expect(tree[1].text).toBe('二')
  })

  it('层级跳跃（h1 → h3）：h3 挂为 h1 子节点', () => {
    const tree = buildCatalogTree([h(1, '一'), h(3, '跳级')])
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].text).toBe('跳级')
  })

  it('首个标题不是 h1（h2 先于 h1）：各自独立成根', () => {
    const tree = buildCatalogTree([h(2, '小二'), h(1, '大一')])
    expect(tree).toHaveLength(2)
    expect(tree[0].text).toBe('小二')
    expect(tree[1].text).toBe('大一')
  })

  it('同级连续出现：正确弹出栈形成兄弟关系', () => {
    const tree = buildCatalogTree([
      h(1, '一'),
      h(2, '一点一'),
      h(2, '一点二'),
      h(2, '一点三'),
    ])
    expect(tree[0].children).toHaveLength(3)
  })

  it('maxDepth 限制层级：超出层级的标题被剔除', () => {
    const tree = buildCatalogTree(
      [h(1, '一'), h(2, '一点一'), h(3, '一深'), h(2, '一点二')],
      2,
    )
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((n) => n.text)).toEqual(['一点一', '一点二'])
    // h3 被剔除后，后续同级 h2 仍正确挂回 h1
  })

  it('maxDepth 剔除中间层后，更深层级一并剔除、有效层级保持挂接', () => {
    // h2 被剔除 → h3 也超出限制被剔除；最终只剩 h1
    const tree = buildCatalogTree([h(1, '一'), h(2, '二'), h(3, '三')], 1)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(0)
  })

  it('maxDepth 为 0 / 负数 / undefined 时不限制层级', () => {
    const src = [h(1, '一'), h(4, '深层')]
    expect(buildCatalogTree(src, 0)[0].children).toHaveLength(1)
    expect(buildCatalogTree(src, -1)[0].children).toHaveLength(1)
    expect(buildCatalogTree(src, undefined)[0].children).toHaveLength(1)
  })

  it('节点携带 key / index / text / level / line 元数据', () => {
    const tree = buildCatalogTree([h(1, 'A', 0), h(2, 'B', 3)])
    expect(tree[0]).toMatchObject({ key: 'h0', index: 0, text: 'A', level: 1, line: 0 })
    expect(tree[0].children[0]).toMatchObject({ key: 'h1', index: 1, text: 'B', level: 2, line: 3 })
  })
})

describe('sanitizeMarkdownHtml HTML 清洗（DOMPurify）', () => {
  it('空值返回空字符串', () => {
    expect(sanitizeMarkdownHtml('')).toBe('')
    expect(sanitizeMarkdownHtml(null)).toBe('')
    expect(sanitizeMarkdownHtml(undefined)).toBe('')
  })

  it('<script> 标签被剥离，内部文本不留脚本', () => {
    const out = sanitizeMarkdownHtml('<p>safe</p><script>alert(1)</script>')
    expect(out).toContain('<p>safe</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('on* 事件属性被剥离（img onerror / div onclick）', () => {
    const out = sanitizeMarkdownHtml('<img src="x.png" onerror="alert(1)"><div onclick="alert(2)">t</div>')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('alert(')
    // 安全部分保留
    expect(out).toContain('src="x.png"')
    expect(out).toContain('<div>t</div>')
  })

  it('javascript: / vbscript: 伪协议链接被中和', () => {
    const out = sanitizeMarkdownHtml('<a href="javascript:alert(1)">x</a><a href="vbscript:msgbox(1)">y</a>')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('vbscript:')
    // 标签与文本本身保留
    expect(out).toContain('>x</a>')
    expect(out).toContain('>y</a>')
  })

  it('<iframe> 被剥离', () => {
    const out = sanitizeMarkdownHtml('<iframe src="https://evil.example"></iframe><p>ok</p>')
    expect(out).not.toContain('<iframe')
    expect(out).toContain('<p>ok</p>')
  })

  it('常规 markdown 渲染产物完整保留（mark/details/标题锚点/class/style）', () => {
    const html =
      '<h1 id="t1">标题</h1>' +
      '<p><mark>高亮</mark><span class="katex" style="font-size:1em">x</span></p>' +
      '<details><summary>折叠</summary><p>内容</p></details>'
    const out = sanitizeMarkdownHtml(html)
    expect(out).toContain('id="t1"')
    expect(out).toContain('<mark>高亮</mark>')
    expect(out).toContain('class="katex"')
    expect(out).toContain('style=')
    expect(out).toContain('<details>')
    expect(out).toContain('<summary>折叠</summary>')
  })

  it('img 上的 base64 data: URI 保留（组件默认 base64 内联图片）', () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="图" title="t">'
    const out = sanitizeMarkdownHtml(html)
    expect(out).toContain('data:image/png;base64,iVBORw0KGgo=')
    expect(out).toContain('alt="图"')
  })

  it('https 图片链接与任务列表 checkbox 保留', () => {
    const html =
      '<img src="https://example.com/a.png" alt="a">' +
      '<ul><li><input type="checkbox" disabled checked> 已完成</li></ul>'
    const out = sanitizeMarkdownHtml(html)
    expect(out).toContain('https://example.com/a.png')
    expect(out).toContain('<input')
    expect(out).toContain('checked')
  })
})

describe('pickActiveHeadingIndex 滚动高亮决策', () => {
  it('空数组返回 -1', () => {
    expect(pickActiveHeadingIndex([], 100)).toBe(-1)
    expect(pickActiveHeadingIndex(null, 100)).toBe(-1)
    expect(pickActiveHeadingIndex(undefined, 100)).toBe(-1)
  })

  it('滚动位置在首个标题之前：默认高亮第一项（与内置目录行为一致）', () => {
    expect(pickActiveHeadingIndex([100, 200, 300], 0)).toBe(0)
    expect(pickActiveHeadingIndex([100, 200, 300], 99)).toBe(0)
  })

  it('越过哪个标题就高亮哪个（最后一个 top <= scrollTop + offset）', () => {
    const tops = [100, 200, 300]
    expect(pickActiveHeadingIndex(tops, 100)).toBe(0)
    expect(pickActiveHeadingIndex(tops, 150)).toBe(0)
    expect(pickActiveHeadingIndex(tops, 200)).toBe(1)
    expect(pickActiveHeadingIndex(tops, 299)).toBe(1)
    expect(pickActiveHeadingIndex(tops, 300)).toBe(2)
    expect(pickActiveHeadingIndex(tops, 9999)).toBe(2)
  })

  it('offset 参与判定：判定线 = scrollTop + offset', () => {
    const tops = [100, 200, 300]
    // scrollTop=90 + offset=20 → 判定线 110，越过 top=100
    expect(pickActiveHeadingIndex(tops, 90, 20)).toBe(0)
    // scrollTop=180 + offset=20 → 判定线 200，恰好越过 top=200（含等于）
    expect(pickActiveHeadingIndex(tops, 180, 20)).toBe(1)
  })

  it('边界相等时视为已越过（<= 判定）', () => {
    expect(pickActiveHeadingIndex([50], 50)).toBe(0)
  })

  it('top 相同的多个标题取最后一个', () => {
    // jsdom 等无布局环境所有 offsetTop 为 0 的场景
    expect(pickActiveHeadingIndex([0, 0, 0], 0)).toBe(2)
  })
})
