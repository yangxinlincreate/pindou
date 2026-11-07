import { defineConfig } from 'vite';

// 把 packages/core 打成一个 ESM 文件，供 Node 脚本直接 import。
// 用于在没有测试框架的环境下跑算法验证。
export default defineConfig({
  build: {
    lib: {
      entry: 'packages/core/src/index.ts',
      formats: ['es'],
      fileName: () => 'core.mjs',
    },
    outDir: 'tmp',
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    rollupOptions: {
      external: [],
    },
  },
});
