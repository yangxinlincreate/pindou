import type { Pattern, PatternColor, PatternStats } from '../types';
import { BOARD_SIZE, EMPTY_CELL } from '../types';

/**
 * 压缩调色板：去掉用量为 0 的颜色，重排索引。
 * 去噪之后常有颜色被彻底替换掉，留着会让用量清单出现「0 颗」的怪行。
 */
export function compactPalette(
  cells: Uint8Array,
  palette: PatternColor[],
): { cells: Uint8Array; palette: PatternColor[] } {
  const counts = new Array<number>(palette.length).fill(0);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c !== EMPTY_CELL) counts[c]++;
  }

  const keep: number[] = [];
  for (let i = 0; i < palette.length; i++) if (counts[i] > 0) keep.push(i);
  if (keep.length === palette.length) {
    const next = palette.map((p, i) => ({ ...p, count: counts[i] }));
    return { cells, palette: next };
  }

  const remap = new Int32Array(palette.length).fill(-1);
  keep.forEach((oldIdx, newIdx) => {
    remap[oldIdx] = newIdx;
  });

  const nextCells = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    nextCells[i] = c === EMPTY_CELL ? EMPTY_CELL : remap[c];
  }

  const nextPalette = keep.map((oldIdx) => ({
    ...palette[oldIdx],
    count: counts[oldIdx],
  }));

  return { cells: nextCells, palette: nextPalette };
}

/** 按用量降序排列（用量清单就是这个顺序，用户最关心大头的颜色够不够） */
export function sortPaletteByUsage(palette: PatternColor[]): PatternColor[] {
  return [...palette].sort((a, b) => b.count - a.count);
}

export function buildStats(
  width: number,
  height: number,
  cells: Uint8Array,
  palette: PatternColor[],
  beadSize: number,
): PatternStats {
  let total = 0;
  let emptyCells = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY_CELL) emptyCells++;
    else total++;
  }

  const boardsX = Math.ceil(width / BOARD_SIZE);
  const boardsY = Math.ceil(height / BOARD_SIZE);

  return {
    total,
    colorCount: palette.length,
    emptyCells,
    boardsX,
    boardsY,
    boardsTotal: boardsX * boardsY,
    widthCm: +(width * beadSize / 10).toFixed(1),
    heightCm: +(height * beadSize / 10).toFixed(1),
    restockCount: palette.filter((p) => p.owned === false).length,
    avgDelta: 0,
  };
}

export function createPattern(
  width: number,
  height: number,
  cells: Uint8Array,
  palette: PatternColor[],
  meta: { mode: Pattern['mode']; beadSize: number; seriesId: string },
): Pattern {
  const compacted = compactPalette(cells, palette);
  const sorted = sortPaletteByUsage(compacted.palette);

  // 重新按 sorted 顺序排 cells，保证「用量清单顺序」和「palette 索引」一致
  const order = compacted.palette.map((p) => p.code);
  const sortedIndex = new Map<string, number>();
  sorted.forEach((p, i) => sortedIndex.set(p.code, i));

  const remap = new Int32Array(compacted.palette.length);
  compacted.palette.forEach((p, oldIdx) => {
    remap[oldIdx] = sortedIndex.get(p.code) ?? oldIdx;
  });

  const finalCells = new Uint8Array(cells.length);
  for (let i = 0; i < finalCells.length; i++) {
    const c = compacted.cells[i];
    finalCells[i] = c === EMPTY_CELL ? EMPTY_CELL : remap[c];
  }

  return {
    width,
    height,
    mode: meta.mode,
    beadSize: meta.beadSize,
    seriesId: meta.seriesId,
    palette: sorted,
    cells: finalCells,
    stats: buildStats(width, height, finalCells, sorted, meta.beadSize),
  };
}
