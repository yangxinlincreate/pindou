import { describe, it, expect } from 'vitest';
import type { CatalogColor, ColorSeries, RasterImage } from '../src/types';
import { EMPTY_CELL } from '../src/types';
import { hexToLab } from '../src/color/space';
import { detectGridSize, analyzeImage, countColors } from '../src/image/detect';
import { importPixelArt } from '../src/importer/importPixelArt';
import { convertPhoto, convertImport } from '../src/pattern/builder';

/** 构造一个测试用色卡 */
function makeCatalog(): CatalogColor[] {
  const defs: Array<[string, string, string]> = [
    ['A1', '#FFFFFF', '白色'],
    ['A2', '#000000', '黑色'],
    ['B1', '#E23A2E', '正红'],
    ['C1', '#F2A65A', '橙'],
    ['D1', '#F5D547', '黄'],
    ['E1', '#4A9B54', '绿'],
    ['G1', '#2F6FB5', '蓝'],
    ['K1', '#E8B48C', '肤色'],
  ];
  return defs.map(([code, hex, name]) => ({
    id: `test:${code}`,
    code,
    name,
    hex,
    lab: hexToLab(hex),
  }));
}

function makeSeries(colors: CatalogColor[]): ColorSeries {
  return {
    id: 'test-8',
    brandName: 'TEST',
    beadSize: 5,
    version: 'test',
    colors,
  };
}

