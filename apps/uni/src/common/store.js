/**
 * 极简全局状态。
 *
 * uni-app 里页面之间传大对象（图纸含 13 万格 Uint8Array）不能走 URL 参数，
 * 用一个模块单例最省事。小程序端是单页应用，模块实例跨页面保持。
 */
import series from './mard-221.js';

const store = {
  /** 色卡（MARD 221） */
  series,
  /** 当前生成的图纸，预览页与用量页读它 */
  pattern: null,
  /** 原图像素，预览页调参数时用它重新生成 */
  raster: null,
  /** 上次生成的参数：{ mode, gridSize, colorCount, setCodes, detectedGrid } */
  params: null,
  /** 用户选的套装 id，空表示不限 */
  setId: '',
};

export default store;
