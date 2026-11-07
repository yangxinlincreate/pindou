/**
 * 算法验证脚本（不依赖测试框架）。
 *
 * 用途：在没有 vitest 缓存写入权限的环境里，直接跑核心断言。
 * 用法：node scripts/verify-algo.mjs
 */
import * as Core from '../tmp/core.mjs';

const { hexToLab, detectGridSize, analyzeImage, countColors, importPixelArt, convertPhoto, convertImport, EMPTY_CELL } =
  Core;

let pass = 0;
let fail = 0;
const fails = [];

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  FAIL  ${name}  ${extra}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

// ---------- 素材 ----------

const COLORS = {
  w: '#FFFFFF',
  k: '#000000',
  r: '#E23A2E',
  o: '#F2A65A',
  y: '#F5D547',
  g: '#4A9B54',
  b: '#2F6FB5',
  s: '#E8B48C',
};

function makeCatalog() {
  const defs = [
    ['A1', '#FFFFFF', '白色'],
    ['A2', '#000000', '黑色'],
    ['B1', '#E23A2E', '正红'],
    ['C1', '#F2A65A', '橙'],
    ['D1', '#F5D547', '黄'],
    ['E1', '#4A9B54', '绿'],
    ['G1', '#2F6FB5', '蓝'],
    ['K1', '#E8B48C', '肤色'],
  ];
  return defs.map(([code, hex, name]) => ({ id: `test:${code}`, code, name, hex, lab: hexToLab(hex) }));
}

const SERIES = { id: 'test', brandName: 'TEST', beadSize: 5, version: 'test', colors: makeCatalog() };

function makePixelRaster(cells, scale, palette) {
  const n = cells.length;
  const W = n * scale;
  const H = n * scale;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const key = cells[Math.floor(y / scale)][Math.floor(x / scale)];
      const p = (y * W + x) * 4;
      if (!key) {
        data[p + 3] = 0;
        continue;
      }
      const v = parseInt(palette[key].slice(1), 16);
      data[p] = (v >> 16) & 255;
      data[p + 1] = (v >> 8) & 255;
      data[p + 2] = v & 255;
      data[p + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

function makeTestCells() {
  const n = 16;
  const cells = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) {
      let c = 'w';
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) c = 'r';
      if (x === 6 && y === 6) c = 'y';
      if (x === 9 && y === 9) c = 'b';
      if (y === 2 && x === 2) c = 'g';
      row.push(c);
    }
    cells.push(row);
  }
  return cells;
}

function makePhotoLike() {
  const W = 120;
  const H = 90;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const inCircle = Math.hypot(x - 60, y - 45) < 28;
      data[p] = inCircle ? 30 + (x / W) * 60 : (x / W) * 235;
      data[p + 1] = inCircle ? 140 + (y / H) * 50 : (y / H) * 220;
      data[p + 2] = inCircle ? 80 : 200 - (x / W) * 120;
      data[p + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

// ---------- 1. 格子识别 ----------
group('格子识别');
for (const scale of [2, 3, 4, 6, 8, 10]) {
  const img = makePixelRaster(makeTestCells(), scale, COLORS);
  const g = detectGridSize(img);
  ok(`放大 ${scale} 倍 → 识别为 ${scale}`, g && g.gridSize === scale, g ? `实际 ${g.gridSize}` : '返回 null');
}

const t = makePixelRaster(makeTestCells(), 4, COLORS);
ok('颜色数统计 = 5', countColors(t) === 5, `实际 ${countColors(t)}`);
ok('自动判断为直接导入', analyzeImage(t).suggestMode === 'import');

// ---------- 2. 导入 1:1 ----------
group('直接导入 1:1 还原');
{
  const cells = makeTestCells();
  const img = makePixelRaster(cells, 8, COLORS);
  const r = importPixelArt(img, 8, makeCatalog());

  ok('尺寸 16 × 16', r.width === 16 && r.height === 16, `${r.width}×${r.height}`);

  const expected = { w: 'A1', k: 'A2', r: 'B1', o: 'C1', y: 'D1', g: 'E1', b: 'G1', s: 'K1' };
  let mismatch = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const code = r.palette[r.cells[y * 16 + x]].code;
      if (code !== expected[cells[y][x]]) mismatch++;
    }
  }
  ok('逐格 100% 一致', mismatch === 0, `${mismatch} 格不一致`);
  ok('调色板无重复色号', new Set(r.palette.map((p) => p.colorId)).size === r.palette.length);
}

