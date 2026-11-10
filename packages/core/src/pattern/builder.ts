import { EMPTY_CELL } from '../types';
import type { ColorSeries, Pattern, PatternColor, RasterImage } from '../types';
import { flattenOnColor, resampleBox, sharpen } from '../image/resample';
import { buildWeights, kmeansLab, toLabArray } from '../quantize/kmeans';
import { mapCentroidsToCatalog } from '../quantize/palette';
import { assignPhotoCells, despeckle } from '../quantize/assign';
import { createPattern } from './stats';
import { importPixelArt } from '../importer/importPixelArt';
import { deltaE2000Raw } from '../color/deltaE';
import type { PickedColor } from '../quantize/palette';

export interface ConvertOptions {
  targetWidth: number;
  targetHeight: number;
  /** 目标色数。实际可能少于这个数——照片本身没那么多可分辨的色调 */
  colorCount: number;
  series: ColorSeries;
  /** 套装内色号。传了就只用这些颜色 */
  setCodes?: string[];
  sharpenAmount?: number;
  doDespeckle?: boolean;
  /** 去噪时允许替换的最大色差。超过这个值的孤立点会被当成刻意的细节保留 */
  despeckleMaxDelta?: number;
  /** 透明区域合成到的底色，hex */
  background?: string;
  /** 背景掩码（原图尺寸，1 = 背景），这些格子会输出为空 */
  bgMask?: Uint8Array;
}

/**
 * 照片模式：连续色调 → 拼豆图纸。
 *
 * 流水线：合成底色 → 面积平均降采样 → 轻度锐化 → Lab 加权 K-means
 *        → 映射到真实色号 → 逐格分配 → 孤立点清理 → 统计
 */
export function convertPhoto(img: RasterImage, opts: ConvertOptions): Pattern {
  const { targetWidth, targetHeight, colorCount, series } = opts;

  const catalog = pickCatalog(series, opts.setCodes);
  if (!catalog.length) throw new Error('色卡为空：检查系列或套装配置');

  // 1. 透明合成到白底（拼豆是实体，透明没有意义，白底最接近实际观感）
  const flat = flattenOnColor(img, opts.background ?? '#FFFFFF');

  // 2. 降采样到目标格数——这一步必须在量化之前
  const small = resampleBox(flat, targetWidth, targetHeight);

  // 3. 锐化（降采样会软化边缘，拼豆的辨识度极度依赖轮廓）
  const sharp = sharpen(small, opts.sharpenAmount ?? 0.4);

  // 4. Lab + 权重
  const labs = toLabArray(sharp);
  const weights = buildWeights(sharp);

  // 5. 聚类
  const k = Math.max(2, Math.min(colorCount, catalog.length, targetWidth * targetHeight));
  const centers = kmeansLab(labs, weights, k, 24);

  // 6. 映射到真实色号（这一步保证输出的是「能买到的编号」，不是 RGB）
  const picked = mapCentroidsToCatalog(centers, catalog, 1.0);

  // 7. 分配
  const { cells } = assignPhotoCells(labs, picked);

  // 8.5 背景掩码：标记为背景的格子直接变成空格，不摆豆
  if (opts.bgMask && opts.bgMask.length === img.width * img.height) {
    const smallMask = downscaleMask(opts.bgMask, img.width, img.height, targetWidth, targetHeight);
    for (let i = 0; i < cells.length; i++) {
      if (smallMask[i]) cells[i] = EMPTY_CELL;
    }
  }

  // 9. 组装调色板（去噪需要颜色信息判断「是噪点还是细节」）
  const palette: PatternColor[] = picked.map((p) => ({
    colorId: p.colorId,
    code: p.code,
    name: p.name,
    hex: p.hex,
    count: 0,
    owned: opts.setCodes ? opts.setCodes.includes(p.code) : undefined,
  }));

  // 8. 去噪：只清理与邻居色差很小的孤立点，眼睛高光这类对比强的细节会保留
  if (opts.doDespeckle !== false) {
    despeckle(cells, targetWidth, targetHeight, palette, opts.despeckleMaxDelta ?? 6);
  }

  const pattern = createPattern(targetWidth, targetHeight, cells, palette, {
    mode: 'photo',
    beadSize: series.beadSize,
    seriesId: series.id,
  });
  pattern.stats.avgDelta = measureAvgDelta(labs, pattern.cells, picked);
  return pattern;
}

/**
 * 平均色差：每格原色与最终色号之间的 ΔE00 均值。
 * 这是「配色准不准」唯一客观的指标，也是自动调参的依据。
 */
