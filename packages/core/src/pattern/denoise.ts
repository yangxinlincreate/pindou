import { deltaE2000Raw } from '../color/deltaE';
import { hexToLab } from '../color/space';
import type { PatternColor } from '../types';
import { EMPTY_CELL } from '../types';
import type { LAB } from '../color/space';

export interface DenoiseOptions {
  /** 面积小于这个格数的连通块会被考虑合并 */
  minArea?: number;
  /** 与邻居主色的色差小于这个值才合并（保护眼睛高光这类高对比细节） */
  maxDelta?: number;
}

export interface DenoiseResult {
  /** 被改写的格子数 */
  changed: number;
  /** 合并掉的连通块数 */
  regions: number;
  /** 合并前后减少的用色数 */
  colorsBefore: number;
  colorsAfter: number;
}

/**
 * 去杂质（连通域清理）。
 *
 * 和 despeckle 的区别：
 *   despeckle 只处理「孤立单格」——周围 8 格没有同色。
 *   这个处理「小面积连通块」——比如沙滩纹理被量化后形成的 3~8 格小色斑。
 *   后者才是「看着脏」的主要原因。
 *
 * 保护规则：只合并与邻居色差 ≤ maxDelta 的小块。
 * 眼睛、高光这类跟周围差几十 ΔE 的细节不会被吞掉。
 */
export function removeSpeckles(
  cells: Uint8Array,
  w: number,
  h: number,
  palette: PatternColor[],
  opts: DenoiseOptions = {},
): DenoiseResult {
  const minArea = opts.minArea ?? 6;
  const maxDelta = opts.maxDelta ?? 12;

  const n = w * h;
  const labs: LAB[] = palette.map((p) => hexToLab(p.hex));
  const before = countColorsIn(cells);

  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const region = new Int32Array(n);

  let changed = 0;
  let regions = 0;

  // 4 邻域足够：对角相连的小块本来就是视觉上分开的
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;

    const color = cells[start];
    visited[start] = 1;

    let sp = 0;
    let rp = 0;
    stack[sp++] = start;
    region[rp++] = start;

    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx / w) | 0;

      if (x + 1 < w) {
        const ni = idx + 1;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
      if (x > 0) {
        const ni = idx - 1;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
      if (y + 1 < h) {
        const ni = idx + w;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
      if (y > 0) {
        const ni = idx - w;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
    }

    if (rp >= minArea) continue;
    if (color === EMPTY_CELL) continue;

    // 统计区域外边界上的颜色分布
    const counts = new Map<number, number>();
    for (let t = 0; t < rp; t++) {
      const idx = region[t];
      const x = idx % w;
      const y = (idx / w) | 0;

      if (x + 1 < w && cells[idx + 1] !== color) {
        const c = cells[idx + 1];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      if (x > 0 && cells[idx - 1] !== color) {
        const c = cells[idx - 1];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      if (y + 1 < h && cells[idx + w] !== color) {
        const c = cells[idx + w];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      if (y > 0 && cells[idx - w] !== color) {
        const c = cells[idx - w];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }

    let best = -1;
    let bestCount = 0;
    for (const [c, cnt] of counts) {
      if (c === EMPTY_CELL) continue;
      if (cnt > bestCount) {
        bestCount = cnt;
        best = c;
      }
    }
    if (best < 0) continue;

    const a = labs[color];
    const b = labs[best];
    if (!a || !b) continue;

    if (deltaE2000Raw(a.L, a.a, a.b, b.L, b.a, b.b) > maxDelta) continue;

    for (let t = 0; t < rp; t++) cells[region[t]] = best;
    changed += rp;
    regions++;
  }

  return {
    changed,
    regions,
    colorsBefore: before,
    colorsAfter: countColorsIn(cells),
  };
}

function countColorsIn(cells: Uint8Array): number {
  const seen = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY_CELL) seen.add(cells[i]);
  }
  return seen.size;
}
