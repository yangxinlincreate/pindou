import { createNearestFinder, type PickedColor } from './palette';
import { deltaE2000Raw } from '../color/deltaE';
import { hexToLab } from '../color/space';
import type { LAB } from '../color/space';
import type { PatternColor } from '../types';

/**
 * 逐格分配色号。
 *
 * labs: 长度 n*3 的 Lab 数组
 * 返回 cells（调色板索引）和每个色号的用量
 */
export function assignPhotoCells(
  labs: Float32Array,
  candidates: PickedColor[],
): { cells: Uint8Array; counts: number[] } {
  const n = labs.length / 3;
  const cells = new Uint8Array(n);
  const counts = new Array<number>(candidates.length).fill(0);
  const findNearest = createNearestFinder(candidates, 4);

  for (let i = 0; i < n; i++) {
    const idx = findNearest(labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2]);
    cells[i] = idx;
    counts[idx]++;
  }

  return { cells, counts };
}

/**
 * 孤立点清理。
 *
 * 这里有个很容易踩的坑：如果规则只是「周围 8 格没有同色就替换」，
 * 那么眼睛高光、鼻子、小 logo 这类**本来就是孤立单格的细节**会被当成噪点抹掉，
 * 结果就是「色块很大、看不出原图」。
 *
 * 正确做法是按色差判断：
 *   · 孤立点与邻居主色的 ΔE00 很小（默认 ≤ 6）→ 是噪点，替换
 *   · ΔE00 很大 → 是刻意的细节，保留
 * 黑白眼睛和肤色之间的 ΔE 有几十，绝不会被清掉。
 */
export function despeckle(
  cells: Uint8Array,
  w: number,
  h: number,
  palette: PatternColor[],
  maxDelta = 6,
): number {
  if (w < 3 || h < 3) return 0;

  const labs: LAB[] = palette.map((p) => hexToLab(p.hex));
  const src = cells.slice();
  let changed = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = src[i];

      let sameNeighbors = 0;
      const counts = new Map<number, number>();

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nc = src[ny * w + nx];
          if (nc === c) sameNeighbors++;
          counts.set(nc, (counts.get(nc) ?? 0) + 1);
        }
      }

      if (sameNeighbors !== 0) continue;

      let topColor = -1;
      let topCount = 0;
      for (const [color, count] of counts) {
        if (count > topCount) {
          topCount = count;
          topColor = color;
        }
      }

      // 邻居要有足够共识，否则说明这块本来就杂乱，不该动
      if (topColor < 0 || topCount < 3) continue;

      const a = labs[c];
      const b = labs[topColor];
      if (!a || !b) continue;

      const dE = deltaE2000Raw(a.L, a.a, a.b, b.L, b.a, b.b);
      if (dE <= maxDelta) {
        cells[i] = topColor;
        changed++;
      }
    }
  }

  return changed;
}