function measureAvgDelta(labs: Float32Array, cells: Uint8Array, picked: PickedColor[]): number {
  const n = cells.length;
  if (!n) return 0;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const idx = cells[i];
    const c = picked[idx];
    if (!c) continue;
    sum += deltaE2000Raw(
      labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2],
      c.lab.L, c.lab.a, c.lab.b,
    );
    count++;
  }

  return count ? +(sum / count).toFixed(2) : 0;
}

export interface AutoTuneResult {
  /** 推荐色数 */
  colorCount: number;
  /** 该色数下的平均色差 */
  avgDelta: number;
  /** 试过的所有档位，可用于界面展示「为什么选这个」 */
  tried: Array<{ colorCount: number; avgDelta: number }>;
}

/**
 * 自动挑色数。
 *
 * 逻辑不是「选最像的那个」——那样永远选最大色数，摆豆会累死人。
 * 而是：**从少到多试，第一个达到可接受还原度（平均 ΔE00 ≤ targetDelta）的就停**。
 * 也就是「用尽量少的颜色达到够用的效果」。
 */
export function autoTune(
  img: RasterImage,
  opts: {
    targetWidth: number;
    targetHeight: number;
    series: ColorSeries;
    setCodes?: string[];
    candidates?: number[];
    targetDelta?: number;
  },
): AutoTuneResult {
  const target = opts.targetDelta ?? 6.5;
  const cap = opts.setCodes ? opts.setCodes.length : opts.series.colors.length;

  let cands = (opts.candidates ?? [10, 12, 16, 20, 24, 32, 40, 48, 64]).filter((k) => k <= cap);
  if (!cands.length) cands = [Math.min(16, cap)];

  const tried: Array<{ colorCount: number; avgDelta: number }> = [];
  let best: { colorCount: number; avgDelta: number } | null = null;
  let prevDelta = Infinity;

  for (const k of cands) {
    const p = convertPhoto(img, {
      targetWidth: opts.targetWidth,
      targetHeight: opts.targetHeight,
      colorCount: k,
      series: opts.series,
      setCodes: opts.setCodes,
    });

    const rec = { colorCount: k, avgDelta: p.stats.avgDelta };
    tried.push(rec);
    if (!best || rec.avgDelta < best.avgDelta) best = rec;

    // 达到可接受还原度就停
    if (rec.avgDelta <= target) break;

    // 再多给颜色也没明显改善了 —— 说明瓶颈是色卡覆盖度，不是色数
    if (prevDelta < Infinity && (prevDelta - rec.avgDelta) / prevDelta < 0.08) break;

    prevDelta = rec.avgDelta;
  }

  return {
    colorCount: best ? best.colorCount : cands[0],
    avgDelta: best ? best.avgDelta : 0,
    tried,
  };
}

export interface ImportConvertOptions {
  gridSize: number;
  series: ColorSeries;
  setCodes?: string[];
}

/** 直接导入模式：像素图 1:1 还原。与 convertPhoto 完全独立。 */
export function convertImport(img: RasterImage, opts: ImportConvertOptions): Pattern {
  const catalog = pickCatalog(opts.series, opts.setCodes);
  if (!catalog.length) throw new Error('色卡为空：检查系列或套装配置');

  const result = importPixelArt(img, opts.gridSize, catalog);

  const palette: PatternColor[] = result.palette.map((p, i) => ({
    colorId: p.colorId,
    code: p.code,
    name: p.name,
    hex: p.hex,
    count: result.counts[i] ?? 0,
    owned: opts.setCodes ? opts.setCodes.includes(p.code) : undefined,
  }));

  const pattern = createPattern(result.width, result.height, result.cells, palette, {
    mode: 'import',
    beadSize: opts.series.beadSize,
    seriesId: opts.series.id,
  });
  pattern.stats.avgDelta = result.avgDelta;
  return pattern;
}

function pickCatalog(series: ColorSeries, setCodes?: string[]) {
  if (!setCodes || !setCodes.length) return series.colors;
  const allowed = new Set(setCodes);
  return series.colors.filter((c) => allowed.has(c.code));
}

/**
 * 把原图尺寸的背景掩码降采样到目标格数。
 * 用多数投票（覆盖面积过半才算背景），避免边界锯齿。
 */
function downscaleMask(
  mask: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const xr = sw / dw;
  const yr = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((dy + 1) * yr)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((dx + 1) * xr)));

      let total = 0;
      let bg = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          if (mask[y * sw + x]) bg++;
        }
      }
      out[dy * dw + dx] = total > 0 && bg / total > 0.5 ? 1 : 0;
    }
  }

  return out;
}
