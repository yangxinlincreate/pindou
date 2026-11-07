import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 受限环境不允许写系统 Temp，把 tmpdir 指向项目内。
// 必须在 vitest 内部取 os.tmpdir() 之前生效，所以放在配置模块顶层。
const tmp = path.resolve('node_modules/.vitest-tmp');
process.env.TEMP = tmp;
process.env.TMP = tmp;
process.env.TMPDIR = tmp;

export default defineConfig({
  cacheDir: 'node_modules/.vitest-cache',
  test: {
    pool: 'forks',
    include: ['packages/*/test/**/*.test.ts'],
  },
});
