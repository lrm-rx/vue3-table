import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { viteMockServe } from 'vite-plugin-mock'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 加载当前模式的环境变量
  const env = loadEnv(mode, process.cwd())
  const useMock = env.VITE_USE_MOCK === 'true'

  return {
    plugins: [
      vue(),
      vueJsx(),
      AutoImport({
        imports: ['vue'],
        resolvers: [ElementPlusResolver()],
        // 生成类型声明文件；纯 JS 项目可改为 false 或删除
        dts: fileURLToPath(new URL('./src/types/auto-imports.d.ts', import.meta.url)),
        eslintrc: {
          enabled: true,
          filepath: fileURLToPath(new URL('./src/types/.eslintrc-auto-import.json', import.meta.url)),
        },
      }),
      Components({
        // 自动扫描 src/components 下的自定义组件
        dirs: ['src/components'],
        extensions: ['vue'],
        deep: true,
        resolvers: [ElementPlusResolver()],
        // 生成类型声明文件；纯 JS 项目可改为 false 或删除
        dts: fileURLToPath(new URL('./src/types/components.d.ts', import.meta.url)),
      }),
      // Mock 插件配置
      viteMockServe({
        // 只在开发环境启用 mock（或根据 VITE_USE_MOCK 环境变量）
        enable: useMock,
        // mock 文件目录
        mockPath: 'src/mock',
        // 日志
        logger: true,
        // 支持 ts/js
        supportTs: false,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    css: {
      preprocessorOptions: {
        // 使用 Sass modern API，消除 legacy-js-api deprecation 警告（Vite 5.4+）
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    server: {
      port: 5173,
      open: false,
      // 代理配置：真实后端时使用，mock 模式下可不启用
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
