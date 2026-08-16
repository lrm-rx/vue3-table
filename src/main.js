import { createApp } from 'vue'
import App from './App.vue'

// element-plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/dist/locale/zh-cn'

// vxe-pc-ui 与 vxe-table 按需注册
import { setupVxeUI } from './plugins/vxe-ui'

const app = createApp(App)

// 注册 element-plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus, { locale: zhCn })

// 注册 vxe-pc-ui 与 vxe-table 所需组件（按需）
setupVxeUI(app)

app.mount('#app')
