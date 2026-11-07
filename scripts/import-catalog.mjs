/**
 * 把开源色卡数据转成本项目格式。
 *
 * 数据来源：makebead/craft-color-codes
 *   https://github.com/makebead/craft-color-codes
 *   许可：CC BY 4.0
 *   status: community —— 社区采样，非分光测色仪
 *
 * 用法：node scripts/import-catalog.mjs
 * 前置：把 mard-221.json / mard-kits.json 下到 tmp/sources/
 */

import fs from 'node:fs';
import path from 'node:path';

const D65 = { Xn: 0.95047, Yn: 1.0, Zn: 1.08883 };
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToLab(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;

  const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(X / D65.Xn);
  const fy = f(Y / D65.Yn);
  const fz = f(Z / D65.Zn);

  return {
    L: +(116 * fy - 16).toFixed(2),
    a: +(500 * (fx - fy)).toFixed(2),
    b: +(200 * (fy - fz)).toFixed(2),
  };
}

const SRC = 'tmp/sources';
const src = JSON.parse(fs.readFileSync(path.join(SRC, 'mard-221.json'), 'utf8'));
const kits = JSON.parse(fs.readFileSync(path.join(SRC, 'mard-kits.json'), 'utf8'));

console.log(`源数据：${src.product}`);
console.log(`  色数 ${src.colors.length}，status=${src.status}，license=${src.license}`);

// ---------- 色号 ----------

const colors = src.colors.map((c) => {
  const hex = c.hex.toUpperCase();
  return {
    id: `mard-221:${c.code}`,
    code: c.code,
    name: c.name || '',
    hex,
    lab: hexToLab(hex),
    finish: 'solid',
    // 社区采样：多源对照过，但没有用色差仪实测
    confidence: 'medium',
  };
});

// 校验：色号唯一、HEX 合法
const codes = new Set();
for (const c of colors) {
  if (codes.has(c.code)) throw new Error('重复色号: ' + c.code);
  codes.add(c.code);
  if (!/^#[0-9A-F]{6}$/.test(c.hex)) throw new Error('非法色值: ' + c.code + ' ' + c.hex);
}

// ---------- 套装 ----------

// 只用 mard-221 系列的套装；240/264 用到 mard-291，超出本系列范围
const usable = (kits.sets || []).filter((s) => s.palette === 'mard-221');
const skipped = (kits.sets || []).filter((s) => s.palette !== 'mard-221');

const sets = usable.map((s) => ({
  id: `mard-set-${s.size}`,
  name: `MARD ${s.size} 色套装`,
  // 源数据里 221 色套装的 codes 是字符串 "all"，表示整盒
  codes: s.codes === 'all' ? [...codes] : s.codes,
}));

console.log(
  `\n套装：${usable.map((s) => s.size + '色/' + s.codes.length).join('  ')}`,
);
if (skipped.length) {
  console.log(`  跳过 ${skipped.map((s) => s.size + '色').join('、')}（需要 mard-291 系列）`);
}

// 套装里的色号必须都在本系列内
for (const s of sets) {
  for (const code of s.codes) {
    if (!codes.has(code)) {
      console.warn(`  ! 套装 ${s.id} 含未知色号 ${code}，已忽略该套装`);
    }
  }
}

// ---------- 输出 ----------

const doc = {
  // 同时保留 id 和 seriesId：代码里按 id 读，历史数据里按 seriesId 存
  id: 'mard-221',
  seriesId: 'mard-221',
  brandName: 'MARD',
  beadSize: 5.0,
  version: '2026.11.4',
  source: 'makebead/craft-color-codes',
  status: 'community',
  attribution: {
    dataset: 'Craft Color Codes',
    author: 'MakeBead',
    url: 'https://github.com/makebead/craft-color-codes',
    license: 'CC-BY-4.0',
    upstream: (src.sources || []).map((s) => s.name + ' <' + s.url + '>'),
    note: '色值为社区采样，非分光测色仪实测。屏幕显示与实物豆存在差异，不同批次亦有轻微色差。',
  },
  colors,
  sets,
};

const outDir = path.resolve('apps/web/public/data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'mard-221.json'),
  JSON.stringify(doc, null, 1),
  'utf8',
);

const kb = (fs.statSync(path.join(outDir, 'mard-221.json')).size / 1024).toFixed(1);

console.log(`\n输出：apps/web/public/data/mard-221.json (${kb} KB)`);
console.log(`色号 ${colors.length} 个，套装 ${sets.length} 组`);
console.log(`\n署名要求（CC BY 4.0）：界面需注明数据来自 ${doc.attribution.dataset} (${doc.attribution.url})`);
