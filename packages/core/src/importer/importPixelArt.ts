import type { CatalogColor, RasterImage } from '../types';
import { EMPTY_CELL } from '../types';
import { deltaE2000Raw } from '../color/deltaE';
import { rgbToLab } from '../color/space';
import type { PickedColor } from '../quantize/palette';

export interface ImportOptions {
  /** 调色板最大容量，默认 254（255 留给空格） */
  maxColors?: number;
}

export interface ImportResult {
  width: number;
  height: number;
  cells: Uint8Array;
  palette: PickedColor[];
  counts: number[];
  emptyCells: number;
  /** 原图实际用了多少种颜色 */
  originalColorCount: number;
  /** 因超出色卡容量被合并掉的颜色数 */
  mergedColorCount: number;
  /** 原色与映射色号的平均 ΔE00 */
  avgDelta: number;
}

/**
 * 像素图 1:1 导入。
 *
 * 这个函数与照片模式是两条完全独立的路径，不要互相调用。
 * 差异不是「参数不同」，而是设计目标相反：
 *   照片模式要把连续色调压到有限色数，所以需要聚类、去噪、锐化；
 *   像素图的每个点都是作者刻意放的，任何「优化」都是在毁作品。
 *
 * 因此这里：
 *   · 取格子中心像素，不做平均
 *   · 不做 K-means
 *   · 不去噪、不抖动、不锐化
 *   · 不合并相近色（除非超出色卡容量，且必须告知用户）
 */
export function importPixelArt(
  img: RasterImage,
  gridSize: number,
  catalog: CatalogColor[],
  opts: ImportOptions = {},
): ImportResult {
  const maxColors = Math.min(254, opts.maxColors ?? 254);
  const g = Math.max(1, Math.floor(gridSize));
  const { width: W, height: H, data } = img;

  const w = Math.max(1, Math.floor(W / g));
  const h = Math.max(1, Math.floor(H / g));

  // 原图尺寸不是 g 的整数倍时，从中心对齐裁切，不拉伸
  const ox = Math.floor((W - w * g) / 2);
  const oy = Math.floor((H - h * g) / 2);

  // --- 第一遍：取出每格中心像素，统计唯一色 ---
  const keyOf = new Int32Array(w * h);
  const usage = new Map<number, number>();
  let emptyCells = 0;

  for (let y = 0; y < h; y++) {
    const sy = Math.min(H - 1, oy + y * g + (g >> 1));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(W - 1, ox + x * g + (g >> 1));
      const p = (sy * W + sx) * 4;
      const i = y * w + x;

      if (data[p + 3] < 128) {
        keyOf[i] = -1;
        emptyCells++;
        continue;
      }

      // 颜色 key：每通道 8 bit 打包（用 0 表示透明的 -1 冲突，所以 +1 偏移）
      const key = ((data[p] << 16) | (data[p + 1] << 8) | data[p + 2]) + 1;
      keyOf[i] = key;
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }

  const originalColorCount = usage.size;

  // --- 第二遍：每个唯一色找最近的色号 ---
  const keyToCatalog = new Map<number, CatalogColor>();
  const colorUsage = new Map<string, { color: CatalogColor; count: number }>();
  let deltaSum = 0;
  let deltaCount = 0;

  for (const [key, count] of usage) {
    const k = key - 1;
    const r = (k >> 16) & 255;
    const gg = (k >> 8) & 255;
    const b = k & 255;
    const lab = rgbToLab(r, gg, b);

    let best: CatalogColor = catalog[0];
    let bestD = Infinity;
    for (const c of catalog) {
      const d = deltaE2000Raw(lab.L, lab.a, lab.b, c.lab.L, c.lab.a, c.lab.b);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }

    deltaSum += bestD * count;
    deltaCount += count;
    keyToCatalog.set(key, best);
    const rec = colorUsage.get(best.id);
    if (rec) rec.count += count;
    else colorUsage.set(best.id, { color: best, count });
  }

  // --- 超出容量时：按总用量保留，其余重新映射到已保留集合 ---
  let finalColors = [...colorUsage.values()].sort((a, b) => b.count - a.count);
  let mergedColorCount = 0;

  if (finalColors.length > maxColors) {
    const kept = finalColors.slice(0, maxColors);
    const dropped = finalColors.slice(maxColors);
    mergedColorCount = dropped.length;

    const keptColors = kept.map((k) => k.color);
    for (const d of dropped) {
      let best = keptColors[0];
      let bestD = Infinity;
      for (const c of keptColors) {
        const de = deltaE2000Raw(
          d.color.lab.L, d.color.lab.a, d.color.lab.b,
          c.lab.L, c.lab.a, c.lab.b,
        );
        if (de < bestD) {
          bestD = de;
          best = c;
        }
      }
      const rec = kept.find((k) => k.color.id === best.id);
      if (rec) rec.count += d.count;
    }
    finalColors = kept;
  }

  // --- 第三遍：回填 cells ---
  const palette: PickedColor[] = finalColors.map(({ color }) => ({
    colorId: color.id,
    code: color.code,
    name: color.name,
    hex: color.hex,
    lab: color.lab,
    deltaE: 0,
  }));

  const idToIndex = new Map<string, number>();
  palette.forEach((p, i) => idToIndex.set(p.colorId, i));

  const counts = finalColors.map((f) => f.count);
  const cells = new Uint8Array(w * h);
  const keyToIndex = new Map<number, number>();

  for (const [key, color] of keyToCatalog) {
    const idx = idToIndex.get(color.id);
    keyToIndex.set(key, idx ?? 0);
  }

  for (let i = 0; i < keyOf.length; i++) {
    const k = keyOf[i];
    cells[i] = k === -1 ? EMPTY_CELL : (keyToIndex.get(k) ?? 0);
  }

  return {
    width: w,
    height: h,
    cells,
    palette,
    counts,
    emptyCells,
    originalColorCount,
    mergedColorCount,
    avgDelta: deltaCount ? +(deltaSum / deltaCount).toFixed(2) : 0,
  };
}
