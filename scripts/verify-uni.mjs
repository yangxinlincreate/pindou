/**
 * uni-app 工程静态检查。
 * 无法替代 HBuilderX 真编译，但能抓出语法错误、路径写错、结构缺失。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve('apps/uni');
let pass = 0;
let fail = 0;
const problems = [];

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    problems.push(name + (extra ? ' — ' + extra : ''));
    console.log(`  FAIL  ${name}  ${extra}`);
  }
}

console.log('\n工程结构');
for (const f of ['manifest.json', 'pages.json', 'main.js', 'App.vue', 'index.html', 'uni.scss']) {
  ok(f, fs.existsSync(path.join(root, f)));
}

// pages.json 里声明的页面，对应的 .vue 必须存在
const pagesJson = JSON.parse(fs.readFileSync(path.join(root, 'pages.json'), 'utf8'));
for (const p of pagesJson.pages) {
  ok(`${p.path}.vue`, fs.existsSync(path.join(root, p.path + '.vue')));
}
for (const t of pagesJson.tabBar.list) {
  ok(`tabBar「${t.text}」指向已注册页面`, pagesJson.pages.some((p) => p.path === t.pagePath), t.pagePath);
}

// manifest 关键字段
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
ok('manifest 声明 vueVersion=3', manifest.vueVersion === '3', String(manifest.vueVersion));
ok('manifest 有 mp-weixin 配置', !!manifest['mp-weixin']);
ok('mp-weixin.appid 已填', !!manifest['mp-weixin'].appid, manifest['mp-weixin'].appid);

console.log('\n依赖产物');
for (const f of ['common/core.js', 'common/mard-221.js', 'common/store.js', 'common/canvas.js']) {
  ok(f, fs.existsSync(path.join(root, f)));
}

const coreSrc = fs.readFileSync(path.join(root, 'common/core.js'), 'utf8');
ok('core.js 是 ESM（有 export）', /^export\s*\{/m.test(coreSrc));
ok('core.js 含 convertPhoto', coreSrc.includes('convertPhoto'));
ok('core.js 含 removeSpeckles', coreSrc.includes('removeSpeckles'));

const dataSrc = fs.readFileSync(path.join(root, 'common/mard-221.js'), 'utf8');
ok('mard-221.js 是 ESM（export default）', /^export default\s*\{/m.test(dataSrc));

// ---------- .vue 语法 ----------

console.log('\nVue 文件');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walk(full, out);
    else if (f.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

const tmpDir = path.resolve('tmp/uni-check');
fs.mkdirSync(tmpDir, { recursive: true });

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const src = fs.readFileSync(file, 'utf8');

  // 结构（App.vue 只承载生命周期和全局样式，本来就没有 template）
  const isAppVue = rel === 'App.vue';
  const hasTemplate = /<template>[\s\S]*<\/template>/.test(src);
  const hasScript = /<script>[\s\S]*<\/script>/.test(src);
  if (!isAppVue) ok(`${rel} 有 template`, hasTemplate);
  ok(`${rel} 有 script`, hasScript);

  // script 语法
  if (hasScript) {
    const m = src.match(/<script>([\s\S]*?)<\/script>/);
    const code = m[1];
    const out = path.join(tmpDir, rel.replace(/[\/\\]/g, '_') + '.mjs');
    fs.writeFileSync(out, code, 'utf8');
    try {
      execFileSync(process.execPath, ['--check', out], { stdio: 'pipe' });
      ok(`${rel} script 语法`, true);
    } catch (e) {
      ok(`${rel} script 语法`, false, (e.stderr || '').toString().split('\n').slice(0, 3).join(' '));
    }
  }

  // Vue3 里没有 setData，写了必崩
  ok(`${rel} 未误用 this.setData`, !src.includes('this.setData('));

  // 标签配对（只看常见容器）
  for (const tag of ['view', 'text', 'scroll-view', 'picker', 'canvas']) {
    const open = (src.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
    const close = (src.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (open !== close) {
      ok(`${rel} <${tag}> 配对`, false, `开 ${open} / 闭 ${close}`);
    }
  }
}

console.log('\n' + '='.repeat(46));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (problems.length) {
  console.log('问题：');
  problems.forEach((p) => console.log('  · ' + p));
  process.exit(1);
}
