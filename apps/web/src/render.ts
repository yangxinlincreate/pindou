import { BOARD_SIZE, EMPTY_CELL, hexToRgb, relativeLuminance } from '@pindou/core';
import type { Pattern, RasterImage } from '@pindou/core';

export interface RenderOptions {
  showCode: boolean;
  showBoard: boolean;
  maxWidth: number;
  maxHeight: number;
  cellSize?: number;
}

export interface RenderResult {
  cellSize: number;
  width: number;
  height: number;
}

function textColorFor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return relativeLuminance(r, g, b) > 0.42 ? 'rgba(0,0,0,.62)' : 'rgba(255,255,255,.82)';
}

export function renderPattern(
  canvas: HTMLCanvasElement,
  pattern: Pattern,
  opts: RenderOptions,
): RenderResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const { width: w, height: h, cells, palette } = pattern;

  const cell = opts.cellSize
    ? opts.cellSize
    : Math.max(2, Math.floor(Math.min(opts.maxWidth / w, opts.maxHeight / h)));

  const cw = cell * w;
  const ch = cell * h;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  // 1. 色块
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = cells[y * w + x];
      if (idx === EMPTY_CELL) continue;
      ctx.fillStyle = palette[idx].hex;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // 2. 网格线
  if (cell >= 5) {
    ctx.strokeStyle = 'rgba(0,0,0,.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * cell + 0.25, 0);
      ctx.lineTo(x * cell + 0.25, ch);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * cell + 0.25);
      ctx.lineTo(cw, y * cell + 0.25);
    }
    ctx.stroke();
  }

  // 3. 分板线（29 格一块底板）
  if (opts.showBoard && cell >= 3) {
    ctx.strokeStyle = 'rgba(255,122,69,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = BOARD_SIZE; x < w; x += BOARD_SIZE) {
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, ch);
    }
    for (let y = BOARD_SIZE; y < h; y += BOARD_SIZE) {
      ctx.moveTo(0, y * cell);
      ctx.lineTo(cw, y * cell);
    }
    ctx.stroke();
  }

  // 4. 色号（太小就不画了，画了也看不清）
  if (opts.showCode && cell >= 14) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(7, Math.min(cell * 0.42, 11));
    ctx.font = `500 ${fs}px ui-monospace, "SF Mono", Menlo, monospace`;

    const colorCache = new Map<number, string>();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = cells[y * w + x];
        if (idx === EMPTY_CELL) continue;

        let tc = colorCache.get(idx);
        if (!tc) {
          tc = textColorFor(palette[idx].hex);
          colorCache.set(idx, tc);
        }
        ctx.fillStyle = tc;
        ctx.fillText(
          palette[idx].code,
          x * cell + cell / 2,
          y * cell + cell / 2 + 0.5,
        );
      }
    }
  }

  return { cellSize: cell, width: cw, height: ch };
}

/** 导出高分辨率 PNG（每格固定 12px，方便打印或放大看色号） */export async function exportPatternPng(
  pattern: Pattern,
  opts: { showCode: boolean; showBoard: boolean; cellSize?: number },
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderPattern(canvas, pattern, {
    showCode: opts.showCode,
    showBoard: opts.showBoard,
    maxWidth: Infinity,
    maxHeight: Infinity,
    cellSize: opts.cellSize ?? 12,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('导出失败'));
    }, 'image/png');
  });
}

/**
 * 把一张低分辨率光栅图放大画出来（最近邻，保留色块感）。
 *
 * 用途：展示「算法实际看到的图」——降采样后的 w×h 像素。
 * 对比它和最终图纸，就能判断是算法毁图，还是原图信息本来就不够。
 */
export function renderRaster(
  canvas: HTMLCanvasElement,
  raster: RasterImage,
  maxWidth: number,
  maxHeight: number,
): { cellSize: number; width: number; height: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const { width: w, height: h, data } = raster;
  const cell = Math.max(2, Math.floor(Math.min(maxWidth / w, maxHeight / h)));
  const cw = cell * w;
  const ch = cell * h;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // 透明区域画棋盘格底，避免看起来像白色
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const a = data[p + 3] / 255;
      if (a === 0) continue;
      ctx.fillStyle = `rgba(${data[p]},${data[p + 1]},${data[p + 2]},${a})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  return { cellSize: cell, width: cw, height: ch };
}

/**
 * 等比缩放画一张图（平滑插值）。
 * 用于「原始图片」这种本身分辨率就够高的参考图，不适合用色块放大。
 */
export function renderRasterFit(
  canvas: HTMLCanvasElement,
  raster: RasterImage,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const { width: w, height: h, data } = raster;
  const scale = Math.min(maxWidth / w, maxHeight / h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  if (!tctx) return { width: cw, height: ch };
  tctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, cw, ch);

  return { width: cw, height: ch };
}
