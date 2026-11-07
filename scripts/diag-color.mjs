/**
 * 配色诊断：给定几个典型颜色，看色卡里最近的是哪些色号、ΔE 差多少。
 * 用来判断「配色差」是算法问题还是色卡覆盖不足。
 */
import fs from 'node:fs';
import * as Core from '../tmp/core.mjs';

const { hexToLab, deltaE2000Raw } = Core;

const series = JSON.parse(
  fs.readFileSync('apps/web/public/data/mard-221.json', 'utf8'),
);

const probes = [
  ['头发深棕', '#40342E'],
  ['头发亮部', '#4A3A32'],
  ['脸部肤色', '#F3C9AE'],
  ['脸色阴影', '#E0B79C'],
  ['背景暖灰', '#ECE5D8'],
  ['背景深处', '#DCD3C2'],
  ['眼白高光', '#FFFFFF'],
  ['眼珠', '#282422'],
  ['嘴唇', '#AE5E5E'],
];

for (const [name, hex] of probes) {
  const lab = hexToLab(hex);
  const scored = series.colors
    .map((c) => ({
      code: c.code,
      hex: c.hex,
      name: c.name,
      d: deltaE2000Raw(lab.L, lab.a, lab.b, c.lab.L, c.lab.a, c.lab.b),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);

  console.log(`\n${name}  ${hex}   Lab(${lab.L.toFixed(1)}, ${lab.a.toFixed(1)}, ${lab.b.toFixed(1)})`);
  for (const s of scored) {
    console.log(`   ${s.code.padEnd(4)} ${s.hex}  ${s.name.padEnd(8)} ΔE00 = ${s.d.toFixed(2)}`);
  }
}

// 色卡整体覆盖度：随机取 2000 个 sRGB 颜色，看最小 ΔE 的分布
console.log('\n\n色卡覆盖度（随机 2000 个 sRGB 颜色到最近色号的 ΔE00）');
function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const r = rand(42);
const dists = [];
for (let i = 0; i < 2000; i++) {
  const R = Math.floor(r() * 256);
  const G = Math.floor(r() * 256);
  const B = Math.floor(r() * 256);
  const lab = hexToLab('#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join(''));
  let best = Infinity;
  for (const c of series.colors) {
    const d = deltaE2000Raw(lab.L, lab.a, lab.b, c.lab.L, c.lab.a, c.lab.b);
    if (d < best) best = d;
  }
  dists.push(best);
}
dists.sort((a, b) => a - b);
const pct = (p) => dists[Math.floor(dists.length * p)].toFixed(2);
console.log(`  P50 = ${pct(0.5)}   P90 = ${pct(0.9)}   P99 = ${pct(0.99)}   max = ${dists[dists.length - 1].toFixed(2)}`);
console.log('  参考：真实 221 色色卡的 P90 一般在 4~6，超过 8 说明色卡偏稀');
