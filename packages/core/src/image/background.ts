import type { RasterImage } from '../types';
import { rgbToLab } from '../color/space';

export interface BgRemoveOptions {
  /** 颜色容差（Lab 欧氏距离），越大剔除越激进 */
  tolerance?: number;
  /** 背景占比超过这个值就当误判，整体放弃 */
  maxRatio?: number;
  /** 背景占比低于这个值说明没有明显背景 */
  minRatio?: number;
}

export interface BgRemoveResult {
  /** 1 = 背景，0 = 主体。长度 = width * height */
  mask: Uint8Array;
  /** 背景占比 */
  ratio: number;
  /** 是否成功剔除（=false 时 mask 全 0，调用方应忽略） */
  ok: boolean;
  reason?: string;
}

/**
 * 去除背景（本地算法，不上传图片）。
 *
 * 原理：从图像四边采样背景色，然后从边缘向内做泛洪填充，
 * 把与背景色接近且连通的像素标记为背景。
 *
 * 为什么是泛洪而不是全局色差：
 *   全局判断会把主体内部同色区域（白衣服、白墙后的白猫）一起删掉。
 *   从边缘连通扩散，只能吃掉「和外界相连」的区域，安全得多。
 *
 * 局限（必须如实告诉用户）：
 *   纯色、渐变、简单几何背景效果好；
 *   毛发边缘、复杂多色背景、主体贴边等情况会失败。
 */
export function removeBackground(
  img: RasterImage,
  opts: BgRemoveOptions = {},
): BgRemoveResult {
  const tol = opts.tolerance ?? 16;
  const tolSq = tol * tol;
  const maxRatio = opts.maxRatio ?? 0.85;
  const minRatio = opts.minRatio ?? 0.02;

  const { width: w, height: h, data } = img;
  const n = w * h;
  if (n === 0) return { mask: new Uint8Array(0), ratio: 0, ok: false, reason: '空图' };

  // 1. 预计算 Lab
  const labs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const lab = rgbToLab(data[p], data[p + 1], data[p + 2]);
    labs[i * 3] = lab.L;
    labs[i * 3 + 1] = lab.a;
    labs[i * 3 + 2] = lab.b;
  }

  // 2. 四边采样，量化后取出现最多的颜色作为背景种子
  const buckets = new Map<number, { count: number; L: number; a: number; b: number }>();

  const sampleEdge = (x: number, y: number) => {
    const i = y * w + x;
    if (data[i * 4 + 3] < 128) return;
    const L = labs[i * 3];
    const a = labs[i * 3 + 1];
    const b = labs[i * 3 + 2];
    const key = (Math.round(L / 8) & 63) * 4096 + (Math.round((a + 128) / 8) & 63) * 64 + (Math.round((b + 128) / 8) & 63);
    const cur = buckets.get(key);
    if (cur) {
      cur.count++;
      cur.L += L;
      cur.a += a;
      cur.b += b;
    } else {
      buckets.set(key, { count: 1, L, a, b });
    }
  };

  // 只在四个角采样：主体通常在画面中间，边缘中间段可能是主体（比如贴边的人像）
  const bandW = Math.max(6, Math.floor(w * 0.14));
  const bandH = Math.max(6, Math.floor(h * 0.14));
  const stepX = Math.max(1, Math.floor(bandW / 24));
  const stepY = Math.max(1, Math.floor(bandH / 24));

  for (let y = 0; y < bandH; y += stepY) {
    for (let x = 0; x < bandW; x += stepX) {
      sampleEdge(x, y);
      sampleEdge(w - 1 - x, y);
      sampleEdge(x, h - 1 - y);
      sampleEdge(w - 1 - x, h - 1 - y);
    }
  }

  if (buckets.size === 0) {
    return { mask: new Uint8Array(n), ratio: 0, ok: false, reason: '边缘全是透明像素' };
  }

  // 取前两个种子（应对双色背景，如天空 + 地面）
  const seeds = [...buckets.values()]
    .sort((x, y) => y.count - x.count)
    .slice(0, 2)
    .map((c) => ({ L: c.L / c.count, a: c.a / c.count, b: c.b / c.count }));

  // 3. 从边缘泛洪
  const mask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const nearSeed = (i: number): boolean => {
    const L = labs[i * 3];
    const a = labs[i * 3 + 1];
    const b = labs[i * 3 + 2];
    for (let s = 0; s < seeds.length; s++) {
      const dL = L - seeds[s].L;
      const da = a - seeds[s].a;
      const db = b - seeds[s].b;
      if (dL * dL + da * da + db * db <= tolSq) return true;
    }
    return false;
  };

  // 边缘入队
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (!mask[i] && data[i * 4 + 3] >= 128 && nearSeed(i)) {
        mask[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      if (!mask[i] && data[i * 4 + 3] >= 128 && nearSeed(i)) {
        mask[i] = 1;
        queue[tail++] = i;
      }
    }
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;

    if (x + 1 < w && !mask[i + 1] && nearSeed(i + 1)) { mask[i + 1] = 1; queue[tail++] = i + 1; }
    if (x > 0 && !mask[i - 1] && nearSeed(i - 1)) { mask[i - 1] = 1; queue[tail++] = i - 1; }
    if (y + 1 < h && !mask[i + w] && nearSeed(i + w)) { mask[i + w] = 1; queue[tail++] = i + w; }
    if (y > 0 && !mask[i - w] && nearSeed(i - w)) { mask[i - w] = 1; queue[tail++] = i - w; }
  }

  let bg = 0;
  for (let i = 0; i < n; i++) bg += mask[i];
  const ratio = bg / n;

  // 4. 合理性检查
  if (ratio < minRatio) {
    return { mask: new Uint8Array(n), ratio, ok: false, reason: '没找到明显背景' };
  }
  if (ratio > maxRatio) {
    return { mask: new Uint8Array(n), ratio, ok: false, reason: '背景占比过高，可能是主体贴边或纯色图' };
  }

  return { mask, ratio, ok: true };
}
