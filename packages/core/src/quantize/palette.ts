import type { CatalogColor, Centroid } from '../types';
import type { LAB } from '../color/space';
import { deltaE2000Raw, deltaE2000 } from '../color/deltaE';

export interface PickedColor {
  colorId: string;
  code: string;
  name?: string;
  hex: string;
  lab: LAB;
  /** 聚类中心与该色号的 ΔE00，用于质量预警 */
  deltaE: number;
}

/**
 * 把 K-means 的聚类中心映射到真实色号。
 *
 * 关键：不同中心可能落到同一个色号（如两个相近的红都映射到 B5），
 * 这时要合并——否则调色板里会出现两个一模一样的颜色，用户白分拣一次。
 */
export function mapCentroidsToCatalog(
  centers: Centroid[],
  catalog: CatalogColor[],
  mergeThreshold = 1.0,
): PickedColor[] {
  if (!catalog.length) return [];

  const picked: PickedColor[] = [];
  const byId = new Map<string, PickedColor>();

  for (const c of centers) {
    let best: CatalogColor | null = null;
    let bestD = Infinity;

    for (const col of catalog) {
      const d = deltaE2000Raw(c.L, c.a, c.b, col.lab.L, col.lab.a, col.lab.b);
      if (d < bestD) {
        bestD = d;
        best = col;
      }
    }
    if (!best) continue;

    const exist = byId.get(best.id);
    if (exist) {
      if (bestD < exist.deltaE) exist.deltaE = bestD;
      continue;
    }

    const item: PickedColor = {
      colorId: best.id,
      code: best.code,
      name: best.name,
      hex: best.hex,
      lab: best.lab,
      deltaE: bestD,
    };
    picked.push(item);
    byId.set(best.id, item);
  }

  return mergeSimilar(picked, mergeThreshold);
}

/**
 * 合并色卡里本身就非常接近的两个色号（ΔE00 < threshold）。
 * 保留 ΔE 更小的那个。
 *
 * 注意：直接导入模式**不能**调这个，像素画作者用两个相近色做微妙层次是刻意的。
 */
export function mergeSimilar(picked: PickedColor[], threshold = 1.0): PickedColor[] {
  if (picked.length <= 1) return picked;

  const result: PickedColor[] = [];
  const sorted = [...picked].sort((a, b) => a.deltaE - b.deltaE);

  for (const item of sorted) {
    const dup = result.find((r) => deltaE2000(r.lab, item.lab) < threshold);
    if (!dup) result.push(item);
  }

  return result;
}

/**
 * 在候选子集里找最接近的颜色。
 *
 * 优化：先用 Lab 欧氏距离筛出 topK 个候选，再对这几个算精确 ΔE00。
 * 候选通常 ≤48，直接全算 ΔE00 需要 ~10μs/像素；两步法是 ~1μs，快约 8 倍，
 * 而且因为只是"初筛"，精度损失可以忽略（初筛只负责别把正确答案筛掉）。
 */
export function createNearestFinder(candidates: PickedColor[], topK = 4) {
  const K = Math.min(topK, candidates.length);
  const cL = new Float64Array(candidates.length);
  const ca = new Float64Array(candidates.length);
  const cb = new Float64Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    cL[i] = candidates[i].lab.L;
    ca[i] = candidates[i].lab.a;
    cb[i] = candidates[i].lab.b;
  }

  const bestIdx = new Int32Array(K);
  const bestD = new Float64Array(K);

  return function findNearest(L: number, a: number, b: number): number {
    bestD.fill(Infinity);
    bestIdx.fill(0);

    for (let i = 0; i < candidates.length; i++) {
      const dL = L - cL[i];
      const da = a - ca[i];
      const db = b - cb[i];
      const d = dL * dL + da * da + db * db;

      if (d < bestD[K - 1]) {
        let pos = K - 1;
        while (pos > 0 && bestD[pos - 1] > d) {
          bestD[pos] = bestD[pos - 1];
          bestIdx[pos] = bestIdx[pos - 1];
          pos--;
        }
        bestD[pos] = d;
        bestIdx[pos] = i;
      }
    }

    let winner = bestIdx[0];
    let winnerD = Infinity;
    for (let j = 0; j < K; j++) {
      const c = candidates[bestIdx[j]];
      const dE = deltaE2000Raw(L, a, b, c.lab.L, c.lab.a, c.lab.b);
      if (dE < winnerD) {
        winnerD = dE;
        winner = bestIdx[j];
      }
    }
    return winner;
  };
}
