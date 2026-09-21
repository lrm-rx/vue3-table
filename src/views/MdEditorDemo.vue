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
import { fileToBase64 } from '@/components/mdEditor/utils'

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

// 字数统计
const charCount = computed(() => content.value.length)

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
