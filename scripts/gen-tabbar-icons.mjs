/**
 * 生成 tabBar 图标（81×81 PNG）。
 * 不依赖任何图像库，直接手写 PNG 编码（zlib 在 Node 内置）。
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

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

// ---------- 画布 ----------

const S = 81;

function createCanvas() {
  return { w: S, h: S, data: Buffer.alloc(S * S * 4) };
}

function setPx(cv, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  const ia = a / 255;
  const dstA = cv.data[i + 3] / 255;
  const outA = ia + dstA * (1 - ia);
  if (outA === 0) return;
  cv.data[i] = Math.round((r * ia + cv.data[i] * dstA * (1 - ia)) / outA);
  cv.data[i + 1] = Math.round((g * ia + cv.data[i + 1] * dstA * (1 - ia)) / outA);
  cv.data[i + 2] = Math.round((b * ia + cv.data[i + 2] * dstA * (1 - ia)) / outA);
  cv.data[i + 3] = Math.round(outA * 255);
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 抗锯齿圆点 */
function dot(cv, cx, cy, radius, rgb) {
  const [r, g, b] = rgb;
  const R = Math.ceil(radius + 1);
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.max(0, Math.min(1, radius + 0.5 - d));
      if (a > 0) setPx(cv, x, y, r, g, b, Math.round(a * 255));
    }
  }
}

/** 抗锯齿圆角矩形 */
function roundRect(cv, x0, y0, w, h, radius, rgb) {
  const [r, g, b] = rgb;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + radius - x - 0.5, 0, x + 0.5 - (x0 + w - radius));
      const dy = Math.max(y0 + radius - y - 0.5, 0, y + 0.5 - (y0 + h - radius));
      const d = Math.hypot(dx, dy);
      const a = d <= radius ? Math.min(1, radius - d + 0.5) : 0;
      if (a > 0) setPx(cv, x, y, r, g, b, Math.round(a * 255));
    }
  }
}

// ---------- 三个图标 ----------

function iconGrid(color) {
  const cv = createCanvas();
  const rgb = hexRgb(color);
  for (const y of [22, 40.5, 59]) for (const x of [22, 40.5, 59]) dot(cv, x, y, 7.5, rgb);
  return cv;
}

function iconPalette(color) {
  const cv = createCanvas();
  const rgb = hexRgb(color);
  roundRect(cv, 15, 15, 23, 23, 6, rgb);
  roundRect(cv, 43, 15, 23, 23, 6, rgb);
  roundRect(cv, 15, 43, 23, 23, 6, rgb);
  roundRect(cv, 43, 43, 23, 23, 6, rgb);
  return cv;
}

function iconUser(color) {
  const cv = createCanvas();
  const rgb = hexRgb(color);
  // 头
  dot(cv, 40.5, 28, 12.5, rgb);
  // 肩：横向半个椭圆
  for (let y = 46; y < 68; y++) {
    for (let x = 16; x < 65; x++) {
      const dx = (x + 0.5 - 40.5) / 22;
      const dy = (y + 0.5 - 68) / 22;
      const d = Math.hypot(dx, dy);
      const a = d <= 1 ? Math.min(1, (1 - d) * 22 + 0.5) : 0;
      if (a > 0 && y >= 46) {
        const [r, g, b] = rgb;
        setPx(cv, x, y, r, g, b, Math.round(Math.min(1, a) * 255));
      }
    }
  }
  return cv;
}

// ---------- 输出 ----------

const dir = path.resolve('apps/uni/src/static/tabbar');
fs.mkdirSync(dir, { recursive: true });

const GRAY = '#A8A29E';
const ACTIVE = '#FF6B35';

const jobs = [
  ['make', iconGrid, GRAY],
  ['make-on', iconGrid, ACTIVE],
  ['palette', iconPalette, GRAY],
  ['palette-on', iconPalette, ACTIVE],
  ['mine', iconUser, GRAY],
  ['mine-on', iconUser, ACTIVE],
];

for (const [name, fn, color] of jobs) {
  const cv = fn(color);
  const png = encodePng(cv.w, cv.h, cv.data);
  fs.writeFileSync(path.join(dir, name + '.png'), png);
  console.log(`  ${name}.png  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\n输出目录：${dir}`);