/** 用逻辑图案 + 放大倍数造一张「像素图」 */
function makePixelRaster(
  cells: string[][],
  scale: number,
  palette: Record<string, string>,
  alphaForEmpty = 0,
): RasterImage {
  const n = cells.length;
  const W = n * scale;
  const H = n * scale;
  const data = new Uint8ClampedArray(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const key = cells[Math.floor(y / scale)][Math.floor(x / scale)];
      const p = (y * W + x) * 4;
      if (!key) {
        data[p + 3] = alphaForEmpty;
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

const COLORS: Record<string, string> = {
  w: '#FFFFFF',
  k: '#000000',
  r: '#E23A2E',
  o: '#F2A65A',
  y: '#F5D547',
  g: '#4A9B54',
  b: '#2F6FB5',
  s: '#E8B48C',
};

/** 一个 16×16 的测试图案：白底、一个红色方块、几个散点 */
function makeTestCells(): string[][] {
  const n = 16;
  const cells: string[][] = [];
  for (let y = 0; y < n; y++) {
    const row: string[] = [];
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

describe('像素图格子识别', () => {
  it('各种放大倍数都能识别出来', () => {
    const cells = makeTestCells();
    for (const scale of [2, 3, 4, 6, 8, 10]) {
      const img = makePixelRaster(cells, scale, COLORS);
      const g = detectGridSize(img);
      expect(g, `scale=${scale}`).not.toBeNull();
      expect(g!.gridSize, `scale=${scale}`).toBe(scale);
      expect(g!.width).toBe(16);
      expect(g!.height).toBe(16);
    }
  });

  it('颜色数统计正确', () => {
    const img = makePixelRaster(makeTestCells(), 4, COLORS);
    expect(countColors(img)).toBe(5); // 白 红 黄 蓝 绿
  });

  it('自动判断为直接导入', () => {
    const img = makePixelRaster(makeTestCells(), 8, COLORS);
    const a = analyzeImage(img);
    expect(a.suggestMode).toBe('import');
    expect(a.grid?.gridSize).toBe(8);
  });
});

describe('直接导入 1:1 还原', () => {
  it('放大 8 倍后导入，逐格完全一致', () => {
    const cells = makeTestCells();
    const scale = 8;
    const img = makePixelRaster(cells, scale, COLORS);
    const catalog = makeCatalog();

    const result = importPixelArt(img, scale, catalog);

    expect(result.width).toBe(16);
    expect(result.height).toBe(16);

    // 每种原色都应该映射到色卡里最接近的那个（这里是对应色号）
    const codeOf = (x: number, y: number) => result.palette[result.cells[y * 16 + x]].code;
    const expected: Record<string, string> = {
      w: 'A1',
      k: 'A2',
      r: 'B1',
      o: 'C1',
      y: 'D1',
      g: 'E1',
      b: 'G1',
      s: 'K1',
    };

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(codeOf(x, y), `(${x},${y})`).toBe(expected[cells[y][x]]);
      }
    }
  });

  it('透明区域变成空格，不计入用量', () => {
    const cells = makeTestCells().map((row, y) =>
      row.map((c, x) => (y === 0 ? '' : c)),
    );
    const img = makePixelRaster(cells, 4, COLORS);
    const result = importPixelArt(img, 4, makeCatalog());

    expect(result.emptyCells).toBe(16);
    const total = result.counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(16 * 15);

    for (let x = 0; x < 16; x++) {
      expect(result.cells[0 * 16 + x]).toBe(EMPTY_CELL);
    }
  });

  it('同一颜色被映射到同一条 palette，不重复', () => {
    const cells = makeTestCells();
    const img = makePixelRaster(cells, 6, COLORS);
    const result = importPixelArt(img, 6, makeCatalog());

    const ids = result.palette.map((p) => p.colorId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.palette.length).toBe(5);
  });

  it('convertImport 产出的图纸结构完整', () => {
    const img = makePixelRaster(makeTestCells(), 8, COLORS);
    const pattern = convertImport(img, {
      gridSize: 8,
      series: makeSeries(makeCatalog()),
    });

    expect(pattern.mode).toBe('import');
    expect(pattern.width).toBe(16);
    expect(pattern.height).toBe(16);
    expect(pattern.stats.total).toBe(256);
    expect(pattern.stats.boardsTotal).toBe(1);
    expect(pattern.stats.widthCm).toBe(8); // 16 × 5mm = 80mm
    // palette 按用量降序
    for (let i = 1; i < pattern.palette.length; i++) {
      expect(pattern.palette[i - 1].count).toBeGreaterThanOrEqual(pattern.palette[i].count);
    }
  });
});

describe('照片模式', () => {
  function makePhotoLike(): RasterImage {
    const W = 120;
    const H = 90;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4;
        // 渐变 + 一个圆形区域，模拟照片
        const inCircle = Math.hypot(x - 60, y - 45) < 28;
        data[p] = inCircle ? 30 + (x / W) * 60 : (x / W) * 235;
        data[p + 1] = inCircle ? 140 + (y / H) * 50 : (y / H) * 220;
        data[p + 2] = inCircle ? 80 : 200 - (x / W) * 120;
        data[p + 3] = 255;
      }
    }
    return { width: W, height: H, data };
  }

  it('能生成合法图纸，色数不超过目标', () => {
    const pattern = convertPhoto(makePhotoLike(), {
      targetWidth: 32,
      targetHeight: 24,
      colorCount: 12,
      series: makeSeries(makeCatalog()),
    });

    expect(pattern.width).toBe(32);
    expect(pattern.height).toBe(24);
    expect(pattern.cells.length).toBe(32 * 24);
    expect(pattern.palette.length).toBeGreaterThan(1);
    expect(pattern.palette.length).toBeLessThanOrEqual(12);
    expect(pattern.stats.total).toBe(32 * 24);

    const sum = pattern.palette.reduce((a, p) => a + p.count, 0);
    expect(sum).toBe(pattern.stats.total);
  });

  it('确定性：同样输入两次结果一致', () => {
    const opts = {
      targetWidth: 24,
      targetHeight: 24,
      colorCount: 8,
      series: makeSeries(makeCatalog()),
    };
    const a = convertPhoto(makePhotoLike(), opts);
    const b = convertPhoto(makePhotoLike(), opts);
    expect(a.palette.map((p) => p.code)).toEqual(b.palette.map((p) => p.code));
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
  });

  it('套装约束：只用套装里的颜色', () => {
    const catalog = makeCatalog();
    const pattern = convertPhoto(makePhotoLike(), {
      targetWidth: 20,
      targetHeight: 20,
      colorCount: 8,
      series: makeSeries(catalog),
      setCodes: ['A1', 'A2', 'B1'],
    });

    for (const p of pattern.palette) {
      expect(['A1', 'A2', 'B1']).toContain(p.code);
      expect(p.owned).toBe(true);
    }
  });

  it('目标色数大于可用色数时不报错', () => {
    const pattern = convertPhoto(makePhotoLike(), {
      targetWidth: 16,
      targetHeight: 16,
      colorCount: 64,
      series: makeSeries(makeCatalog()),
    });
    expect(pattern.palette.length).toBeLessThanOrEqual(8);
  });
});
