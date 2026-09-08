import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// 独立于 vite.config.js 的测试配置：
//  - 不启用 unplugin-auto-import / components（测试中显式导入，避免隐式全局）
//  - vue 插件用于解析 .vue 测试文件
//  - 默认 node 环境；需要 DOM 的测试文件顶部用 @vitest-environment jsdom 声明
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.{test,spec}.js"],
    globals: false,
    environment: "node",
  },
});
