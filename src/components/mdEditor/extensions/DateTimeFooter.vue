<script setup>
/**
 * 页脚日期时间组件 —— 展示当前日期时间星期，每秒刷新
 * 放在 MdEditor 的 #defFooters 插槽中使用
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const now = ref('')

let timer = null

const update = () => {
  const d = dayjs()
  now.value = `${d.format('YYYY/MM/DD HH:mm:ss')} ${WEEKDAYS[d.day()]}`
}

onMounted(() => {
  update()
  timer = setInterval(update, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="md-editor-datetime-footer">
    {{ now }}
  </div>
</template>

<style scoped lang="scss">
.md-editor-datetime-footer {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  color: #61666d;
  user-select: none;
  white-space: nowrap;
}
</style>
