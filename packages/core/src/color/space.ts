/**
 * 色彩空间转换。
 *
 * 统一路径：sRGB → Linear RGB → XYZ(D65) → CIELAB
 *
 * 为什么要绕这么远：RGB 是设备相关的非线性空间，直接用欧氏距离比较颜色
 * 与人眼感知严重不符。拼豆场景下这会表现为「图纸上看着渐变很顺，实际拼出来断层」。
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LAB {
  L: number;
  a: number;
  b: number;
}

/** D65 标准光源白点 */
const D65 = { Xn: 0.95047, Yn: 1.0, Zn: 1.08883 };

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

/** sRGB 分量 (0-255) → 线性光 */
export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** 线性光 → sRGB 分量 (0-255，不取整不截断) */
export function linearToSrgb(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return s * 255;
}

export function rgbToXyz(r: number, g: number, b: number): { X: number; Y: number; Z: number } {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return {
    X: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    Y: 0.2126729 * R + 0.7151522 * G + 0.0721750 * B,
    Z: 0.0193339 * R + 0.1191920 * G + 0.9503041 * B,
  };
}

function f(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

export function xyzToLab(X: number, Y: number, Z: number): LAB {
  const fx = f(X / D65.Xn);
  const fy = f(Y / D65.Yn);
  const fz = f(Z / D65.Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToXyz(L: number, a: number, b: number): { X: number; Y: number; Z: number } {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return {
    X: D65.Xn * fInv(fx),
    Y: D65.Yn * fInv(fy),
    Z: D65.Zn * fInv(fz),
  };
}

export function rgbToLab(r: number, g: number, b: number): LAB {
  const { X, Y, Z } = rgbToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}

export function labToRgb(L: number, a: number, b: number): RGB {
  const { X, Y, Z } = labToXyz(L, a, b);
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return {
    r: clamp255(linearToSrgb(R)),
    g: clamp255(linearToSrgb(G)),
    b: clamp255(linearToSrgb(B)),
  };
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** 十六进制 → RGB，支持 #RGB / #RRGGBB，大小写均可 */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`非法色值: ${hex}`);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToLab(hex: string): LAB {
  const { r, g, b } = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

/**
 * Lab 空间的平方欧氏距离。
 * 只用于聚类、初筛、排序这类「不需要严格感知一致」的场景。
 * 最终落色号必须用 deltaE2000。
 */
export function labDistanceSq(a: LAB, b: LAB): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

/** 相对亮度（WCAG），用于判断该用深色还是浅色文字 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
