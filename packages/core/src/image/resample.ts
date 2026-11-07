import type { RasterImage } from '../types';

/**
 * 面积平均重采样（box filter）。
 *
 * 目标尺寸小于原图时，每个目标格 = 覆盖区域内所有源像素按 alpha 加权的平均。
 * 这能保留整体明暗关系，避免最近邻采样导致的锯齿。
 *
 * alpha 加权很重要：透明区域如果按普通平均参与，会把边缘拖暗（发黑边）。
 */
export function resampleBox(src: RasterImage, dw: number, dh: number): RasterImage {
  const { width: sw, height: sh, data } = src;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((dy + 1) * yr)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((dx + 1) * xr)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, p += 4) {
          const alpha = data[p + 3] / 255;
          r += data[p] * alpha;
          g += data[p + 1] * alpha;
          b += data[p + 2] * alpha;
          a += data[p + 3];
          wsum += alpha;
          count++;
        }
      }

      const o = (dy * dw + dx) * 4;
      if (wsum > 0) {
        out[o] = r / wsum;
        out[o + 1] = g / wsum;
        out[o + 2] = b / wsum;
      }
      out[o + 3] = count > 0 ? a / count : 0;
    }
  }

  return { width: dw, height: dh, data: out };
}

/** 最近邻重采样。直接导入模式下**绝不能**用面积平均，会把像素边缘糊掉。 */
export function resampleNearest(src: RasterImage, dw: number, dh: number): RasterImage {
  const { width: sw, height: sh, data } = src;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(sh - 1, Math.floor(dy * yr));
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(sw - 1, Math.floor(dx * xr));
      const si = (sy * sw + sx) * 4;
      const oi = (dy * dw + dx) * 4;
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
    }
  }

  return { width: dw, height: dh, data: out };
}

/**
 * 轻度锐化（unsharp mask 的简化版）。
 *
 * 降采样必然软化边缘，而拼豆作品的辨识度极度依赖轮廓。
 * 强度控制在 0.3–0.5，过强会让噪点变成豆子，反而难摆。
 */
export function sharpen(src: RasterImage, amount = 0.4): RasterImage {
  const { width: w, height: h, data } = src;
  if (w < 3 || h < 3 || amount <= 0) return src;

  const out = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        const blur = (data[p - 4] + data[p + 4] + data[p - w * 4] + data[p + w * 4]) / 4;
        out[p] = data[p] + amount * (data[p] - blur);
      }
    }
  }

  return { width: w, height: h, data: out };
}

/** 从中心裁切指定比例（宽高比 = aw/ah），保持原分辨率 */
export function cropToRatio(src: RasterImage, aw: number, ah: number): RasterImage {
  const targetRatio = aw / ah;
  const curRatio = src.width / src.height;

  let cw = src.width;
  let ch = src.height;
  if (curRatio > targetRatio) cw = Math.round(src.height * targetRatio);
  else ch = Math.round(src.width / targetRatio);

  const x0 = Math.floor((src.width - cw) / 2);
  const y0 = Math.floor((src.height - ch) / 2);

  return cropRect(src, x0, y0, cw, ch);
}

/** 裁切矩形区域（越界自动收敛） */
export function cropRect(
  src: RasterImage,
  x: number,
  y: number,
  w: number,
  h: number,
): RasterImage {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(y)));
  const cw = Math.max(1, Math.min(src.width - x0, Math.floor(w)));
  const ch = Math.max(1, Math.min(src.height - y0, Math.floor(h)));

  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const from = ((y0 + row) * src.width + x0) * 4;
    const to = row * cw * 4;
    out.set(src.data.subarray(from, from + cw * 4), to);
  }
  return { width: cw, height: ch, data: out };
}

/** 把透明区域合成到指定底色（照片模式用；白底最接近实际观感） */
export function flattenOnColor(src: RasterImage, hex = '#FFFFFF'): RasterImage {
  const n = parseInt(hex.replace('#', ''), 16);
  const br = (n >> 16) & 255;
  const bg = (n >> 8) & 255;
  const bb = n & 255;

  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    if (a >= 1) continue;
    out[i] = out[i] * a + br * (1 - a);
    out[i + 1] = out[i + 1] * a + bg * (1 - a);
    out[i + 2] = out[i + 2] * a + bb * (1 - a);
    out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}
