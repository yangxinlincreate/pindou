import type { RasterImage } from '../types';

export interface GridDetection {
  /** 每个逻辑像素占多少物理像素 */
  gridSize: number;
  /** 推导出的格数 */
  width: number;
  height: number;
  /** 0–1，众数占比。低于 0.4 基本不可信 */
  confidence: number;
}

export interface ImageAnalysis {
  /** 量化后的不同颜色数 */
  colorCount: number;
  grid: GridDetection | null;
  suggestMode: 'photo' | 'import';
  reason: string;
}

/** 颜色量化 key：每通道 5 bit，透明单独用 -1 */
function qkey(data: Uint8ClampedArray, i: number): number {
  if (data[i + 3] < 128) return -1;
  return ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
}

export function countColors(img: RasterImage, maxSamples = 200000): number {
  const { data } = img;
  const total = data.length / 4;
  const step = Math.max(4, Math.floor(total / maxSamples)) * 4;
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += step) {
    seen.add(qkey(data, i));
    if (seen.size > 4096) break;
  }
  return seen.size;
}

function gcd(a: number, b: number): number {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * 识别像素图的格子边长。
 *
 * 原理：像素图是「每个逻辑像素放大成 g×g 的方块」，所以沿任意一行/列扫描，
 * 颜色跳变的间距**必然是 g 的整数倍**。
 *
 * 注意：不能用「出现最多的间距」当答案——大片同色区域不会产生跳变，
 * 那些很长的 run 会盖过单格边界，结果识别成色块宽度而不是格子边长。
 * 正确做法是求所有跳变间距的最大公约数。
 *
 * 失败原因通常是：作者用了非整数倍缩放、导出时开了抗锯齿、或被微信压过。
 * 失败时不要硬猜，让用户手输格数——他自己画的图，他知道多少格。
 */
export function detectGridSize(img: RasterImage): GridDetection | null {
  const { width: w, height: h, data } = img;
  if (w < 8 || h < 8) return null;

  const hist = new Map<number, number>();
  const collect = (len: number) => {
    if (len >= 2 && len <= 128) hist.set(len, (hist.get(len) ?? 0) + 1);
  };

  // 横向扫描
  const rowStep = Math.max(1, Math.floor(h / 300));
  for (let y = 0; y < h; y += rowStep) {
    let runStart = 0;
    let prev = qkey(data, y * w * 4);
    for (let x = 1; x < w; x++) {
      const cur = qkey(data, (y * w + x) * 4);
      if (cur !== prev) {
        collect(x - runStart);
        runStart = x;
        prev = cur;
      }
    }
  }

  // 纵向扫描（补充横向缺失的样本，尤其是细长图案）
  const colStep = Math.max(1, Math.floor(w / 300));
  for (let x = 0; x < w; x += colStep) {
    let runStart = 0;
    let prev = qkey(data, x * 4);
    for (let y = 1; y < h; y++) {
      const cur = qkey(data, (y * w + x) * 4);
      if (cur !== prev) {
        collect(y - runStart);
        runStart = y;
        prev = cur;
      }
    }
  }

  if (hist.size === 0) {
    // 整图同色，或每个像素都与邻居不同
    return countColors(img) <= 96 ? { gridSize: 1, width: w, height: h, confidence: 0.3 } : null;
  }

  let total = 0;
  for (const c of hist.values()) total += c;

  // 丢掉低频噪声（JPEG 压缩会在边缘产生零星的 1–3 像素过渡）
  const strong = [...hist.entries()].filter(([, c]) => c / total >= 0.03);
  if (!strong.length) return null;

  // 主判定：所有跳变间距的最大公约数
  let g = 0;
  for (const [len] of strong) g = gcd(g, len);

  const fits = (cand: number) =>
    cand >= 2 &&
    cand <= Math.min(w, h) &&
    (w % cand === 0 || Math.abs((w % cand) - cand) <= 1) &&
    (h % cand === 0 || Math.abs((h % cand) - cand) <= 1) &&
    Math.floor(w / cand) >= 4 &&
    Math.floor(w / cand) <= 256 &&
    Math.floor(h / cand) >= 4;

  if (!fits(g)) {
    // 兜底：取频次最高的间距。可能不准，交给 confidence 让调用方判断
    const sorted = [...strong].sort((a, b) => b[1] - a[1]);
    const fallback = sorted[0][0];
    if (!fits(fallback)) return null;
    g = fallback;
  }

  let covered = 0;
  for (const [len, c] of hist) if (len % g === 0) covered += c;

  return {
    gridSize: g,
    width: Math.floor(w / g),
    height: Math.floor(h / g),
    confidence: covered / total,
  };
}

/**
 * 综合判断该用哪种模式。
 *
 * 注意：这里只给建议，**不自动切换**。误判的代价比多问一句高得多。
 */
export function analyzeImage(img: RasterImage): ImageAnalysis {
  const colorCount = countColors(img);
  const grid = detectGridSize(img);

  if (grid && colorCount <= 96 && grid.confidence >= 0.45) {
    return {
      colorCount,
      grid,
      suggestMode: 'import',
      reason: `检测到像素图（每格 ${grid.gridSize} px，共 ${grid.width} × ${grid.height}）`,
    };
  }

  if (colorCount <= 32 && grid) {
    return {
      colorCount,
      grid,
      suggestMode: 'import',
      reason: `颜色很少（${colorCount} 色），可能是像素图或图标`,
    };
  }

  return {
    colorCount,
    grid,
    suggestMode: 'photo',
    reason:
      colorCount > 96
        ? `颜色较多（${colorCount}+ 色），按照片处理效果更好`
        : '未识别出规则网格，按照片处理',
  };
}

/**
 * 抗锯齿检测：判断一张「看起来像像素图」的图其实是不是缩小的插画。
 *
 * 做法：统计只出现在色块边界、且用量极低的颜色占比。
 * 真像素图没有过渡色，假像素图会有一圈半透明的边。
 */
export function detectAntiAlias(img: RasterImage): boolean {
  const { width: w, height: h, data } = img;
  const counts = new Map<number, number>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = qkey(data, (y * w + x) * 4);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  const totalPixels = w * h;
  let rare = 0;
  for (const c of counts.values()) {
    if (c / totalPixels < 0.005) rare += c;
  }

  return rare / totalPixels > 0.12;
}
