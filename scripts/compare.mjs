/**
 * 生成对比页：同一张测试人像，不同格数 / 去噪开关下的图纸效果。
 * 输出 docs/compare.html
 */
import fs from 'node:fs';
import path from 'node:path';
import * as Core from '../tmp/core.mjs';

const { convertPhoto } = Core;

function makePortrait(W = 240, H = 240) {
  const data = new Uint8ClampedArray(W * H * 4);
  const cx = W / 2;
  const cy = H / 2 + 12;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      let r = 234;
      let g = 228;
      let b = 216;

      // 头发
      const hx = (x - cx) / (W * 0.41);
      const hy = (y - (cy - 26)) / (H * 0.42);
      if (hx * hx + hy * hy <= 1 && y < cy - 4) {
        r = 64;
        g = 52;
        b = 46;
      }

      // 脸
      const fx = (x - cx) / (W * 0.32);
      const fy = (y - cy) / (H * 0.37);
      if (fx * fx + fy * fy <= 1) {
        const t = fy;
        r = 240 - t * 16;
        g = 198 - t * 24;
        b = 170 - t * 22;
      }

      // 眼睛
      const eyeL = Math.hypot((x - (cx - 23)) / 9, (y - (cy - 12)) / 12);
      const eyeR = Math.hypot((x - (cx + 23)) / 9, (y - (cy - 12)) / 12);
      if (eyeL <= 1 || eyeR <= 1) {
        r = 38;
        g = 34;
        b = 32;
      }

      // 眼神光
      if (Math.hypot(x - (cx - 26), y - (cy - 18)) < 4) {
        r = 255;
        g = 255;
        b = 255;
      }
      if (Math.hypot(x - (cx + 20), y - (cy - 18)) < 4) {
        r = 255;
        g = 255;
        b = 255;
      }

      // 嘴
      const mouth = Math.hypot((x - cx) / 27, (y - (cy + 38)) / 11);
      if (Math.abs(mouth - 1) < 0.14 && y > cy + 34) {
        r = 172;
        g = 92;
        b = 92;
      }

      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

const series = JSON.parse(
  fs.readFileSync('apps/web/public/data/mard-221.json', 'utf8'),
);

const img = makePortrait();

function svgOf(pattern, cell) {
  const w = pattern.width;
  const h = pattern.height;
  const EMPTY = 255;
  let out = `<svg viewBox="0 0 ${w * cell} ${h * cell}" width="${w * cell}" height="${h * cell}" shape-rendering="crispEdges">`;
  out += `<rect width="100%" height="100%" fill="#fff"/>`;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = pattern.cells[y * w + x];
      if (idx === EMPTY) continue;
      out += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${pattern.palette[idx].hex}"/>`;
    }
  }
  return out + '</svg>';
}

const cases = [
  { grid: 29, label: '29 × 29', note: '14.5cm · 钥匙扣级' },
  { grid: 48, label: '48 × 48', note: '24cm · 常规' },
  { grid: 72, label: '72 × 72', note: '36cm · 细节好' },
  { grid: 96, label: '96 × 96', note: '48cm · 精细' },
].map((c) => {
  const p = convertPhoto(img, {
    targetWidth: c.grid,
    targetHeight: c.grid,
    colorCount: 24,
    series,
  });
  return { ...c, pattern: p, svg: svgOf(p, 6) };
});

const withNoise = convertPhoto(img, {
  targetWidth: 72,
  targetHeight: 72,
  colorCount: 24,
  series,
  doDespeckle: true,
});
const noNoise = convertPhoto(img, {
  targetWidth: 72,
  targetHeight: 72,
  colorCount: 24,
  series,
  doDespeckle: false,
});

let diff = 0;
for (let i = 0; i < withNoise.cells.length; i++) {
  if (withNoise.cells[i] !== noNoise.cells[i]) diff++;
}
const diffRatio = ((diff / withNoise.cells.length) * 100).toFixed(2);

function card(c) {
  return `<div class="card">
    <div class="cap"><b>${c.label}</b><span>${c.note}</span><span class="meta">${c.pattern.stats.colorCount} 色 · ${c.pattern.stats.total} 颗</span></div>
    ${c.svg}
  </div>`;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>格数与去噪对比</title>
<style>
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#FAF7F2;color:#2C2C2A;margin:0;padding:32px}
h1{font-size:18px;font-weight:500;margin:0 0 6px}
.sub{font-size:13px;color:#6B6760;margin-bottom:26px;line-height:1.7}
.row{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:34px}
.card{background:#fff;border:1px solid #E7E1D7;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.cap{display:flex;gap:10px;align-items:baseline;font-size:12px;color:#6B6760;flex-wrap:wrap}
.cap b{font-size:13px;color:#2C2C2A;font-weight:500}
.cap .meta{margin-left:auto;color:#9C978E}
svg{border-radius:6px;display:block;max-width:100%;height:auto}
h2{font-size:15px;font-weight:500;margin:0 0 6px}
.note{font-size:12.5px;color:#6B6760;line-height:1.75;background:#fff;border:1px solid #E7E1D7;border-radius:10px;padding:14px 16px}
.note code{background:#F3EFE7;padding:1px 5px;border-radius:4px;font-size:12px}
</style></head><body>
<h1>格数对细节的影响</h1>
<div class="sub">同一张测试人像（带眼睛、眼神光、嘴），24 色，MARD 221 示例色卡。格数就是图纸的分辨率——它决定你摆得下多少细节，也决定成品多大。</div>
<div class="row">${cases.map(card).join('')}</div>

<h2>去噪开关对比（72 × 72）</h2>
<div class="sub">去噪现在的规则是：只有孤立点与邻居主色的 ΔE00 ≤ 6 才替换。眼睛和眼神光与肤色的色差有几十，不会被删。</div>
<div class="row">
  <div class="card"><div class="cap"><b>去噪开</b><span class="meta">${withNoise.stats.colorCount} 色</span></div>${svgOf(withNoise, 7)}</div>
  <div class="card"><div class="cap"><b>去噪关</b><span class="meta">${noNoise.stats.colorCount} 色</span></div>${svgOf(noNoise, 7)}</div>
</div>

<div class="note">
两者相差 <b>${diff} 格（${diffRatio}%）</b>。如果这个数字很大（比如 &gt; 8%），说明去噪在吃细节；现在这个比例只清掉了真正的零散噪点。<br><br>
顺带说一句：<code>72 × 72</code> 用 5mm 豆做出来是 36cm 见方，按 29×29 的标准底板要 <b>9 块</b>（3×3 拼）。<code>58 × 58</code> 只要 4 块（2×2），这是人像比较划算的档位。
</div>
</body></html>`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/compare.html', html, 'utf8');
console.log(`对比页已生成：docs/compare.html（去噪影响 ${diff} 格 / ${diffRatio}%）`);
