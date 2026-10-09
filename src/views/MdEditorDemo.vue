<script setup>
/**
 * MdEditor 演示页：展示二次封装后的 Markdown 编辑器
 *  - 默认 base64 图片内联（支持工具栏上传 / 拖拽 / 截图粘贴）
 *  - 可切换 custom 上传模式（模拟后端上传，返回伪 URL）
 *  - 主题 / 代码主题切换
 *  - 工具栏集成 4 个扩展：Mark 高亮 · Emoji 表情 · 预览主题切换 · 插入时间
 *  - 支持 read-only 只读模式（文章发布后查看）
 *  - 实时展示原始 Markdown 内容
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import MdEditor from '@/components/mdEditor/index.vue'
import { fileToBase64, countMarkdownChars } from '@/components/mdEditor/utils'

// 编辑器内容
const content = ref(`# MdEditor 演示

这是 **md-editor-v3** 二次封装组件的使用示例。

## 工具栏扩展

编辑器工具栏右侧集成了 4 个扩展按钮：

| 扩展 | 用法 |
| --- | --- |
| **Mark 高亮** | 选中文字后点击，或输入 \`==高亮文本==\` |
| **Emoji 表情** | 点击弹出表情面板，选择插入 |
| **预览主题切换** | 下拉切换 default / github / vuepress / mk-cute 等 |
| **插入时间** | 点击即插入当前日期时间 |

## Mark 高亮示例

==这是一段被高亮标记的文字==，也可以 ==这样标记==。

## 图片支持

- 工具栏点击「图片」按钮上传
- 直接拖拽图片到编辑区
- **截图后直接粘贴**（Ctrl+V）→ 自动转为 base64 内联

> 试试用截图工具截一张图，然后在编辑区 Ctrl+V 粘贴。

## 代码块

\`\`\`js
const hello = 'world'
console.log(hello)
\`\`\`

## 列表

1. 第一项
2. 第二项
- 无序列表 A
- 无序列表 B

## 数学公式（KaTeX · 全特性覆盖）

行内公式：质能方程 $E = mc^2$；求根公式 $x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$；希腊字母 $\\alpha + \\beta = \\gamma$；二项式 $\\binom{n}{k}$；向量点积 $\\vec{v} \\cdot \\vec{w}$；重要极限 $\\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1$。

### 积分与无穷级数

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

$$
f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n
$$

### 嵌套根式、连分数与 n 次根

$$
\\sqrt{1 + 2\\sqrt{1 + 3\\sqrt{1 + 4\\sqrt{\\cdots}}}} = 3
$$

$$
x = 1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cfrac{1}{1 + \\cdots}}}
$$

$$
\\sqrt[n]{x^n} = |x|
$$

### 矩阵、行列式与分段函数

$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
\\begin{pmatrix} x \\\\ y \\end{pmatrix}
=
\\begin{pmatrix} ax+by \\\\ cx+dy \\end{pmatrix}
$$

$$
\\det \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc
$$

$$
|x| = \\begin{cases} x & x \\geq 0 \\\\ -x & x < 0 \\end{cases}
$$

### 多行对齐、极限与连乘

$$
\\begin{aligned}
(a+b)^2 &= a^2 + 2ab + b^2 \\\\
(a-b)^2 &= a^2 - 2ab + b^2 \\\\
(a+b)(a-b) &= a^2 - b^2
\\end{aligned}
$$

$$
\\lim_{n \\to \\infty} \\prod_{k=1}^{n} \\left(1 + \\frac{1}{k}\\right) = e
$$

### 数学字体、着重号与顶线/底线括号

$$
\\mathbb{R} \\quad \\mathcal{L} \\quad \\mathbf{x} \\quad \\mathrm{e}^{i\\pi} + 1 = 0 \\quad \\mathsf{ABC} \\quad \\mathtt{0101}
$$

$$
\\dot{x} = \\frac{dx}{dt}, \\qquad \\ddot{x} = \\frac{d^2x}{dt^2}, \\qquad \\hat{H}\\psi = E\\psi
$$

$$
\\overbrace{a + b + c}^{\\text{三项之和}} + \\underbrace{d + e}_{\\text{两项}}
$$

### 颜色（需 trust: true）

$$
\\color{red}{x^2} + \\color{blue}{y^2} = \\color{green}{r^2}
$$

## 复杂公式与文本混排

下面这段文字密集穿插了**行内公式**，用于验证文本与行内公式混排时的换行、基线对齐与上下间距：设随机变量 $X \\sim N(\\mu, \\sigma^2)$，其概率密度为 $f(x) = \\dfrac{1}{\\sqrt{2\\pi}\\,\\sigma} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$，期望 $\\mathbb{E}[X] = \\mu$，方差 $\\mathrm{Var}(X) = \\sigma^2$。对任意实数 $a \\neq 0$，有 $aX + b \\sim N(a\\mu + b,\\, a^2\\sigma^2)$，标准化后 $Z = \\dfrac{X - \\mu}{\\sigma} \\sim N(0, 1)$。当样本量 $n \\to \\infty$ 时，由中心极限定理 $\\sqrt{n}\\,(\\bar{X}_n - \\mu) \\xrightarrow{d} N(0, \\sigma^2)$。

再看一段**块级公式与说明文字衔接**的内容，验证公式前后文本的过渡与块级公式的居中显示：

欧拉恒等式把五个最基本的常数联系在一起，被誉为「最美的数学公式」：

$$
e^{i\\pi} + 1 = 0
$$

高斯积分（广义积分与根号嵌套）在概率论与统计力学中反复出现：

$$
\\int_{-\\infty}^{+\\infty} e^{-\\alpha x^2}\\,dx = \\sqrt{\\dfrac{\\pi}{\\alpha}}, \\qquad (\\alpha > 0)
$$

带说明文字的多行推导（aligned 环境，逐行等号对齐），常用于证明与计算过程：

$$
\\begin{aligned}
\\sum_{k=1}^{n} k &= \\dfrac{n(n+1)}{2} \\\\
\\sum_{k=1}^{n} k^2 &= \\dfrac{n(n+1)(2n+1)}{6} \\\\
\\sum_{k=1}^{n} k^3 &= \\left(\\dfrac{n(n+1)}{2}\\right)^{\\!2}
\\end{aligned}
$$

含上下限的大型运算符与分式嵌套，测试大运算符、上下标与分数线的垂直间距：

$$
\\Gamma(z) = \\int_{0}^{\\infty} t^{z-1} e^{-t}\\,dt, \\qquad \\Gamma(n) = (n-1)! \\quad (n \\in \\mathbb{N}^{+})
$$

$$
\\zeta(s) = \\sum_{n=1}^{\\infty} \\dfrac{1}{n^s} = \\prod_{p \\text{ prime}} \\dfrac{1}{1 - p^{-s}}, \\qquad (\\mathrm{Re}(s) > 1)
$$

行内公式与块级公式同段混排：傅里叶变换 $\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ 定义在整个实轴上，其逆变换为 $f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\,e^{2\\pi i x \\xi}\\,d\\xi$，这对变换在 $L^2(\\mathbb{R})$ 上构成等距同构。

**超长行内公式**（验证不溢出容器、不出现错乱换行）：$\\displaystyle \\oint_{\\partial\\Omega} P\\,dx + Q\\,dy = \\iint_{\\Omega} \\left(\\dfrac{\\partial Q}{\\partial x} - \\dfrac{\\partial P}{\\partial y}\\right) dx\\,dy$，即二维区域上的格林公式。

## 字数统计测试（base64 图片过滤）

下面内嵌了一张 base64 图片（其编码约 90 字符）。
观察左下角与下方「字数」：它**不应**包含这段 base64 编码，只统计真实文本。

![内嵌 base64 测试图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

↑ 这张 1×1 PNG 的 base64 载荷不会被计入字数；图片前后的文字仍正常统计。

---

## 😲 md-editor-v3

Markdown Editor for Vue3, developed in jsx and typescript, support different themes、beautify content by prettier.

### 🤖 Base

** **bold** ** , <u>underline</u>, _italic_, ~~line-through~~, superscript^26^, subscript~1~, \`inline code\`, [link](https://github.com/imzbf)

> quote: I Have a Dream

1. So even though we face the difficulties of today and tomorrow, I still have a dream.
2. It is a dream deeply rooted in the American dream.
3. I have a dream that one day this nation will rise up.

- [ ] Friday
- [ ] Saturday
- [x] Sunday

![Picture](https://imzbf.github.io/md-editor-rt/imgs/mark_emoji.gif)
`)

// 图片处理方式
const uploadType = ref('base64')
// 单图最大体积（MB）
const maxImageSize = ref(10)
// 编辑器主题
const theme = ref('light')
// 只读模式
const readOnly = ref(false)
// 禁用模式（工具栏置灰、不可编辑）
const disabled = ref(false)
// 代码高亮主题
const codeTheme = ref('atom')
const codeThemeOptions = [
  'atom', 'a11y', 'github', 'gradient', 'kimbie', 'paraiso', 'qtcreator', 'stackoverflow',
]

// 自定义上传：模拟后端接口（真实项目替换为 axios 上传）
const customUpload = async (files) => {
  ElMessage.info(`模拟上传 ${files.length} 张图片到服务器...`)
  // 演示：实际应上传到后端拿到 URL，这里用 base64 假装是「服务器返回的 URL」
  const urls = await Promise.all(files.map((f) => fileToBase64(f)))
  return urls
}

// 字数统计（与编辑器页脚一致：过滤 base64 图片编码）
const charCount = computed(() => countMarkdownChars(content.value))

// 复制 Markdown 源码
const copyMarkdown = async () => {
  try {
    await navigator.clipboard.writeText(content.value)
    ElMessage.success('Markdown 源码已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择复制')
  }
}

// 清空
const clearContent = () => {
  content.value = ''
  ElMessage.info('已清空编辑器')
}
</script>

<template>
  <div class="md-demo">
    <el-card shadow="never" class="md-demo__panel">
      <template #header>
        <div class="md-demo__toolbar">
          <span class="md-demo__label">图片处理</span>
          <el-radio-group v-model="uploadType" size="small">
            <el-radio-button value="base64">base64 内联</el-radio-button>
            <el-radio-button value="custom">自定义上传</el-radio-button>
          </el-radio-group>

          <span class="md-demo__label">单图上限</span>
          <el-select v-model="maxImageSize" size="small" style="width: 90px">
            <el-option :value="2" label="2 MB" />
            <el-option :value="5" label="5 MB" />
            <el-option :value="10" label="10 MB" />
            <el-option :value="20" label="20 MB" />
          </el-select>

          <el-divider direction="vertical" />

          <span class="md-demo__label">主题</span>
          <el-switch
            v-model="theme"
            active-value="dark"
            inactive-value="light"
            active-text="深色"
            inactive-text="浅色"
          />

          <span class="md-demo__label">只读</span>
          <el-switch v-model="readOnly" active-text="预览" inactive-text="编辑" />

          <span class="md-demo__label">禁用</span>
          <el-switch v-model="disabled" active-text="禁用" inactive-text="正常" />

          <span class="md-demo__label">代码主题</span>
          <el-select v-model="codeTheme" size="small" style="width: 130px">
            <el-option
              v-for="t in codeThemeOptions"
              :key="t"
              :label="t"
              :value="t"
            />
          </el-select>
        </div>
      </template>

      <div class="md-demo__tip">
        <el-icon><InfoFilled /></el-icon>
        <span>
          工具栏集成了 <b>Mark 高亮</b> · <b>Emoji 表情</b> · <b>预览主题切换</b> · <b>插入时间</b> 扩展；
          支持 <b>只读模式</b>（切换「只读」开关查看效果）；
          图片支持工具栏上传 · 拖拽 · <b>截图粘贴</b>（自动转 base64）
        </span>
      </div>

      <MdEditor
        v-model="content"
        :read-only="readOnly"
        :disabled="disabled"
        :upload-type="uploadType"
        :custom-upload="uploadType === 'custom' ? customUpload : null"
        :max-image-size="maxImageSize"
        :theme="theme"
        :code-theme="codeTheme"
        style="height: 560px"
      />

      <div class="md-demo__meta">
        <span>字数：<b>{{ charCount }}</b></span>
        <el-button size="small" @click="copyMarkdown">复制 Markdown</el-button>
        <el-button size="small" type="danger" @click="clearContent">清空</el-button>
      </div>

      <el-collapse class="md-demo__raw">
        <el-collapse-item title="查看原始 Markdown 源码">
          <pre class="md-demo__raw-content">{{ content }}</pre>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.md-demo {
  display: flex;
  justify-content: center;

  &__panel {
    width: 100%;
    max-width: 1100px;
    border-radius: 8px;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__label {
    font-size: 13px;
    color: #61666d;
  }

  &__tip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: #f4f4f5;
    border-radius: 4px;
    font-size: 13px;
    color: #61666d;

    b {
      color: #fb7299;
    }
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    font-size: 13px;
    color: #61666d;

    b {
      color: #fb7299;
    }
  }

  &__raw {
    margin-top: 12px;

    &-content {
      margin: 0;
      padding: 12px;
      background: #fafafa;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow: auto;
    }
  }
}
</style>
