import { defineConfig } from 'vite';

// 把 packages/core 打成小程序可直接 require 的 CommonJS 单文件。
// 目标 ES2017：小程序基础库对 ES6+ 支持良好，但别再往新了用。
export default defineConfig({
  build: {
    lib: {
      entry: 'packages/core/src/index.ts',
      formats: ['cjs'],
      fileName: () => 'core.js',
    },
    outDir: 'miniprogram/core',
    emptyOutDir: true,
    minify: false,
    target: 'es2017',
  },
});
