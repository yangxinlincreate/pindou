import type { LAB } from './color/space';

/** RGBA 光栅图。data 长度 = width * height * 4。 */
export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** 色卡里的一个色号 */
export interface CatalogColor {
  /** 全局唯一，如 'mard-221:A1' */
  id: string;
  /** 用户看到的色号，如 'A1' */
  code: string;
  name?: string;
  hex: string;
  lab: LAB;
  finish?: 'solid' | 'matte' | 'pearl' | 'glitter' | 'translucent' | 'glow' | 'fluorescent';
  /** 色值可信度，用于界面披露 */
  confidence?: 'measured' | 'medium' | 'low' | 'public';
}

/** 一个系列（品牌 + 色数版本） */
export interface ColorSeries {
  id: string;
  brandName: string;
  beadSize: number;
  version: string;
  colors: CatalogColor[];
  sets?: ColorSet[];
}

export interface ColorSet {
  id: string;
  name: string;
  codes: string[];
}

export type ConvertMode = 'photo' | 'import';

/** 图纸里用到的颜色 */
export interface PatternColor {
  colorId: string;
  code: string;
  name?: string;
  hex: string;
  count: number;
  /** 该颜色在套装里是否已有 */
  owned?: boolean;
}

/**
 * 图纸。
 *
 * cells 用 Uint8Array 存调色板索引：
 *   0..254 = palette 下标
 *   255    = 空格（透明区域，不摆豆）
 *
 * 调色板最多 255 色，够用。
 */
export interface Pattern {
  width: number;
  height: number;
  mode: ConvertMode;
  beadSize: number;
  seriesId: string;
  palette: PatternColor[];
  cells: Uint8Array;
  stats: PatternStats;
}

export interface PatternStats {
  total: number;
  colorCount: number;
  /** 空格数（透明不摆豆） */
  emptyCells: number;
  boardsX: number;
  boardsY: number;
  boardsTotal: number;
  /** 成品尺寸，cm */
  widthCm: number;
  heightCm: number;
  /** 需要补货的颜色数 */
  restockCount: number;
  /**
   * 平均色差：每格原色与它被分配到的色号之间的 ΔE00 均值。
   * 这是「配色准不准」的客观指标，也是自动调参的依据。
   */
  avgDelta: number;
}

export const EMPTY_CELL = 255;
export const BOARD_SIZE = 29;

/** 焦点的聚类中心 */
export interface Centroid {
  L: number;
  a: number;
  b: number;
}
