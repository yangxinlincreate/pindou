/**
 * 生成 MARD 221 结构的示例色卡（占位色值，但覆盖度是认真算的）。
 *
 * 做法：
 *   1. 单独生成 21 个无彩色（黑白灰是拼豆最常用的：描边、阴影、背景）
 *   2. 把 sRGB 剩余区域按色相切成 8 组，每组独立 k-means 到 25 色
 *   3. 按组编号 A1..I25
 *
 * 为什么不用全局 k-means：sRGB 在 Lab 空间的体积严重不均，
 * 全局聚类会给出「绿色 58 个、蓝色 8 个、无彩色 1 个」这种没法用的结果。
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

function rgbToLab(r, g, b) {
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
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const finv = (t) => {
    const t3 = t * t * t;
    return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
  };
  const X = D65.Xn * finv(fx);
  const Y = D65.Yn * finv(fy);
  const Z = D65.Zn * finv(fz);
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const enc = (v) => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(s * 255)));
  };
  return [enc(R), enc(G), enc(B)];
}

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// ---------- k-means（Lab 空间） ----------

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function kmeans(labs, k, seed = 20261107, maxIter = 50) {
  const n = labs.length / 3;
  if (n === 0) return [];
  const kk = Math.min(k, n);
  const rand = makeRandom(seed);

  const centers = [];
  const first = Math.floor(rand() * n);
  centers.push([labs[0], labs[1], labs[2]].map((_, i) => labs[first * 3 + i]));
  const minD = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < kk; c++) {
    let sum = 0;
    const last = centers[c - 1];
    for (let i = 0; i < n; i++) {
      const dL = labs[i * 3] - last[0];
      const da = labs[i * 3 + 1] - last[1];
      const db = labs[i * 3 + 2] - last[2];
      const d = dL * dL + da * da + db * db;
      if (d < minD[i]) minD[i] = d;
      sum += minD[i];
    }
    if (sum <= 0) break;
    let r = rand() * sum;
    let acc = 0;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      acc += minD[i];
      if (acc >= r) {
        pick = i;
        break;
      }
    }
    centers.push([labs[pick * 3], labs[pick * 3 + 1], labs[pick * 3 + 2]]);
  }

  const K = centers.length;
  const assign = new Int32Array(n).fill(-1);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const dL = labs[i * 3] - centers[c][0];
        const da = labs[i * 3 + 1] - centers[c][1];
        const db = labs[i * 3 + 2] - centers[c][2];
        const d = dL * dL + da * da + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed++;
      }
    }
    const sum = new Float64Array(K * 3);
    const cnt = new Float64Array(K);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      sum[c * 3] += labs[i * 3];
      sum[c * 3 + 1] += labs[i * 3 + 1];
      sum[c * 3 + 2] += labs[i * 3 + 2];
      cnt[c]++;
    }
    for (let c = 0; c < K; c++) {
      if (cnt[c] > 0) centers[c] = [sum[c * 3] / cnt[c], sum[c * 3 + 1] / cnt[c], sum[c * 3 + 2] / cnt[c]];
    }
    if (changed / n < 0.001) break;
  }

  return centers;
}

// ---------- 1. 无彩色 21 个 ----------

const GRAY_COUNT = 21;
const grays = [];
for (let i = 0; i < GRAY_COUNT; i++) {
  const L = 98 - (i * 93) / (GRAY_COUNT - 1);
  const [r, g, b] = labToRgb(L, 0, 0);
  const [L2, a2, b2] = rgbToLab(r, g, b);
  grays.push({ r, g, b, hex: toHex(r, g, b), L: L2, a: a2, b: b2 });
}

// ---------- 2. 按色相分组采样 ----------

const HUE_GROUPS = [
  { code: 'B', name: '红', from: 335, to: 20 },
  { code: 'C', name: '橙', from: 20, to: 48 },
  { code: 'D', name: '黄', from: 48, to: 88 },
  { code: 'E', name: '绿', from: 88, to: 160 },
  { code: 'F', name: '青', from: 160, to: 196 },
  { code: 'G', name: '蓝', from: 196, to: 255 },
  { code: 'H', name: '紫', from: 255, to: 300 },
  { code: 'I', name: '粉', from: 300, to: 335 },
];

const PER_GROUP = 25; // 8 × 25 = 200，加 21 个灰 = 221

function hueOf(a, b) {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return (h + 360) % 360;
}

function inRange(h, from, to) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

// sRGB 全域采样（步长 12，共 22³ = 10648 点）
const buckets = new Map(HUE_GROUPS.map((g) => [g.code, []]));
for (let r = 0; r <= 255; r += 12) {
  for (let g = 0; g <= 255; g += 12) {
    for (let b = 0; b <= 255; b += 12) {
      const [L, a, bb] = rgbToLab(r, g, b);
      const C = Math.hypot(a, bb);
      if (C < 8) continue; // 近中性色交给灰阶
      const h = hueOf(a, bb);
      const grp = HUE_GROUPS.find((x) => inRange(h, x.from, x.to));
      if (grp) buckets.get(grp.code).push(L, a, bb);
    }
  }
}

// 每组独立聚类
const colors = [];

for (const g of [
  { code: 'A', name: '无彩色', list: grays },
  ...HUE_GROUPS.map((h) => ({ code: h.code, name: h.name, list: null })),
]) {
  if (g.code === 'A') {
    g.list
      .sort((x, y) => y.L - x.L)
      .forEach((c, i) => {
        colors.push({
          id: `mard-221:A${i + 1}`,
          code: `A${i + 1}`,
          name: `无彩色${i + 1}`,
          hex: c.hex,
          lab: { L: +c.L.toFixed(2), a: +c.a.toFixed(2), b: +c.b.toFixed(2) },
          finish: 'solid',
          confidence: 'placeholder',
        });
      });
    continue;
  }

  const labs = buckets.get(g.code);
  const centers = kmeans(new Float32Array(labs), PER_GROUP, 1000 + g.code.charCodeAt(0));

  const mapped = centers.map(([L, a, b]) => {
    const [r, gg, bb] = labToRgb(L, a, b);
    const [L2, a2, b2] = rgbToLab(r, gg, bb);
    return { hex: toHex(r, gg, bb), L: L2, a: a2, b: b2 };
  });

  // 去重后按明度从浅到深编号
  const uniq = [];
  for (const c of mapped) {
    if (uniq.some((u) => Math.abs(u.L - c.L) < 1.5 && Math.abs(u.a - c.a) < 1.5 && Math.abs(u.b - c.b) < 1.5)) continue;
    uniq.push(c);
  }
  uniq.sort((x, y) => y.L - x.L);

  uniq.forEach((c, i) => {
    colors.push({
      id: `mard-221:${g.code}${i + 1}`,
      code: `${g.code}${i + 1}`,
      name: `${g.name}${i + 1}`,
      hex: c.hex,
      lab: { L: +c.L.toFixed(2), a: +c.a.toFixed(2), b: +c.b.toFixed(2) },
      finish: 'solid',
      confidence: 'placeholder',
    });
  });
}

const byPrefix = {};
for (const c of colors) {
  const k = c.code[0];
  byPrefix[k] = (byPrefix[k] || 0) + 1;
}
console.log('色号分组：');
for (const k of Object.keys(byPrefix)) console.log(`  ${k}  ${byPrefix[k]} 色`);
console.log(`  合计 ${colors.length} 色`);

// ---------- 3. 套装（数量必须精确） ----------

const allCodes = colors.map((c) => c.code);

function makeSet(size) {
  const n = Math.min(size, allCodes.length);
  const picked = [];
  for (let i = 0; i < n; i++) {
    picked.push(allCodes[Math.floor((i * allCodes.length) / n)]);
  }
  return [...new Set(picked)];
}

const sets = [24, 48, 72, 144, 216].map((n) => ({
  id: `mard-set-${n}`,
  name: `MARD ${n} 色套装`,
  codes: makeSet(n),
}));

// ---------- 输出 ----------

const doc = {
  seriesId: 'mard-221',
  brandName: 'MARD',
  beadSize: 5.0,
  version: '2026.11.3-placeholder',
  source: 'placeholder',
  notice: '色值为占位示例，非真实测量。覆盖度按色相分组聚类生成。',
  colors,
  sets,
};

const outDir = path.resolve('apps/web/public/data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'mard-221.json'), JSON.stringify(doc, null, 1), 'utf8');

console.log(`\n输出：apps/web/public/data/mard-221.json`);
console.log(`套装：${sets.map((s) => s.codes.length).join(' / ')}`);
