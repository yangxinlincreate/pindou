/**
 * 生成 README 用的效果对比图：左原图 / 右成品图纸。
 * 不依赖任何图像库，PNG 自己编。
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import * as Core from '../tmp/core.mjs';

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function canvas(w, h, bg = [255, 255, 255]) {
  const d = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = bg[0];
    d[i * 4 + 1] = bg[1];
    d[i * 4 + 2] = bg[2];
    d[i * 4 + 3] = 255;
  }
  return { w, h, d };
}
function setPx(cv, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  cv.d[i] = r;
  cv.d[i + 1] = g;
  cv.d[i + 2] = b;
  cv.d[i + 3] = 255;
}
function rect(cv, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(cv, x, y, c[0], c[1], c[2]);
}

/** 把 pattern 画成图纸 */
function renderPattern(pattern, cell) {
  const w = pattern.width;
  const h = pattern.height;
  const cv = canvas(w * cell, h * cell);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = pattern.cells[y * w + x];
      if (idx === 255) continue;
      const hex = pattern.palette[idx].hex;
      const n = parseInt(hex.slice(1), 16);
      rect(cv, x * cell, y * cell, cell, cell, [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
  }
  return cv;
}

/** 左边原图 + 右边成品，中间留白 */
function sideBySide(left, right, gap = 24) {
  const w = left.w + gap + right.w;
  const h = Math.max(left.h, right.h);
  const cv = canvas(w, h, [246, 244, 240]);
  // 左
  for (let y = 0; y < left.h; y++) {
    for (let x = 0; x < left.w; x++) {
      const i = (y * left.w + x) * 4;
      setPx(cv, x, y, left.d[i], left.d[i + 1], left.d[i + 2]);
    }
  }
  // 右
  const ox = left.w + gap;
  for (let y = 0; y < right.h; y++) {
    for (let x = 0; x < right.w; x++) {
      const i = (y * right.w + x) * 4;
      setPx(cv, ox + x, y, right.d[i], right.d[i + 1], right.d[i + 2]);
    }
  }
  return cv;
}

const series = JSON.parse(fs.readFileSync('apps/web/public/data/mard-221.json', 'utf8'));
const outDir = path.resolve('docs/images');
fs.mkdirSync(outDir, { recursive: true });

// ---------- 场景 1：人像（肤色渐变 + 五官）----------
{
  const W = 300;
  const H = 300;
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  const cx = 150;
  const cy = 160;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      // 背景：浅暖灰
      let r = 232, g = 226, b = 214;

      const fx = (x - cx) / 78;
      const fy = (y - cy) / 96;
      if (fx * fx + fy * fy <= 1) {
        const t = (y - 60) / 240;
        r = 242 - t * 26;
        g = 202 - t * 34;
        b = 176 - t * 30;
      }
      // 头发
      const hy = (y - 78) / 52;
      const hx = (x - cx) / 88;
      if (hy * hy + hx * hx <= 1 && y < 96) {
        r = 74; g = 54; b = 42;
      }
      // 眼睛
      const e1 = Math.hypot(x - 122, y - 152);
      const e2 = Math.hypot(x - 178, y - 152);
      if (e1 < 11 || e2 < 11) { r = 40; g = 36; b = 34; }
      if (e1 < 5 || e2 < 5) { r = 250; g = 250; b = 250; }
      // 嘴
      const m = Math.hypot((x - 150) / 22, (y - 208) / 8);
      if (m < 1) { r = 178; g = 92; b = 88; }

      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }

  const pattern = Core.convertPhoto(img, {
    targetWidth: 48,
    targetHeight: 48,
    colorCount: 20,
    series,
  });

  const left = canvas(W, H);
  left.d = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  const right = renderPattern(pattern, 6);
  const merged = sideBySide(left, right);
  fs.writeFileSync(path.join(outDir, 'demo-portrait.png'), encodePng(merged.w, merged.h, merged.d));
  console.log(`demo-portrait.png  ${pattern.stats.colorCount} 色 / ${pattern.stats.total} 颗`);
}

// ---------- 场景 2：几何色块（测边界与细线）----------
{
  const W = 300;
  const H = 300;
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      let r = 248, g = 246, b = 242;
      // 圆
      if (Math.hypot(x - 95, y - 100) < 62) { r = 226; g = 88; b = 66; }
      // 方
      if (x > 170 && x < 265 && y > 45 && y < 140) { r = 52; g = 110; b = 180; }
      // 三角
      if (y > 175 && y < 265 && Math.abs(x - 150) < (265 - y) * 1.1) { r = 62; g = 148; b = 92; }
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }

  const pattern = Core.convertPhoto(img, {
    targetWidth: 48,
    targetHeight: 48,
    colorCount: 8,
    series,
  });

  const left = canvas(W, H);
  left.d = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  const right = renderPattern(pattern, 6);
  const merged = sideBySide(left, right);
  fs.writeFileSync(path.join(outDir, 'demo-shapes.png'), encodePng(merged.w, merged.h, merged.d));
  console.log(`demo-shapes.png  ${pattern.stats.colorCount} 色 / ${pattern.stats.total} 颗`);
}

// ---------- 场景 3：像素图 1:1 导入 ----------
{
  const N = 16;
  const S = 18;
  const img = { width: N * S, height: N * S, data: new Uint8ClampedArray(N * S * N * S * 4) };
  const cells = [
    '................',
    '..###......###..',
    '.#####....#####.',
    '.#####....#####.',
    '..############..',
    '.###..####..###.',
    '.###..####..###.',
    '.##############.',
    '.####.######.####',
    '.##############.',
    '.###..####..###.',
    '..###.####.###..',
    '...##########...',
    '....########....',
    '.....######.....',
    '................',
  ];
  const pal = { '.': [255, 255, 255], '#': [232, 161, 92] };
  for (let y = 0; y < N * S; y++) {
    for (let x = 0; x < N * S; x++) {
      const p = (y * N * S + x) * 4;
      const c = pal[cells[Math.floor(y / S)][Math.floor(x / S)]];
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = 255;
    }
  }

  const pattern = Core.convertImport(img, { gridSize: S, series });
  const left = canvas(N * S, N * S);
  left.d = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  const right = renderPattern(pattern, 8);
  const merged = sideBySide(left, right);
  fs.writeFileSync(path.join(outDir, 'demo-pixel.png'), encodePng(merged.w, merged.h, merged.d));
  console.log(`demo-pixel.png  ${pattern.width}×${pattern.height} 格 / ${pattern.stats.colorCount} 色`);
}

console.log('\n输出目录：docs/images/');
