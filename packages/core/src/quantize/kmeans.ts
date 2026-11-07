import type { Centroid } from '../types';

/**
 * 确定性伪随机（LCG）。
 * 用固定种子是为了「同一张图、同一组参数，每次结果完全一致」，
 * 否则用户改个参数再改回来，配色会变，体验很差。
 */
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function distSq(labs: Float32Array, i: number, c: Centroid): number {
  const dL = labs[i * 3] - c.L;
  const da = labs[i * 3 + 1] - c.a;
  const db = labs[i * 3 + 2] - c.b;
  return dL * dL + da * da + db * db;
}

/**
 * Lab 空间加权 K-means（k-means++ 初始化）。
 *
 * 为什么聚类用 Lab 欧氏、最终落色号却用 ΔE00：
 * K-means 要迭代几十万次，ΔE00 太贵；聚类本身只需要大致合理的分组，
 * 欧氏在 Lab 空间已经远好于 RGB。最终精度由映射阶段的 ΔE00 保证。
 */
export function kmeansLab(
  labs: Float32Array,
  weights: Float32Array,
  k: number,
  maxIter = 24,
  seed = 20261107,
): Centroid[] {
  const n = weights.length;
  if (n === 0) return [];
  const kk = Math.max(1, Math.min(k, n));

  const rand = makeRandom(seed);
  const centers: Centroid[] = [];

  // --- k-means++ 初始化 ---
  const first = Math.floor(rand() * n);
  centers.push({ L: labs[first * 3], a: labs[first * 3 + 1], b: labs[first * 3 + 2] });

  const minDist = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < kk; c++) {
    let sum = 0;
    const last = centers[c - 1];
    for (let i = 0; i < n; i++) {
      const d = distSq(labs, i, last);
      if (d < minDist[i]) minDist[i] = d;
      sum += minDist[i] * weights[i];
    }
    if (sum <= 0) break;

    let r = rand() * sum;
    let acc = 0;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      acc += minDist[i] * weights[i];
      if (acc >= r) {
        chosen = i;
        break;
      }
    }
    centers.push({
      L: labs[chosen * 3],
      a: labs[chosen * 3 + 1],
      b: labs[chosen * 3 + 2],
    });
  }

  const K = centers.length;
  if (K === 1) return centers;

  // --- Lloyd 迭代 ---
  const assign = new Int32Array(n).fill(-1);
  const sumL = new Float64Array(K);
  const sumA = new Float64Array(K);
  const sumB = new Float64Array(K);
  const sumW = new Float64Array(K);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;

    for (let i = 0; i < n; i++) {
      const L = labs[i * 3];
      const a = labs[i * 3 + 1];
      const b = labs[i * 3 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const ct = centers[c];
        const dL = L - ct.L;
        const da = a - ct.a;
        const db = b - ct.b;
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

    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    sumW.fill(0);

    for (let i = 0; i < n; i++) {
      const c = assign[i];
      const w = weights[i];
      sumL[c] += labs[i * 3] * w;
      sumA[c] += labs[i * 3 + 1] * w;
      sumB[c] += labs[i * 3 + 2] * w;
      sumW[c] += w;
    }

    for (let c = 0; c < K; c++) {
      if (sumW[c] > 0) {
        centers[c] = {
          L: sumL[c] / sumW[c],
          a: sumA[c] / sumW[c],
          b: sumB[c] / sumW[c],
        };
      }
    }

    if (changed / n < 0.01) break;
  }

  return centers;
}

/**
 * 像素权重。
 *
 * 肤色 ×2.0 —— 人像的脸不能偏色、不能糊成一团。
 * 边缘 ×1.5 —— 保住轮廓和五官，否则小尺寸下认不出是谁。
 * 其余 ×1.0 —— 背景不应吃掉有限的色数预算。
 */
export function buildWeights(
  img: { width: number; height: number; data: Uint8ClampedArray },
  opts: { skinBoost?: number; edgeBoost?: number } = {},
): Float32Array {
  const skinBoost = opts.skinBoost ?? 2.0;
  const edgeBoost = opts.edgeBoost ?? 1.5;
  const { width: w, height: h, data } = img;
  const n = w * h;
  const weights = new Float32Array(n).fill(1);

  // 肤色
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.169 * r - 0.331 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;
    if (y > 60 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
      weights[i] = skinBoost;
    }
  }

  // 边缘（Sobel 梯度，取前 30%）
  const grad = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lum = (px: number) => {
        const p = px * 4;
        return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      };
      const gx =
        -lum(i - w - 1) - 2 * lum(i - 1) - lum(i + w - 1) +
        lum(i - w + 1) + 2 * lum(i + 1) + lum(i + w + 1);
      const gy =
        -lum(i - w - 1) - 2 * lum(i - w) - lum(i - w + 1) +
        lum(i + w - 1) + 2 * lum(i + w) + lum(i + w + 1);
      grad[i] = Math.abs(gx) + Math.abs(gy);
    }
  }

  const sorted = Array.from(grad).sort((a, b) => b - a);
  const threshold = sorted[Math.floor(n * 0.3)] ?? 0;
  if (threshold > 0) {
    for (let i = 0; i < n; i++) {
      if (grad[i] >= threshold) weights[i] = Math.max(weights[i], edgeBoost);
    }
  }

  return weights;
}

/** 把图像像素转成 Lab 数组（长度 = n*3），跳过完全透明的像素由调用方处理 */
export function toLabArray(img: { width: number; height: number; data: Uint8ClampedArray }): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  const { data } = img;

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;

    const R = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const G = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const B = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
    const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;

    const fx = fLab(X / 0.95047);
    const fy = fLab(Y / 1.0);
    const fz = fLab(Z / 1.08883);

    out[i * 3] = 116 * fy - 16;
    out[i * 3 + 1] = 500 * (fx - fy);
    out[i * 3 + 2] = 200 * (fy - fz);
  }

  return out;
}

const LAB_EPS = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function fLab(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}
