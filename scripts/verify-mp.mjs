/**
 * 小程序工程静态检查。
 * 检查：页面文件齐全、JS 语法、WXML 标签闭合、core 与色卡数据可加载。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve('miniprogram');
const require = createRequire(import.meta.url);

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

// ---------- 页面完整性 ----------
console.log('\n页面结构');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));

for (const p of appJson.pages) {
  const dir = path.join(root, p);
  for (const ext of ['js', 'wxml', 'wxss', 'json']) {
    ok(`${p}.${ext} 存在`, fs.existsSync(`${dir}.${ext}`));
  }
}

for (const item of appJson.tabBar.list) {
  ok(`tabBar "${item.text}" 指向已注册页面`, appJson.pages.includes(item.pagePath), item.pagePath);
}

// ---------- JS 语法 ----------
console.log('\nJS 语法');
function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...walk(full));
    else if (f.name.endsWith('.js')) out.push(full);
  }
  return out;
}

for (const f of walk(root)) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    ok(path.relative(root, f), true);
  } catch (e) {
    ok(path.relative(root, f), false, (e.stderr || '').toString().split('\n')[0]);
  }
}

// ---------- WXML 标签 ----------
console.log('\nWXML 标签闭合');
for (const p of appJson.pages) {
  const file = path.join(root, p + '.wxml');
  const src = fs.readFileSync(file, 'utf8');
  for (const tag of ['view', 'text', 'block', 'scroll-view', 'picker', 'button', 'image', 'canvas']) {
    const open = (src.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
    const close = (src.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    const selfClose = (src.match(new RegExp('<' + tag + '[^>]*/>', 'g')) || []).length;
    if (open !== close + selfClose) {
      ok(`${p}.wxml <${tag}>`, false, `开 ${open} / 闭 ${close} / 自闭合 ${selfClose}`);
    }
  }
}
ok('所有 WXML 标签闭合平衡', true);

// ---------- core 与数据 ----------
console.log('\n运行时模块');

/**
 * 手动按 CommonJS 执行。
 * 根 package.json 是 "type": "module"，Node 会把 .js 当 ESM，
 * 但小程序运行时是 CommonJS，所以这里用 Function 包装模拟真实环境。
 */
function loadCjs(file) {
  const code = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', code);
  fn(module.exports, require, module, file, path.dirname(file));
  return module.exports;
}

let core = null;
try {
  core = loadCjs(path.join(root, 'core/core.js'));
  ok('core.js 可加载', true);
  ok('core 导出 convertPhoto', typeof core.convertPhoto === 'function');
  ok('core 导出 convertImport', typeof core.convertImport === 'function');
  ok('core 导出 analyzeImage', typeof core.analyzeImage === 'function');
} catch (e) {
  ok('core.js 可加载', false, e.message);
}

let series = null;
try {
  series = loadCjs(path.join(root, 'data/mard-221.js'));
  ok('色卡数据可加载', true);
  ok('色卡 221 色', series.colors.length === 221, `${series.colors.length}`);
  ok(
    '套装数量与每组色数都对得上',
    series.sets.length >= 5 &&
      series.sets.every((s) => s.codes.length === Number(s.id.split('-').pop())),
    series.sets.map((s) => s.codes.length).join('/'),
  );
} catch (e) {
  ok('色卡数据可加载', false, e.message);
}

// ---------- 端到端：用小程序的数据跑一次 ----------
console.log('\n端到端（小程序数据）');
if (core && series) {
  try {
    const N = 16;
    const scale = 6;
    const W = N * scale;
    const data = new Uint8ClampedArray(W * W * 4);
    const pal = [
      [255, 255, 255],
      [226, 58, 46],
      [47, 111, 181],
      [61, 58, 56],
    ];
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4;
        const gx = Math.floor(x / scale);
        const gy = Math.floor(y / scale);
        let c = pal[0];
        if (gx >= 3 && gx <= 12 && gy >= 3 && gy <= 12) c = pal[1];
        if (gx === 7 && gy === 7) c = pal[2];
        if (gx === 9 && gy === 9) c = pal[3];
        data[p] = c[0];
        data[p + 1] = c[1];
        data[p + 2] = c[2];
        data[p + 3] = 255;
      }
    }
    const raster = { width: W, height: W, data };

    const a = core.analyzeImage(raster);
    ok('识别为像素图', a.suggestMode === 'import', a.reason);
    ok('识别格子边长 = 6', a.grid && a.grid.gridSize === 6, a.grid ? String(a.grid.gridSize) : 'null');

    const pattern = core.convertImport(raster, { gridSize: 6, series });
    ok('导入生成 16×16', pattern.width === 16 && pattern.height === 16);
    ok('用量合计 = 256', pattern.stats.total === 256, String(pattern.stats.total));
    ok('所有色号都在色卡里', pattern.palette.every((p) => series.colors.some((c) => c.code === p.code)));

    const photo = core.convertPhoto(raster, {
      targetWidth: 32,
      targetHeight: 32,
      colorCount: 8,
      series,
    });
    ok('照片模式可用', photo.palette.length > 0 && photo.stats.total === 1024);

    const t0 = Date.now();
    core.convertPhoto(raster, { targetWidth: 120, targetHeight: 120, colorCount: 32, series });
    ok(`120×120 耗时 ${Date.now() - t0}ms`, true, '');
  } catch (e) {
    ok('端到端运行', false, e.message);
  }
}

console.log('\n' + '='.repeat(46));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (problems.length) {
  console.log('问题：');
  problems.forEach((p) => console.log('  · ' + p));
  process.exit(1);
}