// ---------- 3. 透明 ----------
group('透明通道');
{
  const cells = makeTestCells().map((row, y) => row.map((c) => (y === 0 ? '' : c)));
  const img = makePixelRaster(cells, 4, COLORS);
  const r = importPixelArt(img, 4, makeCatalog());
  ok('第一行全部为空格', [...Array(16)].every((_, x) => r.cells[x] === EMPTY_CELL));
  ok('空格数 = 16', r.emptyCells === 16, `实际 ${r.emptyCells}`);
  ok('用量不含空格', r.counts.reduce((a, b) => a + b, 0) === 16 * 15);
}

// ---------- 4. 照片模式 ----------
group('照片模式');
{
  const p = convertPhoto(makePhotoLike(), {
    targetWidth: 32,
    targetHeight: 24,
    colorCount: 12,
    series: SERIES,
  });
  ok('尺寸 32 × 24', p.width === 32 && p.height === 24);
  ok('色数 ≤ 12 且 > 1', p.palette.length > 1 && p.palette.length <= 12, `${p.palette.length} 色`);
  ok('总颗数 = 768', p.stats.total === 768, `${p.stats.total}`);
  ok('用量合计 = 总颗数', p.palette.reduce((a, x) => a + x.count, 0) === p.stats.total);
  ok('palette 按用量降序', p.palette.every((x, i) => i === 0 || p.palette[i - 1].count >= x.count));
  ok('成品尺寸 16cm', p.stats.widthCm === 16, `${p.stats.widthCm}`);

  const a = convertPhoto(makePhotoLike(), { targetWidth: 24, targetHeight: 24, colorCount: 8, series: SERIES });
  const b = convertPhoto(makePhotoLike(), { targetWidth: 24, targetHeight: 24, colorCount: 8, series: SERIES });
  ok('同输入结果确定一致', JSON.stringify(a.palette.map((x) => x.code)) === JSON.stringify(b.palette.map((x) => x.code)));
}

// ---------- 5. 套装约束 ----------
group('套装约束');
{
  const p = convertPhoto(makePhotoLike(), {
    targetWidth: 20,
    targetHeight: 20,
    colorCount: 8,
    series: SERIES,
    setCodes: ['A1', 'A2', 'B1'],
  });
  ok('只用套装内 3 色', p.palette.every((x) => ['A1', 'A2', 'B1'].includes(x.code)), p.palette.map((x) => x.code).join(','));
  ok('全部标记为已有', p.palette.every((x) => x.owned === true));
}

// ---------- 6. 边界 ----------
group('边界情况');
{
  const p = convertPhoto(makePhotoLike(), { targetWidth: 16, targetHeight: 16, colorCount: 64, series: SERIES });
  ok('目标色数超过可用色数不报错', p.palette.length <= 8);

  const big = convertPhoto(makePhotoLike(), { targetWidth: 200, targetHeight: 150, colorCount: 32, series: SERIES });
  ok('200×150 能生成', big.width === 200 && big.height === 150);

  const t0 = performance.now();
  convertPhoto(makePhotoLike(), { targetWidth: 200, targetHeight: 150, colorCount: 48, series: SERIES });
  const ms = performance.now() - t0;
  ok(`200×150 / 48 色耗时 ${ms.toFixed(0)}ms < 3000ms`, ms < 3000);
}

// ---------- 汇总 ----------
console.log(`\n${'='.repeat(46)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log('失败项：');
  fails.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
