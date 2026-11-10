import { defineConfig } from 'vite';

// 给 uni-app 用的 ESM 产物。
// uni-app 的编译链（webpack/vite）能直接 import ESM，
// 但不能直接吃 CommonJS 的 module.exports，所以这里输出 es 格式。
export default defineConfig({
  build: {
    lib: {
      entry: 'packages/core/src/index.ts',
      formats: ['es'],
      fileName: () => 'core.js',
    },
    outDir: 'apps/uni/common',
    // 不能清空：目录里还有 mard-221.js
    emptyOutDir: false,
    minify: false,
    target: 'es2017',
  },
});
