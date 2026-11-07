import type { RasterImage } from '@pindou/core';

/** 示例图的逻辑尺寸与放大倍数 */
export const SAMPLE_GRID = 32;
export const SAMPLE_SCALE = 10;

const PALETTE: Record<string, string> = {
  body: '#F2A65A',
  edge: '#D9633F',
  eye: '#3D3A38',
  nose: '#E88CA0',
  blush: '#F09B7A',
  hi: '#FFFFFF',
  ear: '#E88F4E',
};

function inTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** 生成 32×32 的猫脸图案，返回每格的调色板 key */
export function buildSampleCells(): string[][] {
  const N = SAMPLE_GRID;
  const grid: string[][] = [];

  for (let y = 0; y < N; y++) {
    const row: string[] = [];
    for (let x = 0; x < N; x++) {
      let key = '';

      // 耳朵（先判断，头会盖住下半部分）
      if (inTriangle(x, y, 5, 13, 9, 2, 14, 12)) key = 'edge';
      if (inTriangle(x, y, 7, 12, 9.5, 4, 12.5, 11)) key = 'ear';
      if (inTriangle(x, y, 26, 13, 22, 2, 17, 12)) key = 'edge';
      if (inTriangle(x, y, 24, 12, 21.5, 4, 18.5, 11)) key = 'ear';

      // 头
      const dx = (x - 15.5) / 11;
      const dy = (y - 19) / 8.6;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        key = d > 0.8 ? 'edge' : 'body';
      }

      // 腮红
      if (Math.hypot((x - 10) / 2.4, (y - 21) / 1.5) <= 1) key = 'blush';
      if (Math.hypot((x - 21) / 2.4, (y - 21) / 1.5) <= 1) key = 'blush';

      // 眼睛
      if (Math.hypot((x - 11) / 1.7, (y - 17) / 2.1) <= 1) key = 'eye';
      if (Math.hypot((x - 20) / 1.7, (y - 17) / 2.1) <= 1) key = 'eye';
      // 高光
      if (x === 11 && y === 16) key = 'hi';
      if (x === 20 && y === 16) key = 'hi';

      // 鼻子
      if (y === 21 && (x === 15 || x === 16)) key = 'nose';
      if (y === 22 && x === 15) key = 'nose';

      // 嘴
      if (y === 23 && (x === 14 || x === 17)) key = 'edge';
      if (y === 24 && (x === 15 || x === 16)) key = 'edge';

      row.push(key);
    }
    grid.push(row);
  }

  return grid;
}

/** 把逻辑图案放大成 RasterImage（最近邻，边缘硬） */
export function makeSampleRaster(): RasterImage {
  const N = SAMPLE_GRID;
  const s = SAMPLE_SCALE;
  const W = N * s;
  const H = N * s;
  const data = new Uint8ClampedArray(W * H * 4);
  const cells = buildSampleCells();

  for (let y = 0; y < H; y++) {
    const gy = Math.floor(y / s);
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / s);
      const key = cells[gy][gx];
      const p = (y * W + x) * 4;

      if (!key) {
        data[p + 3] = 0; // 透明
        continue;
      }

      const hex = PALETTE[key] ?? '#CCCCCC';
      const n = parseInt(hex.slice(1), 16);
      data[p] = (n >> 16) & 255;
      data[p + 1] = (n >> 8) & 255;
      data[p + 2] = n & 255;
      data[p + 3] = 255;
    }
  }

  return { width: W, height: H, data };
}

/**
 * 照片示例：一张有五官、渐变、边缘的测试人像。
 *
 * 为什么要专门造这张图：之前的示例是个 32×32 像素画，
 * 打开就显示 32×32 的大色块，很容易让人以为「算法糊」，
 * 其实那是像素图的原始分辨率，走的是直接导入。
 * 这张图走照片模式，能真实反映「照片转图纸」的效果。
 */
export function makePhotoSample(size = 480): RasterImage {
  const W = size;
  const H = size;
  const data = new Uint8ClampedArray(W * H * 4);
  const cx = W / 2;
  const cy = H * 0.52;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;

      // 背景：接近纯色（真实照片的背景通常是一大片相近色，不是对角渐变，
      // 之前用渐变做过，量化后会出现斜向色带，看起来很脏）
      let r = 234;
      let g = 228;
      let b = 217;

      // 头发
      const hx = (x - cx) / (W * 0.42);
      const hy = (y - (cy - 0.1 * H)) / (H * 0.44);
      if (hx * hx + hy * hy <= 1 && y < cy - 0.02 * H) {
        r = 66 + (x / W) * 16;
        g = 54;
        b = 48;
      }

      // 脸（带一点纵向渐变，模拟光照；幅度控制小一点，避免量化后硬分界）
      const fx = (x - cx) / (W * 0.33);
      const fy = (y - cy) / (H * 0.38);
      if (fx * fx + fy * fy <= 1) {
        const t = fy;
        r = 241 - t * 10;
        g = 200 - t * 14;
        b = 175 - t * 12;
        // 右侧一点阴影
        if (x > cx) {
          r -= 4;
          g -= 5;
          b -= 4;
        }
      }

      // 眼睛
      const eyeL = Math.hypot((x - (cx - 0.095 * W)) / (0.04 * W), (y - (cy - 0.05 * H)) / (0.05 * H));
      const eyeR = Math.hypot((x - (cx + 0.095 * W)) / (0.04 * W), (y - (cy - 0.05 * H)) / (0.05 * H));
      if (eyeL <= 1 || eyeR <= 1) {
        r = 40;
        g = 36;
        b = 34;
      }

      // 眼神光
      if (Math.hypot(x - (cx - 0.108 * W), y - (cy - 0.072 * H)) < 0.014 * W) {
        r = 255;
        g = 255;
        b = 255;
      }
      if (Math.hypot(x - (cx + 0.082 * W), y - (cy - 0.072 * H)) < 0.014 * W) {
        r = 255;
        g = 255;
        b = 255;
      }

      // 嘴
      const mouth = Math.hypot((x - cx) / (0.11 * W), (y - (cy + 0.16 * H)) / (0.045 * H));
      if (Math.abs(mouth - 1) < 0.16 && y > cy + 0.14 * H) {
        r = 174;
        g = 94;
        b = 94;
      }

      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }

  return { width: W, height: H, data };
}

