/**
 * 生成程序化测试图（不依赖网络）。
 * 用来测特定场景：像素图导入、色彩还原、边界、渐变。
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

function canvas(w, h) {
  return { w, h, d: Buffer.alloc(w * h * 4) };
}

function setPx(cv, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  cv.d[i] = r;
  cv.d[i + 1] = g;
  cv.d[i + 2] = b;
  cv.d[i + 3] = a;
}

function fill(cv, x0, y0, w, h, hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(cv, x, y, r, g, b);
}

const outDir = path.resolve('test-images');
fs.mkdirSync(outDir, { recursive: true });

// ---------- 1. 像素图（测直接导入）----------
{
  const N = 16;
  const S = 20;
  const cv = canvas(N * S, N * S);
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
  const pal = { '.': '#FFFFFF', '#': '#E8A15C' };
  for (let y = 0; y < N * S; y++) {
    for (let x = 0; x < N * S; x++) {
      const c = cells[Math.floor(y / S)][Math.floor(x / S)];
      const n = parseInt(pal[c].slice(1), 16);
      setPx(cv, x, y, (n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
  }
  fs.writeFileSync(path.join(outDir, 'gen-pixel-16x16.png'), encodePng(cv.w, cv.h, cv.d));
}

// ---------- 2. 色卡对照（测色彩还原）----------
{
  const series = JSON.parse(fs.readFileSync('apps/web/public/data/mard-221.json', 'utf8'));
  const cols = 15;
  const cell = 24;
  const rows = Math.ceil(series.colors.length / cols);
  const cv = canvas(cols * cell, rows * cell);
  fill(cv, 0, 0, cv.w, cv.h, '#FFFFFF');
  series.colors.forEach((c, i) => {
    const gx = (i % cols) * cell;
    const gy = Math.floor(i / cols) * cell;
    fill(cv, gx + 1, gy + 1, cell - 2, cell - 2, c.hex);
  });
  fs.writeFileSync(path.join(outDir, 'gen-colorchart.png'), encodePng(cv.w, cv.h, cv.d));
}

// ---------- 3. 高对比几何（测边界与色块）----------
{
  const W = 480;
  const H = 480;
  const cv = canvas(W, H);
  fill(cv, 0, 0, W, H, '#FFFFFF');
  // 黑白棋盘
  const q = 60;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if ((x + y) % 2 === 0) fill(cv, x * q, y * q, q, q, '#1C1B1A');
    }
  }
  // 四个纯色块
  fill(cv, 0, H - 180, 120, 180, '#E23A2E');
  fill(cv, 120, H - 180, 120, 180, '#2F6FB5');
  fill(cv, 240, H - 180, 120, 180, '#4A9B54');
  fill(cv, 360, H - 180, 120, 180, '#F5D547');
  // 细线（测细节保留）
  for (let i = 0; i < 20; i++) fill(cv, 240 + i * 12, 240, 3, 60, '#1C1B1A');
  fs.writeFileSync(path.join(outDir, 'gen-geometry.png'), encodePng(cv.w, cv.h, cv.d));
}

// ---------- 4. 渐变（测色带与色阶）----------
{
  const W = 480;
  const H = 240;
  const cv = canvas(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = x / W;
      // 上半天色，下天地面
      if (y < H / 2) {
        setPx(cv, x, y, Math.round(120 + t * 110), Math.round(170 + t * 60), Math.round(235 - t * 40));
      } else {
        setPx(cv, x, y, Math.round(90 + t * 120), Math.round(120 + t * 90), Math.round(70 + t * 60));
      }
    }
  }
  fs.writeFileSync(path.join(outDir, 'gen-gradient.png'), encodePng(cv.w, cv.h, cv.d));
}

// ---------- 5. 透明背景（测 alpha 处理）----------
{
  const W = 240;
  const H = 240;
  const cv = canvas(W, H);
  // 中间一个圆，其余透明
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 90) setPx(cv, x, y, 255, 107, 53, 255);
    }
  }
  fs.writeFileSync(path.join(outDir, 'gen-transparent.png'), encodePng(cv.w, cv.h, cv.d));
}

console.log('已生成：');
for (const f of fs.readdirSync(outDir).filter((x) => x.startsWith('gen-'))) {
  const sz = fs.statSync(path.join(outDir, f)).size;
  console.log(`  ${f}  ${(sz / 1024).toFixed(1)} KB`);
}
