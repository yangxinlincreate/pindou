/**
 * CIEDE2000 色差。
 *
 * 这是整个项目最容易被写错的一段代码。hbarp 的环绕边界和 RT 的符号一旦错了，
 * 结果只差几个 ΔE —— 肉眼完全看不出来，但会让所有配色系统性偏移。
 *
 * 必须用 Sharma 等人的 34 组标准测试数据验证（见 test/deltaE.test.ts），容差 1e-4。
 * 参考文献：Sharma, Wu, Dalal (2005), "The CIEDE2000 Color-Difference Formula:
 * Implementation Notes, Supplementary Test Data, and Mathematical Observations".
 */

import type { LAB } from './space';

const POW25_7 = Math.pow(25, 7);
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** 热路径版本：直接传分量，避免对象创建。逐像素调用时用这个。 */
export function deltaE2000Raw(
  L1: number, a1: number, b1: number,
  L2: number, a2: number, b2: number,
): number {
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) * DEG + 360) % 360;
  const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) * DEG + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * RAD) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * RAD) +
    0.24 * Math.cos(2 * hbarp * RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * RAD) -
    0.20 * Math.cos((4 * hbarp - 63) * RAD);

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const SL =
    1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  const tL = dLp / SL;
  const tC = dCp / SC;
  const tH = dHp / SH;

  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

/** 便捷版本 */
export function deltaE2000(c1: LAB, c2: LAB): number {
  return deltaE2000Raw(c1.L, c1.a, c1.b, c2.L, c2.a, c2.b);
}

/**
 * 色差的产品含义（用于界面分级，不要拿来做算法判断）。
 */
export function describeDelta(dE: number): string {
  if (dE < 1) return '几乎无法分辨';
  if (dE < 2.3) return '训练后可分辨';
  if (dE < 5) return '明显能看出不同';
  if (dE < 10) return '差异较大';
  return '完全不同';
}
